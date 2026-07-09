import argparse
import sqlite3
import time
from pathlib import Path
from typing import Optional, Iterable
import xml.etree.ElementTree as ET


IOS_EPOCH_DIFF = 978307200  # Seconds between 1970-01-01 and 2001-01-01


def ios_timestamp_to_unix_ms(value: Optional[int]) -> Optional[int]:
    if value is None:
        return None
    try:
        v = int(value)
    except (TypeError, ValueError):
        return None

    if v == 0:
        return None

    # Heuristics for different iOS schema variants
    if v > 1_000_000_000_000_000:  # nanoseconds since 2001
        seconds = v / 1_000_000_000 + IOS_EPOCH_DIFF
    elif v > 1_000_000_000_000:  # milliseconds since 1970
        seconds = v / 1000
    elif v > 1_000_000_000:  # seconds since 1970
        seconds = v
    else:  # seconds since 2001
        seconds = v + IOS_EPOCH_DIFF

    return int(seconds * 1000)


def fetch_messages(chat_db: Path) -> Iterable[dict]:
    conn = sqlite3.connect(str(chat_db))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    query = """
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
    """

    cur.execute(query)
    for row in cur.fetchall():
        yield dict(row)

    conn.close()


def build_sms_backup_xml(messages: Iterable[dict]) -> ET.ElementTree:
    root = ET.Element("smses")
    count = 0

    for msg in messages:
        address = msg.get("handle") or ""
        body = msg.get("body") or ""
        is_from_me = msg.get("is_from_me") or 0
        date_ms = ios_timestamp_to_unix_ms(msg.get("date"))

        if not body:
            continue

        if not address:
            address = "unknown"

        if date_ms is None:
            # Fallback to current time to keep XML valid
            date_ms = int(time.time() * 1000)

        sms = ET.SubElement(root, "sms")
        sms.set("protocol", "0")
        sms.set("address", address)
        sms.set("date", str(date_ms))
        sms.set("type", "2" if is_from_me else "1")  # 1=inbox, 2=sent
        sms.set("subject", "null")
        sms.set("body", body)
        sms.set("toa", "null")
        sms.set("sc_toa", "null")
        sms.set("read", "1" if msg.get("date_read") else "0")
        sms.set("status", "-1")
        sms.set("locked", "0")
        sms.set("date_sent", str(date_ms))

        count += 1

    root.set("count", str(count))
    return ET.ElementTree(root)


def convert(chat_db_path: Path, output_path: Path) -> None:
    messages = list(fetch_messages(chat_db_path))
    tree = build_sms_backup_xml(messages)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tree.write(output_path, encoding="utf-8", xml_declaration=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Convert an iPhone Messages chat.db database into "
            "an SMS Backup & Restore compatible XML file."
        )
    )
    parser.add_argument(
        "--chat-db",
        required=True,
        type=Path,
        help="Path to the iOS chat.db SQLite database file.",
    )
    parser.add_argument(
        "--output",
        required=True,
        type=Path,
        help="Path to write the SMS Backup & Restore XML file.",
    )

    args = parser.parse_args()

    if not args.chat_db.exists():
        raise SystemExit(f"chat.db not found at: {args.chat_db}")

    convert(args.chat_db, args.output)
    print(f"Wrote SMS backup XML to: {args.output}")


if __name__ == "__main__":
    main()

