const { extractMessageBody, toBuffer } = require('./message-body');

function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function getHandleVariants(handle) {
  const raw = String(handle || '').trim();
  const variants = new Set();
  if (!raw) {
    return [];
  }

  variants.add(raw);

  const digits = normalizePhoneDigits(raw);
  if (!digits) {
    return Array.from(variants);
  }

  variants.add(digits);
  variants.add(`+${digits}`);

  if (digits.startsWith('61') && digits.length >= 11) {
    variants.add(`0${digits.slice(2)}`);
    variants.add(`+${digits}`);
  }

  if (digits.startsWith('0') && digits.length >= 10) {
    variants.add(`+61${digits.slice(1)}`);
    variants.add(`61${digits.slice(1)}`);
  }

  if (digits.length >= 9) {
    variants.add(digits.slice(-9));
  }

  return Array.from(variants);
}

function phonesMatch(a, b) {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  if (!da || !db) {
    return false;
  }

  if (da === db) {
    return true;
  }

  if (da.endsWith(db) || db.endsWith(da)) {
    return true;
  }

  if (da.length >= 9 && db.length >= 9 && da.slice(-9) === db.slice(-9)) {
    return true;
  }

  return false;
}

function hexToBuffer(hexValue) {
  if (!hexValue) {
    return null;
  }

  const hex = String(hexValue).trim();
  if (!hex || hex.length % 2 !== 0) {
    return null;
  }

  try {
    return Buffer.from(hex, 'hex');
  } catch {
    return null;
  }
}

function rowAttributedBody(row) {
  const fromHex = hexToBuffer(row.attributedBodyHex);
  if (fromHex?.length) {
    return fromHex;
  }

  return toBuffer(row.attributedBody);
}

function mapMessageRow(row) {
  const hasAttachment = !!(row.has_attachment || row.cache_has_attachments);
  const body = extractMessageBody(row.text ?? row.body, rowAttributedBody(row), {
    cacheHasAttachments: hasAttachment,
    subject: row.subject,
    messageSummaryInfo: row.messageSummaryInfoHex
      ? hexToBuffer(row.messageSummaryInfoHex)
      : row.message_summary_info
  });

  return {
    id: row.id,
    body: body || (hasAttachment ? '[Attachment]' : ''),
    isFromMe: !!row.is_from_me,
    is_from_me: row.is_from_me || 0,
    dateMs: row.dateMs,
    date: row.date,
    date_read: row.date_read,
    handle: row.handle || null,
    hasAttachment
  };
}

module.exports = {
  normalizePhoneDigits,
  getHandleVariants,
  phonesMatch,
  hexToBuffer,
  rowAttributedBody,
  mapMessageRow
};
