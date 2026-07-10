"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMessageSummary = parseMessageSummary;
const typedstream_parser_1 = require("./typedstream-parser");
/**
 * Minimal binary plist (bplist00) parser sufficient to decode
 * the top-level structure of chat.db `message_summary_info` blobs.
 *
 * Reference: https://opensource.apple.com/source/CF/CF-550/CFBinaryPList.c
 */
function parseBplist(buf) {
    if (buf.length < 40)
        return null;
    const magic = buf.slice(0, 8).toString('ascii');
    if (!magic.startsWith('bplist00'))
        return null;
    // The 32-byte trailer lives at the very end.
    const trailer = buf.slice(buf.length - 32);
    const offsetIntSize = trailer[6];
    const objectRefSize = trailer[7];
    const numObjects = Number(trailer.readBigUInt64BE(8));
    const topObject = Number(trailer.readBigUInt64BE(16));
    const offsetTableOffset = Number(trailer.readBigUInt64BE(24));
    // Build the offset table.
    const offsets = [];
    for (let i = 0; i < numObjects; i++) {
        const tablePos = offsetTableOffset + i * offsetIntSize;
        let offset = 0;
        for (let j = 0; j < offsetIntSize; j++) {
            offset = offset * 256 + buf[tablePos + j];
        }
        offsets.push(offset);
    }
    function readRef(pos) {
        let v = 0;
        for (let i = 0; i < objectRefSize; i++)
            v = (v << 8) | buf[pos + i];
        return v;
    }
    function readBEInt(pos, n) {
        let v = 0;
        for (let i = 0; i < n; i++)
            v = v * 256 + buf[pos + i];
        return v;
    }
    function parseAt(idx) {
        if (idx < 0 || idx >= offsets.length)
            return null;
        const pos = offsets[idx];
        const marker = buf[pos];
        const type = (marker & 0xf0) >> 4;
        const info = marker & 0x0f;
        switch (type) {
            case 0x0: // null / bool / fill
                if (info === 0x8)
                    return false;
                if (info === 0x9)
                    return true;
                return null;
            case 0x1: { // integer
                const n = 1 << info;
                return readBEInt(pos + 1, n);
            }
            case 0x2: { // float — not needed but return approximate
                if (info === 2)
                    return buf.readFloatBE(pos + 1);
                if (info === 3)
                    return buf.readDoubleBE(pos + 1);
                return null;
            }
            case 0x3: // date
                return buf.readDoubleBE(pos + 1);
            case 0x4: { // data (NSData)
                let count = info;
                let start = 1;
                if (info === 0xf) {
                    const lenMarker = buf[pos + 1];
                    const lenN = 1 << (lenMarker & 0x0f);
                    count = readBEInt(pos + 2, lenN);
                    start = 2 + lenN;
                }
                return { _bplistData: true, data: buf.slice(pos + start, pos + start + count) };
            }
            case 0x5: { // ASCII string
                let count = info;
                let start = 1;
                if (info === 0xf) {
                    const lenMarker = buf[pos + 1];
                    const lenN = 1 << (lenMarker & 0x0f);
                    count = readBEInt(pos + 2, lenN);
                    start = 2 + lenN;
                }
                return buf.slice(pos + start, pos + start + count).toString('ascii');
            }
            case 0x6: { // Unicode string (UTF-16 big-endian)
                let count = info;
                let start = 1;
                if (info === 0xf) {
                    const lenMarker = buf[pos + 1];
                    const lenN = 1 << (lenMarker & 0x0f);
                    count = readBEInt(pos + 2, lenN);
                    start = 2 + lenN;
                }
                return buf.slice(pos + start, pos + start + count * 2).swap16().toString('utf16le');
            }
            case 0xa: { // array
                let count = info;
                let start = 1;
                if (info === 0xf) {
                    const lenMarker = buf[pos + 1];
                    const lenN = 1 << (lenMarker & 0x0f);
                    count = readBEInt(pos + 2, lenN);
                    start = 2 + lenN;
                }
                const arr = [];
                for (let i = 0; i < count; i++) {
                    arr.push(parseAt(readRef(pos + start + i * objectRefSize)));
                }
                return arr;
            }
            case 0xd: { // dict
                let count = info;
                let start = 1;
                if (info === 0xf) {
                    const lenMarker = buf[pos + 1];
                    const lenN = 1 << (lenMarker & 0x0f);
                    count = readBEInt(pos + 2, lenN);
                    start = 2 + lenN;
                }
                const keysStart = pos + start;
                const valsStart = keysStart + count * objectRefSize;
                const d = {};
                for (let i = 0; i < count; i++) {
                    const k = parseAt(readRef(keysStart + i * objectRefSize));
                    const v = parseAt(readRef(valsStart + i * objectRefSize));
                    if (typeof k === 'string')
                        d[k] = v;
                    else if (typeof k === 'number')
                        d[String(k)] = v;
                }
                return d;
            }
            default:
                return null;
        }
    }
    return parseAt(topObject);
}
/**
 * Pick the best string from a TypedStreamParser run over an attributed-text blob.
 * The parser can return duplicate or near-duplicate strings (raw + cleaned); we
 * take the first non-empty one (single-character edits like "k" are valid).
 */
