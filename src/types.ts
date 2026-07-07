/**
 * Type declarations for the Message Backup companion ecosystem.
 */

export interface UserConfig {
  userId: string;
  email: string;
  displayName: string;
  photoURL: string;
  apiToken: string;
  createdAt: string;
  updatedAt?: string;
}

export type BackupStatus = 'uploading' | 'completed' | 'failed';

export interface BackupRecord {
  backupId: string;
  userId: string;
  deviceName: string;
  appVersion: string;
  messageCount: number;
  chatCount: number;
  sizeBytes: number;
  status: BackupStatus;
  createdAt: any; // Firestore Timestamp or string
  updatedAt?: any;
}

export type ChatProtocol = 'iMessage' | 'SMS' | 'WhatsApp';

export interface ChatRecord {
  chatId: string;
  userId: string;
  backupId: string;
  service: ChatProtocol;
  contactName: string;
  contactIdentifier: string;
  messageCount: number;
  lastMessageText: string;
  lastMessageAt: string | any; // ISO string or Firestore Timestamp
}

export interface MessageRecord {
  messageId: string;
  userId: string;
  chatId: string;
  text: string;
  isFromMe: boolean;
  senderIdentifier: string;
  timestamp: any; // ISO string or Firestore Timestamp
}
