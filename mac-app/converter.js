const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { getHandleVariants, mapMessageRow } = require('./phone-utils');

const IOS_EPOCH_DIFF = 978307200;

let sqlPromise = null;

function getSql() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs();
  }
  return sqlPromise;
}

function iosTimestampToUnixMs(value) {
  if (value === null || value === undefined) return null;
  let v;
  try {
    v = Number(value);
  } catch {
    return null;
  }
  if (!Number.isFinite(v) || v === 0) return null;

  let seconds;
  if (v > 1_000_000_000_000_000) {
    seconds = v / 1_000_000_000 + IOS_EPOCH_DIFF;
  } else if (v > 1_000_000_000_000) {
    seconds = v / 1000;
  } else if (v > 1_000_000_000) {
    seconds = v;
  } else {
    seconds = v + IOS_EPOCH_DIFF;
  }

  return Math.floor(seconds * 1000);
}

async function openDb(chatDbPath) {
  const SQL = await getSql();
  const fileBuffer = fs.readFileSync(chatDbPath);
  return new SQL.Database(new Uint8Array(fileBuffer));
}

function buildThreadQuery(handleVariants) {
  const placeholders = handleVariants.map(() => '?').join(', ');

  return `
        SELECT DISTINCT
            m.ROWID AS id,
            m.text AS text,
            m.subject AS subject,
            hex(m.attributedBody) AS attributedBodyHex,
            hex(m.message_summary_info) AS messageSummaryInfoHex,
            m.date AS date,
            m.date_read AS date_read,
            m.is_from_me AS is_from_me,
            m.cache_has_attachments AS cache_has_attachments,
            h.id AS handle,
            m.cache_has_attachments AS has_attachment
        FROM message m
        JOIN handle h ON m.handle_id = h.ROWID
        WHERE h.id IN (${placeholders})

        UNION

        SELECT DISTINCT
            m.ROWID AS id,
            m.text AS text,
            m.subject AS subject,
            hex(m.attributedBody) AS attributedBodyHex,
            hex(m.message_summary_info) AS messageSummaryInfoHex,
            m.date AS date,
            m.date_read AS date_read,
            m.is_from_me AS is_from_me,
            m.cache_has_attachments AS cache_has_attachments,
            h.id AS handle,
            m.cache_has_attachments AS has_attachment
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat_handle_join chj ON chj.chat_id = cmj.chat_id
        JOIN handle h ON h.ROWID = chj.handle_id
        WHERE h.id IN (${placeholders})

        ORDER BY date ASC
    `;
}

function finalizeMessageRow(row) {
  const mapped = mapMessageRow({
    ...row,
    dateMs: iosTimestampToUnixMs(row.date)
  });

  if (!mapped.body) {
    mapped.body = mapped.hasAttachment ? '[Attachment]' : '[Message]';
  }

  return mapped;
}

function dedupeMessagesById(messages) {
  const seen = new Map();

  for (const message of messages) {
    const key = message.id ?? `${message.dateMs}-${message.body}-${message.isFromMe ? 1 : 0}`;
    if (!seen.has(key)) {
      seen.set(key, message);
    }
  }

  return Array.from(seen.values()).sort((a, b) => (a.dateMs || 0) - (b.dateMs || 0));
}

function escapeXmlAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildSmsBackupXmlCompact(messages, defaultAddress) {
  const exportMessages = messages.filter((message) => message.body && message.body !== '[Message]');
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<smses count="${exportMessages.length}">`
  ];

  for (const msg of exportMessages) {
    const dateMs = msg.dateMs ?? iosTimestampToUnixMs(msg.date) ?? Date.now();
    const isFromMe = msg.isFromMe ?? msg.is_from_me ?? 0;
    const address = escapeXmlAttribute(defaultAddress || msg.handle || 'unknown');
    const body = escapeXmlAttribute(msg.body);
    const read = msg.date_read ? '1' : '0';

    lines.push(
      `  <sms protocol="0" address="${address}" date="${dateMs}" type="${isFromMe ? '2' : '1'}" subject="null" body="${body}" toa="null" sc_toa="null" read="${read}" status="-1" locked="0" date_sent="${dateMs}"/>`
    );
  }

  lines.push('</smses>');
  return `${lines.join('\n')}\n`;
}

async function fetchMessages(chatDbPath) {
  const db = await openDb(chatDbPath);

  const query = `
        SELECT
            m.ROWID AS id,
            m.text AS text,
            m.subject AS subject,
            hex(m.attributedBody) AS attributedBodyHex,
            hex(m.message_summary_info) AS messageSummaryInfoHex,
            m.date AS date,
            m.date_read AS date_read,
            m.is_from_me AS is_from_me,
            m.service AS service,
            m.cache_has_attachments AS cache_has_attachments,
            h.id AS handle,
            m.cache_has_attachments AS has_attachment
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        ORDER BY m.date ASC
    `;

  const stmt = db.prepare(query);
  const rows = [];
  while (stmt.step()) {
    const mapped = finalizeMessageRow(stmt.getAsObject());
    if (mapped.body && mapped.body !== '[Message]') {
      rows.push(mapped);
    }
  }
  stmt.free();
  db.close();
  return rows;
}

async function listContacts(chatDbPath) {
  const db = await openDb(chatDbPath);

  const query = `
        SELECT
            handle,
            COUNT(DISTINCT message_id) AS message_count,
            MAX(date) AS last_date
        FROM (
            SELECT
                h.id AS handle,
                m.ROWID AS message_id,
                m.date AS date
            FROM message m
            JOIN handle h ON m.handle_id = h.ROWID
            WHERE h.id IS NOT NULL

            UNION

            SELECT
                h.id AS handle,
                m.ROWID AS message_id,
                m.date AS date
            FROM message m
            JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
            JOIN chat_handle_join chj ON chj.chat_id = cmj.chat_id
            JOIN handle h ON h.ROWID = chj.handle_id
            WHERE h.id IS NOT NULL
        )
        GROUP BY handle
        ORDER BY last_date DESC
    `;

  const stmt = db.prepare(query);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  db.close();

  return rows.map((row) => ({
    handle: row.handle,
    messageCount: row.message_count,
    lastDateMs: iosTimestampToUnixMs(row.last_date)
  }));
}

async function listOwnNumberSuggestions(chatDbPath) {
  const db = await openDb(chatDbPath);
  const suggestions = new Map();

  try {
    const accountStmt = db.prepare(`
      SELECT login, account, service
      FROM account
      WHERE login IS NOT NULL OR account IS NOT NULL
    `);

    while (accountStmt.step()) {
      const row = accountStmt.getAsObject();
      for (const key of ['login', 'account']) {
        const value = row[key];
        if (value) {
          suggestions.set(String(value), Number.MAX_SAFE_INTEGER);
        }
      }
    }
    accountStmt.free();
  } catch {
    // Older chat.db snapshots may not include account metadata.
  }

  const handleStmt = db.prepare(`
        SELECT
            h.id AS handle,
            COUNT(m.ROWID) AS message_count
        FROM message m
        JOIN handle h ON m.handle_id = h.ROWID
        WHERE h.id IS NOT NULL
        GROUP BY h.id
        ORDER BY message_count DESC
    `);

  while (handleStmt.step()) {
    const row = handleStmt.getAsObject();
    const handle = String(row.handle);
    const count = Number(row.message_count || 0);
    if (!suggestions.has(handle) || suggestions.get(handle) < count) {
      suggestions.set(handle, count);
    }
  }

  handleStmt.free();
  db.close();

  return Array.from(suggestions.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([handle]) => handle);
}

async function fetchThreadForHandle(chatDbPath, handle, options = {}) {
  const handleVariants = getHandleVariants(handle);
  if (!handleVariants.length) {
    return {
      messages: [],
      totalCount: 0,
      previewLimit: options.previewLimit ?? null
    };
  }

  const db = await openDb(chatDbPath);
  const query = buildThreadQuery(handleVariants);
  const stmt = db.prepare(query);
  stmt.bind([...handleVariants, ...handleVariants]);

  const rawMessages = [];
  while (stmt.step()) {
    rawMessages.push(finalizeMessageRow(stmt.getAsObject()));
  }

  stmt.free();
  db.close();

  const allMessages = dedupeMessagesById(rawMessages);
  const totalCount = allMessages.length;
  const previewLimit = Number(options.previewLimit) > 0 ? Number(options.previewLimit) : null;
  const messages = previewLimit ? allMessages.slice(0, previewLimit) : allMessages;

  return {
    messages,
    totalCount,
    previewLimit
  };
}

async function convertIphoneSmsToXml(chatDbPath, outputPath) {
  if (!fs.existsSync(chatDbPath)) {
    throw new Error(`chat.db not found at: ${chatDbPath}`);
  }

  const messages = await fetchMessages(chatDbPath);
  const xml = buildSmsBackupXmlCompact(messages);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, xml, 'utf8');
}

async function convertThreadToXml(chatDbPath, handle, outputPath) {
  if (!fs.existsSync(chatDbPath)) {
    throw new Error(`chat.db not found at: ${chatDbPath}`);
  }
  if (!handle) {
    throw new Error('No contact selected.');
  }

  const { messages } = await fetchThreadForHandle(chatDbPath, handle);
  const exportMessages = messages.filter((message) => message.body && message.body !== '[Message]');
  if (!exportMessages.length) {
    throw new Error('No readable messages were found for this contact.');
  }

  const xml = buildSmsBackupXmlCompact(exportMessages, handle);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, xml, 'utf8');

  return {
    messageCount: exportMessages.length
  };
}

module.exports = {
  convertIphoneSmsToXml,
  convertThreadToXml,
  listContacts,
  listOwnNumberSuggestions,
  fetchThreadForHandle,
  buildSmsBackupXmlCompact
};