function extractTextFromTypedBlob(blob) {
    try {
        const parser = new typedstream_parser_1.TypedStreamParser(blob);
        const strings = parser.parseAllNSStrings();
        for (const s of strings) {
            const trimmed = s.content.trim();
            if (trimmed.length > 0)
                return trimmed;
        }
        // Fallback: extract readable text
        const parser2 = new typedstream_parser_1.TypedStreamParser(blob);
        const texts = parser2.extractReadableText();
        for (const t of texts) {
            const trimmed = t.trim();
            if (trimmed.length > 0)
                return trimmed;
        }
    }
    catch {
        // parsing failed — skip
    }
    return null;
}
/**
 * Decode a `message_summary_info` blob from chat.db.
 *
 * The blob is a binary plist (bplist00) that Apple's Messages app writes when
 * a message is edited or unsent.  Its top-level keys:
 *   - `ec`   — dict of message-part-index → array of edit entries (each with
 *              `t` = typedstream attributed-text blob, `d` = Core Data timestamp)
 *   - `ust`  — boolean, true on virtually every row
 *   - `ams`  — abbreviated summary of the current/retracted text (if present)
 *
 * @returns `editedTexts` — ordered prior revisions extracted from `ec[*][*].t`
 *                          (oldest first); empty when no edit history.
 *          `unsent`      — true when the message was retracted: no `ec` key
 *                          (no edit chain) and `ust` is true, i.e. the body
 *                          was removed entirely.
 */
function parseMessageSummary(buf) {
    if (!buf || buf.length === 0)
        return { editedTexts: [], unsent: false };
    const plist = parseBplist(buf);
    if (!plist || typeof plist !== 'object')
        return { editedTexts: [], unsent: false };
    const editedTexts = [];
    // `ec` is a dict keyed by part-index strings ("0", "1", …)
    const ec = plist['ec'];
    const hasEditChain = !!ec && typeof ec === 'object' && !Array.isArray(ec);
    if (hasEditChain) {
        // Iterate parts in numeric order
        const partKeys = Object.keys(ec).sort((a, b) => Number(a) - Number(b));
        for (const partKey of partKeys) {
            const entries = Array.isArray(ec[partKey]) ? ec[partKey] : [];
            for (const entry of entries) {
                if (!entry || typeof entry !== 'object')
                    continue;
                const t = entry['t'];
                if (t && t._bplistData && Buffer.isBuffer(t.data)) {
                    const text = extractTextFromTypedBlob(t.data);
                    if (text !== null)
                        editedTexts.push(text);
                }
            }
        }
    }
    // A message is "unsent" (retracted) when there is no edit chain at all —
    // the sender removed the message body entirely — and `ust` is true. We key
    // off the *absence* of the `ec` key, not off `editedTexts.length`, so an
    // edited message whose text fails to decode is not misclassified as unsent.
    const ust = plist['ust'] === true;
    const unsent = ust && !hasEditChain;
    return { editedTexts, unsent };
}
//# sourceMappingURL=message-summary-parser.js.map