const { parseAttributedBody, parseMessageSummary } = require('./vendor/imessage-parser');

const METADATA_PATTERNS = [
  /^NS[A-Z]/,
  /^__kIM/,
  /^streamtyped$/,
  /^NSMutable/,
  /^NSDictionary$/,
  /^NSNumber$/,
  /^NSObject$/,
  /^NSValue$/,
  /^NSFont$/,
  /^NSParagraphStyle$/,
  /^NSColor$/,
  /^DDScannerResult$/,
  /^bplist/,
  /^X\$version/,
  /^Z\$classname$/,
  /^\$class$/
];

function toBuffer(value) {
  if (value == null) {
    return null;
  }

  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  if (typeof value === 'string') {
    if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
      try {
        return Buffer.from(value, 'hex');
      } catch {
        return Buffer.from(value, 'latin1');
      }
    }
    return Buffer.from(value, 'latin1');
  }

  return null;
}

function isGarbageBlobText(value) {
  if (!value) {
    return true;
  }

  const markers = [
    'streamtyped',
    'NSMutable',
    'NSAttributedString',
    'NSDictionary',
    'NSString',
    '__kIM',
    'NSObject',
    'NSValue',
    'NSFont',
    'bplist'
  ];

  return markers.some((marker) => value.includes(marker));
}

function hasBinaryArtifactShape(value) {
  const text = String(value || '');
  if (!text) {
    return true;
  }

  if (/[\u2400-\u243f\u2500-\u259f\ufffd]/u.test(text)) {
    return true;
  }

  const letters = text.match(/[A-Za-z]/g)?.length || 0;
  const spaces = text.match(/\s/g)?.length || 0;
  const cjk = text.match(/[\u3400-\u9fff\uf900-\ufaff]/gu)?.length || 0;
  const visible = text.replace(/\s/g, '').length;

  if (visible >= 20 && cjk / visible > 0.25 && letters / visible < 0.15) {
    return true;
  }

  if (visible >= 80 && spaces / text.length < 0.04 && letters / visible < 0.35 && !/^https?:\/\//i.test(text)) {
    return true;
  }

  return false;
}

function isLikelyReadableText(value) {
  if (value == null) {
    return false;
  }

  const text = String(value).replace(/\u0000/g, '').trim();
  if (!text) {
    return false;
  }

  if (/^[\uFFFD]+$/.test(text)) {
    return false;
  }

  if (isGarbageBlobText(text)) {
    return false;
  }

  if (hasBinaryArtifactShape(text)) {
    return false;
  }

  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code === 0xfffd || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
      return false;
    }
  }

  if (text.length <= 2 && !/[A-Za-z0-9]/.test(text) && !/[^\x00-\x7F]/.test(text)) {
    return false;
  }

  if (METADATA_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }

  return true;
}

function decodeAttributedBody(attributedBody) {
  const buffer = toBuffer(attributedBody);
  if (!buffer || !buffer.length) {
    return '';
  }

  try {
    const parsed = parseAttributedBody(buffer, { cleanOutput: true, includeMetadata: false });
    if (parsed?.text && isLikelyReadableText(parsed.text)) {
      return parsed.text.trim();
    }
  } catch {
    // Fall through to legacy heuristics.
  }

  return '';
}

function decodeMessageSummaryInfo(summaryBlob) {
  const buffer = toBuffer(summaryBlob);
  if (!buffer || !buffer.length) {
    return '';
  }

  try {
    const parsed = parseMessageSummary(buffer);
    if (typeof parsed === 'string' && isLikelyReadableText(parsed)) {
      return parsed.trim();
    }
    if (parsed?.editedTexts?.length) {
      const text = parsed.editedTexts.find((candidate) => isLikelyReadableText(candidate));
      if (text) {
        return String(text).trim();
      }
    }
  } catch {
    // Ignore summary parse failures.
  }

  return '';
}

function extractMessageBody(text, attributedBody, options = {}) {
  const plainText = text != null ? String(text).replace(/\u0000/g, '').trim() : '';
  const subjectText = options.subject != null ? String(options.subject).replace(/\u0000/g, '').trim() : '';
  const attributedText = decodeAttributedBody(attributedBody);
  const summaryText = decodeMessageSummaryInfo(options.messageSummaryInfo);

  const candidates = [plainText, attributedText, summaryText, subjectText]
    .map((candidate) => String(candidate || '').trim())
    .filter((candidate) => isLikelyReadableText(candidate));

  if (!candidates.length) {
    if (options.cacheHasAttachments) {
      return '[Attachment]';
    }
    return '';
  }

  return candidates[0];
}

module.exports = {
  extractMessageBody,
  decodeAttributedBody,
  isLikelyReadableText,
  toBuffer
};
