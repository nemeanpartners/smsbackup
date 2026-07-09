## Desktop Converter

Python-based desktop tool that converts an iPhone `chat.db` (from a local iTunes/iPhone backup) into an SMS Backup & Restore compatible XML file that can be imported on Android.

### Requirements

- Python 3.8+
- A copy of your iPhone's `chat.db` (you can extract this from a local backup using tools like iMazing, iExplorer, or via manual backup extraction).

### Usage

From this directory:

```bash
python convert_iphone_sms.py --chat-db /path/to/chat.db --output /path/to/output/sms_export.xml
```

You can then transfer `sms_export.xml` onto your Android device (via USB, AirDrop, email, cloud drive, etc.) and import it using the Android app in this project or any SMS Backup & Restore compatible tool.

