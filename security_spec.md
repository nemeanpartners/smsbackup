# Security Specification & Threat Model for Message Backup Web Dashboard

## 1. Data Invariants
- **Owner Identity**: Users can only read, create, update, or delete profiles where `userId` matches their authenticated `request.auth.uid`.
- **Backup Authorization**: No user can access or modify backup run logs, chat metadata, or raw message text unless the resource's `userId` matches `request.auth.uid`.
- **System Integrity (API Tokens)**: Users can generate or rotate their `apiToken` but cannot write arbitrary fields or set other fields except their valid details.
- **Service Verification**: Service parameter in `Chat` must correspond to standard protocols ("iMessage", "SMS", "WhatsApp").
- **Timestamp Accuracy**: Document timestamps (`createdAt`, `updatedAt`) must strictly reflect the server time `request.time`.

---

## 2. The "Dirty Dozen" Malicious Payloads (Vulnerability Vector Map)

### Payload 1: Profile Elevation & Identity Spoofing (Attempt to edit user profile of another UID)
- **Target Collection**: `users/victim-uid`
- **Operation**: `create` or `update`
- **Malicious Payload**:
  ```json
  {
    "userId": "victim-uid",
    "email": "attacker@spam.org",
    "displayName": "Spoofed Attacker",
    "apiToken": "malicious-takeover-token"
  }
  ```
- **Expectation**: `PERMISSION_DENIED` - UID does not match auth context.

### Payload 2: Ghost Field Injection (Shadow Update)
- **Target Collection**: `users/attacker-uid`
- **Operation**: `update`
- **Malicious Payload**:
  ```json
  {
    "userId": "attacker-uid",
    "email": "attacker@gmail.com",
    "apiToken": "some-generated-token",
    "ghostField": "malicious-payload-data"
  }
  ```
- **Expectation**: `PERMISSION_DENIED` - Affected keys must be limited to whitelisted fields via `hasOnly()`.

### Payload 3: Backup Poisoning (Injecting huge inputs)
- **Target Collection**: `backups`
- **Operation**: `create`
- **Malicious Payload**:
  ```json
  {
    "backupId": "backup-12345",
    "userId": "attacker-uid",
    "deviceName": "A".repeat(1000000), // Huge 1MB string
    "status": "completed",
    "createdAt": "2026-06-05T00:00:00Z"
  }
  ```
- **Expectation**: `PERMISSION_DENIED` - Device name size must be restricted (`<= 128` characters).

### Payload 4: Orphaned Backup Insertion (Attributing backup to another user)
- **Target Collection**: `backups`
- **Operation**: `create`
- **Malicious Payload**:
  ```json
  {
    "backupId": "backup-99999",
    "userId": "victim-uid",
    "deviceName": "Macbook Air",
    "status": "completed",
    "createdAt": "request.time"
  }
  ```
- **Expectation**: `PERMISSION_DENIED` - Users cannot create backups under other accounts.

### Payload 5: Spoofing Verification (Creating mock message without verified email)
- **Target Collection**: `backups`
- **Operation**: `create`
- **Sign-in Auth State**: `email_verified` is `false`
- **Expectation**: `PERMISSION_DENIED` - Requires `request.auth.token.email_verified == true`.

### Payload 6: Chat Spoofing (Creating chats with unlisted services)
- **Target Collection**: `chats`
- **Operation**: `create`
- **Malicious Payload**:
  ```json
  {
    "chatId": "chat-abc",
    "userId": "attacker-uid",
    "backupId": "backup-123",
    "service": "MaliciousCustomIM",
    "contactName": "Target Friend",
    "contactIdentifier": "+1234567890"
  }
  ```
- **Expectation**: `PERMISSION_DENIED` - Service must strictly be in enum values: `["iMessage", "SMS", "WhatsApp"]`.

### Payload 7: Relational Sync Bypass (Inserting messages into non-existent backups)
- **Target Collection**: `messages`
- **Operation**: `create`
- **Malicious Payload**:
  ```json
  {
    "messageId": "msg-999",
    "userId": "attacker-uid",
    "chatId": "non-existent-chat-id",
    "text": "Hello world",
    "isFromMe": true,
    "timestamp": "request.time"
  }
  ```
- **Expectation**: `PERMISSION_DENIED` - Cannot create a message unless the referenced chat document actually exists.

### Payload 8: Immutable Field Bypass (Overwriting createdAt timestamp on update)
- **Target Collection**: `backups/backup-123`
- **Operation**: `update`
- **Malicious Payload**:
  ```json
  {
    "createdAt": "2000-01-01T00:00:00Z"
  }
  ```
- **Expectation**: `PERMISSION_DENIED` - Immutable fields like `createdAt` must always match their biological `existing()` value.

### Payload 9: Timestamp Counterfeiting (Client-determined upload date)
- **Target Collection**: `backups/backup-123`
- **Operation**: `create`
- **Malicious Payload**:
  ```json
  {
    "createdAt": "1999-12-31T23:59:59Z"
  }
  ```
- **Expectation**: `PERMISSION_DENIED` - Server timestamp is mandated.

### Payload 10: State Shortcut Attack
- **Target Collection**: `backups/backup-999`
- **Operation**: `update` (State transition from completed to uploading)
- **Malicious Payload**:
  ```json
  {
    "status": "uploading"
  }
  ```
- **Expectation**: `PERMISSION_DENIED` - Once status is `completed`, update is rejected.

### Payload 11: Bulk Harvesting (Blanket getDocs read request)
- **Target Path**: `backups` (without checking resource ownership)
- **Expectation**: `PERMISSION_DENIED` - Collection level list queries must securely check resource ownership.

### Payload 12: Private Token Leakage / Resource Poisoning
- **Target Path**: trying to read another user's `User` collection record
- **Expectation**: `PERMISSION_DENIED` - Reads restricted to owner's exact user directory.
