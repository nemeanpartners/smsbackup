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

export interface DownloadRecord {
  downloadId: string;
  userId: string;
  fileName: string;
  userNumber: string;
  contactNumber: string;
  messageCount: number;
  savedAt: string;
}

export interface AdminUserDownloadSummary {
  userId: string;
  email: string;
  displayName: string;
  downloadCount: number;
  lastDownloadAt: string;
}

export interface TicketReply {
  replyId: string;
  sender: 'admin' | 'user';
  senderName: string;
  text: string;
  createdAt: string;
}

export interface SupportTicket {
  ticketId: string;
  userId?: string;
  ticketNumber: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'Open' | 'In Progress' | 'Pending' | 'Resolved';
  replies: TicketReply[];
  createdAt: string;
  updatedAt?: string;
}
