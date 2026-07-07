const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { create } = require('xmlbuilder2');

const IOS_EPOCH_DIFF = 978307200; // seconds between 1970-01-01 and 2001-01-01

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
  const u8 = new Uint8Array(fileBuffer);
  return new SQL.Database(u8);
}

async function fetchMessages(chatDbPath) {
  const db = await openDb(chatDbPath);

  const query = `
        SELECT
            m.ROWID AS id,
            m.text AS body,
            m.date AS date,
            m.date_read AS date_read,
            m.is_from_me AS is_from_me,
            m.service AS service,
            h.id AS handle
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE m.text IS NOT NULL
        ORDER BY m.date ASC
    `;

  const stmt = db.prepare(query);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  db.close();
  return rows;
}

async function listContacts(chatDbPath) {
  const db = await openDb(chatDbPath);

  const query = `
        SELECT
            h.id AS handle,
            COUNT(m.ROWID) AS message_count,
            MAX(m.date) AS last_date
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE h.id IS NOT NULL
        GROUP BY h.id
        ORDER BY last_date DESC
    `;

  const stmt = db.prepare(query);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  db.close();

  return rows.map(row => ({
    handle: row.handle,
    messageCount: row.message_count,
    lastDateMs: iosTimestampToUnixMs(row.last_date)
  }));
}

async function fetchThreadForHandle(chatDbPath, handle) {
  const db = await openDb(chatDbPath);

  const query = `
        SELECT
            DISTINCT m.ROWID AS id,
            m.text AS body,
            m.date AS date,
            m.date_read AS date_read,
            m.is_from_me AS is_from_me
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat_handle_join chj ON chj.chat_id = cmj.chat_id
        JOIN handle h ON h.ROWID = chj.handle_id
        WHERE h.id = ? AND m.text IS NOT NULL
        ORDER BY m.date ASC
    `;

  const stmt = db.prepare(query);
  stmt.bind([handle]);

  const messages = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    messages.push({
      id: row.id,
      body: row.body,
      isFromMe: !!row.is_from_me,
      dateMs: iosTimestampToUnixMs(row.date)
    });
  }

  stmt.free();
  db.close();

  return messages;
}

function buildSmsBackupXml(messages) {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('smses');

  let count = 0;

  for (const msg of messages) {
    let address = msg.handle || '';
    const body = msg.body || '';
    const isFromMe = msg.is_from_me || 0;
    const dateMs = iosTimestampToUnixMs(msg.date);

    if (!body) continue;

    if (!address) address = 'unknown';

    const finalDateMs = dateMs ?? Date.now();

    root.ele('sms', {
      protocol: '0',
      address,
      date: String(finalDateMs),
      type: isFromMe ? '2' : '1',
      subject: 'null',
      body,
      toa: 'null',
      sc_toa: 'null',
      read: msg.date_read ? '1' : '0',
      status: '-1',
      locked: '0',
      date_sent: String(finalDateMs)
    });

    count += 1;
  }

  root.att('count', String(count));

  return root.end({ prettyPrint: true });
}

function buildSmsBackupXmlForHandle(messages, handle) {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('smses');

  let count = 0;

  for (const msg of messages) {
    const body = msg.body || '';
    if (!body) continue;

    const dateMs = iosTimestampToUnixMs(msg.date);
    const finalDateMs = dateMs ?? Date.now();

    root.ele('sms', {
      protocol: '0',
      address: handle || 'unknown',
      date: String(finalDateMs),
      type: msg.is_from_me ? '2' : '1',
      subject: 'null',
      body,
      toa: 'null',
      sc_toa: 'null',
      read: msg.date_read ? '1' : '0',
      status: '-1',
      locked: '0',
      date_sent: String(finalDateMs)
    });

    count += 1;
  }

  root.att('count', String(count));

  return root.end({ prettyPrint: true });
}

async function convertIphoneSmsToXml(chatDbPath, outputPath) {
  if (!fs.existsSync(chatDbPath)) {
    throw new Error(`chat.db not found at: ${chatDbPath}`);
  }

  const messages = await fetchMessages(chatDbPath);
  const xml = buildSmsBackupXml(messages);

  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, xml, 'utf8');
}

async function convertThreadToXml(chatDbPath, handle, outputPath) {
  if (!fs.existsSync(chatDbPath)) {
    throw new Error(`chat.db not found at: ${chatDbPath}`);
  }
  if (!handle) {
    throw new Error('No contact selected.');
  }

  const db = await openDb(chatDbPath);
  const query = `
        SELECT
            DISTINCT m.ROWID AS id,
            m.text AS body,
            m.date AS date,
            m.date_read AS date_read,
            m.is_from_me AS is_from_me
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat_handle_join chj ON chj.chat_id = cmj.chat_id
        JOIN handle h ON h.ROWID = chj.handle_id
        WHERE h.id = ? AND m.text IS NOT NULL
        ORDER BY m.date ASC
    `;

  const stmt = db.prepare(query);
  stmt.bind([handle]);

  const messages = [];
  while (stmt.step()) {
    messages.push(stmt.getAsObject());
  }

  stmt.free();
  db.close();

  const xml = buildSmsBackupXmlForHandle(messages, handle);

  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, xml, 'utf8');
}

module.exports = {
  convertIphoneSmsToXml,
  convertThreadToXml,
  listContacts,
  fetchThreadForHandle
};
