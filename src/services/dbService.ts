import { 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { BackupRecord, ChatRecord, MessageRecord, UserConfig } from '../types';

// Helper to generate a random hex token
function generateDeviceToken(): string {
  const chars = 'abcdef0123456789';
  let token = 'mb_live_';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Helper to initialize custom mock offline data inside localStorage
function initOfflineData(userId: string) {
  if (!localStorage.getItem('offline_initialized')) {
    const backupId = 'bk_offline_sample';
    
    const backups: BackupRecord[] = [
      {
        backupId,
        userId,
        deviceName: "MacBook Pro (16-inch, M3 Max)",
        appVersion: "v1.4.2 (macOS)",
        messageCount: 15,
        chatCount: 3,
        sizeBytes: 2197412,
        status: 'completed',
        createdAt: new Date(Date.now() - 3600000 * 24).toISOString() // 1 day ago
      }
    ];

    const chats: ChatRecord[] = [
      {
        chatId: `ch_1_${backupId}`,
        userId,
        backupId,
        service: 'iMessage',
        contactName: 'Christina Lucas',
        contactIdentifier: 'christinalucas1216@gmail.com',
        messageCount: 5,
        lastMessageText: 'The desktop app backup finished successfully! Check your dashboard.',
        lastMessageAt: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 10).toISOString()
      },
      {
        chatId: `ch_2_${backupId}`,
        userId,
        backupId,
        service: 'SMS',
        contactName: 'Evelyn Parker',
        contactIdentifier: '+1 (555) 0192-384',
        messageCount: 4,
        lastMessageText: 'Are you coming to the WWDC keynotes viewing session?',
        lastMessageAt: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 20).toISOString()
      },
      {
        chatId: `ch_3_${backupId}`,
        userId,
        backupId,
        service: 'WhatsApp',
        contactName: 'Engineering Workspace Group',
        contactIdentifier: 'chat.whatsapp.gp39105',
        messageCount: 6,
        lastMessageText: 'Compiled executable releases are ready under assets directory.',
        lastMessageAt: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 30).toISOString()
      }
    ];

    const messages: MessageRecord[] = [
      // Chat 1 (iMessage)
      { messageId: 'm1_1', userId, chatId: chats[0].chatId, text: 'Hello! Setting up the Mac Message Backup tool tonight.', isFromMe: true, senderIdentifier: 'me', timestamp: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 2).toISOString() },
      { messageId: 'm1_2', userId, chatId: chats[0].chatId, text: 'Awesome, did you verify the database connection?', isFromMe: false, senderIdentifier: 'christinalucas1216@gmail.com', timestamp: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 4).toISOString() },
      { messageId: 'm1_3', userId, chatId: chats[0].chatId, text: 'Yes! Firestore connection validated. It bypassed standard rules successfully.', isFromMe: true, senderIdentifier: 'me', timestamp: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 6).toISOString() },
      { messageId: 'm1_4', userId, chatId: chats[0].chatId, text: 'Fantastic. Testing automatic uploads on startup next.', isFromMe: false, senderIdentifier: 'christinalucas1216@gmail.com', timestamp: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 8).toISOString() },
      { messageId: 'm1_5', userId, chatId: chats[0].chatId, text: 'The desktop app backup finished successfully! Check your dashboard.', isFromMe: false, senderIdentifier: 'christinalucas1216@gmail.com', timestamp: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 10).toISOString() },

      // Chat 2 (SMS)
      { messageId: 'm2_1', userId, chatId: chats[1].chatId, text: 'Hey there! Still on for coffee?', isFromMe: false, senderIdentifier: '+1 (555) 0192-384', timestamp: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 12).toISOString() },
      { messageId: 'm2_2', userId, chatId: chats[1].chatId, text: 'Absolutely. What time?', isFromMe: true, senderIdentifier: 'me', timestamp: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 14).toISOString() },
      { messageId: 'm2_3', userId, chatId: chats[1].chatId, text: 'Let`s meet after the Apple Event coverage at 2 PM.', isFromMe: false, senderIdentifier: '+1 (555) 0192-384', timestamp: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 16).toISOString() },
      { messageId: 'm2_4', userId, chatId: chats[1].chatId, text: 'Are you coming to the WWDC keynotes viewing session?', isFromMe: false, senderIdentifier: '+1 (555) 0192-384', timestamp: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 20).toISOString() },

      // Chat 3 (WhatsApp)
      { messageId: 'm3_1', userId, chatId: chats[2].chatId, text: 'Updated local SQLite query to extract message attachments.', isFromMe: false, senderIdentifier: 'Alice (Engineer)', timestamp: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 22).toISOString() },
      { messageId: 'm3_2', userId, chatId: chats[2].chatId, text: 'Awesome. What is the database path on macOS Venture/Sonoma?', isFromMe: true, senderIdentifier: 'me', timestamp: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 24).toISOString() },
      { messageId: 'm3_3', userId, chatId: chats[2].chatId, text: 'It is localized at ~/Library/Messages/chat.db. Completely encrypted unless authenticated!', isFromMe: false, senderIdentifier: 'Bob (Lead)', timestamp: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 26).toISOString() },
      { messageId: 'm3_4', userId, chatId: chats[2].chatId, text: 'Created the background process loader.', isFromMe: false, senderIdentifier: 'Alice (Engineer)', timestamp: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 28).toISOString() },
      { messageId: 'm3_5', userId, chatId: chats[2].chatId, text: 'Does it write backup size logs in MB?', isFromMe: true, senderIdentifier: 'me', timestamp: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 29).toISOString() },
      { messageId: 'm3_6', userId, chatId: chats[2].chatId, text: 'Compiled executable releases are ready under assets directory.', isFromMe: false, senderIdentifier: 'Bob (Lead)', timestamp: new Date(Date.now() - 3600000 * 24 + 1000 * 60 * 30).toISOString() }
    ];

    localStorage.setItem('offline_backups', JSON.stringify(backups));
    localStorage.setItem('offline_chats', JSON.stringify(chats));
    localStorage.setItem('offline_messages', JSON.stringify(messages));
    localStorage.setItem('offline_initialized', 'true');
  }
}

/**
 * Fetch or initialize/create user dashboard config profile.
 */
export async function ensureUserProfile(
  userId: string, 
  email: string, 
  displayName: string, 
  photoURL: string
): Promise<UserConfig> {
  const isOffline = userId === 'offline-guest' || localStorage.getItem('is_offline_sandbox') === 'true';
  if (isOffline) {
    initOfflineData(userId);
    const stored = localStorage.getItem('offline_profile');
    if (stored) {
      return JSON.parse(stored);
    }
    const profile: UserConfig = {
      userId,
      email,
      displayName: displayName || 'Offline Admin',
      photoURL: photoURL || '',
      apiToken: 'mb_live_offline_demo_token_123456789',
      createdAt: new Date().toISOString()
    };
    localStorage.setItem('offline_profile', JSON.stringify(profile));
    return profile;
  }

  const path = `users`;
  try {
    const userRef = doc(db, path, userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return userSnap.data() as UserConfig;
    } else {
      const generatedToken = generateDeviceToken();
      const newUser: UserConfig = {
        userId,
        email,
        displayName: displayName || 'macOS Backup User',
        photoURL: photoURL || '',
        apiToken: generatedToken,
        createdAt: new Date().toISOString(), // String matching blueprint format
      };

      // Set document with Server Timestamp logic
      await setDoc(userRef, {
        ...newUser,
        createdAt: serverTimestamp() // Set server timestamp to satisfy firebase rules if required, but rules expect incoming().createdAt == request.time
      });

      // Fetch freshly recorded data to get normalized timestamp
      const freshSnap = await getDoc(userRef);
      const data = freshSnap.data();
      return {
        ...newUser,
        createdAt: data?.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : newUser.createdAt
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${path}/${userId}`);
  }
}

/**
 * Rotates device API connection token
 */
export async function rotateApiToken(userId: string, currentProfile: UserConfig): Promise<string> {
  const isOffline = userId === 'offline-guest' || localStorage.getItem('is_offline_sandbox') === 'true';
  if (isOffline) {
    const newToken = generateDeviceToken();
    const updated = { ...currentProfile, apiToken: newToken, updatedAt: new Date().toISOString() };
    localStorage.setItem('offline_profile', JSON.stringify(updated));
    return newToken;
  }

  const path = `users`;
  const newToken = generateDeviceToken();
  try {
    const userRef = doc(db, path, userId);
    await updateDoc(userRef, {
      apiToken: newToken,
      updatedAt: serverTimestamp()
    });
    return newToken;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${path}/${userId}`);
  }
}

/**
 * Fetch list of backup logs belonging to user
 */
export async function fetchUserBackups(userId: string, isAdmin: boolean = false): Promise<BackupRecord[]> {
  const isOffline = userId === 'offline-guest' || localStorage.getItem('is_offline_sandbox') === 'true';
  if (isOffline) {
    initOfflineData(userId);
    const stored = localStorage.getItem('offline_backups');
    const records = stored ? JSON.parse(stored) : [];
    return records;
  }

  const path = 'backups';
  try {
    const q = isAdmin 
      ? query(collection(db, path), orderBy('createdAt', 'desc'))
      : query(collection(db, path), where('userId', '==', userId), orderBy('createdAt', 'desc'));
    
    const querySnapshot = await getDocs(q);
    const backups: BackupRecord[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      backups.push({
        ...data,
        backupId: doc.id,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt
      } as BackupRecord);
    });
    return backups;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Fetch message chat threads of specific backup
 */
export async function fetchBackupChats(userId: string, backupId: string, isAdmin: boolean = false): Promise<ChatRecord[]> {
  const isOffline = userId === 'offline-guest' || localStorage.getItem('is_offline_sandbox') === 'true';
  if (isOffline) {
    initOfflineData(userId);
    const stored = localStorage.getItem('offline_chats');
    const chats: ChatRecord[] = stored ? JSON.parse(stored) : [];
    return chats.filter(c => c.backupId === backupId);
  }

  const path = 'chats';
  try {
    const q = isAdmin
      ? query(collection(db, path), where('backupId', '==', backupId))
      : query(collection(db, path), where('userId', '==', userId), where('backupId', '==', backupId));
    
    const querySnapshot = await getDocs(q);
    const chats: ChatRecord[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      chats.push({
        ...data,
        chatId: doc.id,
        lastMessageAt: data.lastMessageAt instanceof Timestamp ? data.lastMessageAt.toDate().toISOString() : data.lastMessageAt
      } as ChatRecord);
    });
    return chats;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Fetch messages inside a chat
 */
export async function fetchChatMessages(userId: string, chatId: string, isAdmin: boolean = false): Promise<MessageRecord[]> {
  const isOffline = userId === 'offline-guest' || localStorage.getItem('is_offline_sandbox') === 'true';
  if (isOffline) {
    initOfflineData(userId);
    const stored = localStorage.getItem('offline_messages');
    const messages: MessageRecord[] = stored ? JSON.parse(stored) : [];
    return messages.filter(m => m.chatId === chatId);
  }

  const path = 'messages';
  try {
    const q = isAdmin
      ? query(collection(db, path), where('chatId', '==', chatId), orderBy('timestamp', 'asc'))
      : query(collection(db, path), where('userId', '==', userId), where('chatId', '==', chatId), orderBy('timestamp', 'asc'));
    const querySnapshot = await getDocs(q);
    const messages: MessageRecord[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      messages.push({
        ...data,
        messageId: doc.id,
        timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate().toISOString() : data.timestamp
      } as MessageRecord);
    });
    return messages;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Deletes backup run completely
 */
export async function deleteBackupRun(userId: string, backupId: string): Promise<void> {
  const isOffline = userId === 'offline-guest' || localStorage.getItem('is_offline_sandbox') === 'true';
  if (isOffline) {
    // delete from backups
    const storedB = localStorage.getItem('offline_backups');
    if (storedB) {
      const backups: BackupRecord[] = JSON.parse(storedB);
      localStorage.setItem('offline_backups', JSON.stringify(backups.filter(b => b.backupId !== backupId)));
    }
    // delete from chats
    const storedC = localStorage.getItem('offline_chats');
    if (storedC) {
      const chats: ChatRecord[] = JSON.parse(storedC);
      localStorage.setItem('offline_chats', JSON.stringify(chats.filter(c => c.backupId !== backupId)));
    }
    return;
  }

  const path = 'backups';
  try {
    await deleteDoc(doc(db, path, backupId));
    // Clean up associated chats and messages in client flow
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${path}/${backupId}`);
  }
}

/**
 * Helper to simulate Mac App synchronization by uploading 3 realistic sample conversations to Firestore.
 * This runs client-side but executes real Firestore operations validated by our exact firestore.rules!
 */
export async function simulateMacBackupSync(
  userId: string, 
  deviceName: string, 
  onProgress: (p: { status: string; percent: number }) => void
): Promise<void> {
  const isOffline = userId === 'offline-guest' || localStorage.getItem('is_offline_sandbox') === 'true';
  if (isOffline) {
    const backupId = `bk_${Math.random().toString(36).substr(2, 9)}`;
    
    onProgress({ status: 'Connecting to macOS backup client agent...', percent: 10 });
    await new Promise((r) => setTimeout(r, 400));

    const initialBackup: BackupRecord = {
      backupId,
      userId,
      deviceName,
      appVersion: 'v1.4.2 (macOS)',
      messageCount: 0,
      chatCount: 0,
      sizeBytes: 0,
      status: 'uploading',
      createdAt: new Date().toISOString()
    };

    onProgress({ status: 'Registering fresh binary sync record...', percent: 25 });
    
    const storedB = localStorage.getItem('offline_backups');
    const backups: BackupRecord[] = storedB ? JSON.parse(storedB) : [];
    backups.unshift(initialBackup);
    localStorage.setItem('offline_backups', JSON.stringify(backups));

    onProgress({ status: 'Scanning chat DB (iMessage, SMS, WhatsApp)...', percent: 45 });
    await new Promise((r) => setTimeout(r, 400));

    const mockChats = [
      {
        chatId: `ch_1_${backupId}`,
        contactName: 'Christina Lucas',
        contactIdentifier: 'christinalucas1216@gmail.com',
        service: 'iMessage' as const,
        messageCount: 5,
        lastMessageText: 'The desktop app backup finished successfully! Check your dashboard.',
      },
      {
        chatId: `ch_2_${backupId}`,
        contactName: 'Evelyn Parker',
        contactIdentifier: '+1 (555) 0192-384',
        service: 'SMS' as const,
        messageCount: 4,
        lastMessageText: 'Are you coming to the WWDC keynotes viewing session?',
      },
      {
        chatId: `ch_3_${backupId}`,
        contactName: 'Engineering Workspace Group',
        contactIdentifier: 'chat.whatsapp.gp39105',
        service: 'WhatsApp' as const,
        messageCount: 6,
        lastMessageText: 'Compiled executable releases are ready under assets directory.',
      }
    ];

    onProgress({ status: 'Uploading indexed chat trees to localStorage...', percent: 70 });
    
    const storedC = localStorage.getItem('offline_chats');
    const chatsList: ChatRecord[] = storedC ? JSON.parse(storedC) : [];
    
    for (const c of mockChats) {
      const chatDoc: ChatRecord = {
        chatId: c.chatId,
        userId,
        backupId,
        service: c.service,
        contactName: c.contactName,
        contactIdentifier: c.contactIdentifier,
        messageCount: c.messageCount,
        lastMessageText: c.lastMessageText,
        lastMessageAt: new Date().toISOString()
      };
      chatsList.unshift(chatDoc);
    }
    localStorage.setItem('offline_chats', JSON.stringify(chatsList));

    // Step 3: Populate Messages
    onProgress({ status: 'Writing payload database records securely...', percent: 85 });
    
    const messagesBatch = [
      { id: 'm1_1', chatId: mockChats[0].chatId, text: 'Hello! Setting up the Mac Message Backup tool tonight.', isMe: true, sender: 'me' },
      { id: 'm1_2', chatId: mockChats[0].chatId, text: 'Awesome, did you verify the database connection?', isMe: false, sender: 'christinalucas1216@gmail.com' },
      { id: 'm1_3', chatId: mockChats[0].chatId, text: 'Yes! Firestore connection validated. It bypassed standard rules successfully.', isMe: true, sender: 'me' },
      { id: 'm1_4', chatId: mockChats[0].chatId, text: 'Fantastic. Testing automatic uploads on startup next.', isMe: false, sender: 'christinalucas1216@gmail.com' },
      { id: 'm1_5', chatId: mockChats[0].chatId, text: 'The desktop app backup finished successfully! Check your dashboard.', isMe: false, sender: 'christinalucas1216@gmail.com' },

      { id: 'm2_1', chatId: mockChats[1].chatId, text: 'Hey there! Still on for coffee?', isMe: false, sender: '+1 (555) 0192-384' },
      { id: 'm2_2', chatId: mockChats[1].chatId, text: 'Absolutely. What time?', isMe: true, sender: 'me' },
      { id: 'm2_3', chatId: mockChats[1].chatId, text: 'Let`s meet after the Apple Event coverage at 2 PM.', isMe: false, sender: '+1 (555) 0192-384' },
      { id: 'm2_4', chatId: mockChats[1].chatId, text: 'Are you coming to the WWDC keynotes viewing session?', isMe: false, sender: '+1 (555) 0192-384' },

      { id: 'm3_1', chatId: mockChats[2].chatId, text: 'Updated local SQLite query to extract message attachments.', isMe: false, sender: 'Alice (Engineer)' },
      { id: 'm3_2', chatId: mockChats[2].chatId, text: 'Awesome. What is the database path on macOS Venture/Sonoma?', isMe: true, sender: 'me' },
      { id: 'm3_3', chatId: mockChats[2].chatId, text: 'It is localized at ~/Library/Messages/chat.db. Completely encrypted unless authenticated!', isMe: false, sender: 'Bob (Lead)' },
      { id: 'm3_4', chatId: mockChats[2].chatId, text: 'Created the background process loader.', isMe: false, sender: 'Alice (Engineer)' },
      { id: 'm3_5', chatId: mockChats[2].chatId, text: 'Does it write backup size logs in MB?', isMe: true, sender: 'me' },
      { id: 'm3_6', chatId: mockChats[2].chatId, text: 'Compiled executable releases are ready under assets directory.', isMe: false, sender: 'Bob (Lead)' }
    ];

    const storedM = localStorage.getItem('offline_messages');
    const messagesList: MessageRecord[] = storedM ? JSON.parse(storedM) : [];

    for (const m of messagesBatch) {
      const msgDoc: MessageRecord = {
        messageId: `msg_${m.id}_${backupId}`,
        userId,
        chatId: m.chatId,
        text: m.text,
        isFromMe: m.isMe,
        senderIdentifier: m.sender,
        timestamp: new Date().toISOString()
      };
      messagesList.unshift(msgDoc);
    }
    localStorage.setItem('offline_messages', JSON.stringify(messagesList));

    onProgress({ status: 'Finalizing backup archive index in localStorage...', percent: 95 });
    await new Promise((r) => setTimeout(r, 300));

    // Update backup status to completed
    const finalStoredB = localStorage.getItem('offline_backups');
    if (finalStoredB) {
      const updatedBackups: BackupRecord[] = JSON.parse(finalStoredB);
      const target = updatedBackups.find(b => b.backupId === backupId);
      if (target) {
        target.status = 'completed';
        target.chatCount = mockChats.length;
        target.messageCount = messagesBatch.length;
        target.sizeBytes = Math.floor(1024 * 1024 * 1.5 + Math.random() * 800000);
        target.updatedAt = new Date().toISOString();
      }
      localStorage.setItem('offline_backups', JSON.stringify(updatedBackups));
    }

    onProgress({ status: 'Sync Completed Accurately!', percent: 100 });
    return;
  }

  const backupId = `bk_${Math.random().toString(36).substr(2, 9)}`;
  const timestamp = new Date();

  // Step 1: Upload Backup Entry as "uploading"
  onProgress({ status: 'Connecting to macOS backup client agent...', percent: 10 });
  await new Promise((r) => setTimeout(r, 600));

  const initialBackup: BackupRecord = {
    backupId,
    userId,
    deviceName,
    appVersion: 'v1.4.2 (macOS)',
    messageCount: 0,
    chatCount: 0,
    sizeBytes: 0,
    status: 'uploading',
    createdAt: serverTimestamp()
  };

  onProgress({ status: 'Registering fresh binary sync record...', percent: 25 });
  await setDoc(doc(db, 'backups', backupId), initialBackup);

  // Step 2: Push 3 Chat Records
  onProgress({ status: 'Scanning chat DB (iMessage, SMS, WhatsApp)...', percent: 45 });
  await new Promise((r) => setTimeout(r, 500));

  const mockChats = [
    {
      chatId: `ch_1_${backupId}`,
      contactName: 'Christina Lucas',
      contactIdentifier: 'christinalucas1216@gmail.com',
      service: 'iMessage' as const,
      messageCount: 5,
      lastMessageText: 'The desktop app backup finished successfully! Check your dashboard.',
    },
    {
      chatId: `ch_2_${backupId}`,
      contactName: 'Evelyn Parker',
      contactIdentifier: '+1 (555) 0192-384',
      service: 'SMS' as const,
      messageCount: 4,
      lastMessageText: 'Are you coming to the WWDC keynotes viewing session?',
    },
    {
      chatId: `ch_3_${backupId}`,
      contactName: 'Engineering Workspace Group',
      contactIdentifier: 'chat.whatsapp.gp39105',
      service: 'WhatsApp' as const,
      messageCount: 6,
      lastMessageText: 'Compiled executable releases are ready under assets directory.',
    }
  ];

  onProgress({ status: 'Uploading indexed chat trees to Firestore...', percent: 70 });
  for (const c of mockChats) {
    const chatDoc: ChatRecord = {
      chatId: c.chatId,
      userId,
      backupId,
      service: c.service,
      contactName: c.contactName,
      contactIdentifier: c.contactIdentifier,
      messageCount: c.messageCount,
      lastMessageText: c.lastMessageText,
      lastMessageAt: serverTimestamp()
    };
    await setDoc(doc(db, 'chats', c.chatId), chatDoc);
  }

  // Step 3: Populate Messages
  onProgress({ status: 'Writing payload database records securely...', percent: 85 });
  
  const messagesBatch = [
    // Chat 1 (iMessage)
    { id: 'm1_1', chatId: mockChats[0].chatId, text: 'Hello! Setting up the Mac Message Backup tool tonight.', isMe: true, sender: 'me' },
    { id: 'm1_2', chatId: mockChats[0].chatId, text: 'Awesome, did you verify the database connection?', isMe: false, sender: 'christinalucas1216@gmail.com' },
    { id: 'm1_3', chatId: mockChats[0].chatId, text: 'Yes! Firestore connection validated. It bypassed standard rules successfully.', isMe: true, sender: 'me' },
    { id: 'm1_4', chatId: mockChats[0].chatId, text: 'Fantastic. Testing automatic uploads on startup next.', isMe: false, sender: 'christinalucas1216@gmail.com' },
    { id: 'm1_5', chatId: mockChats[0].chatId, text: 'The desktop app backup finished successfully! Check your dashboard.', isMe: false, sender: 'christinalucas1216@gmail.com' },

    // Chat 2 (SMS)
    { id: 'm2_1', chatId: mockChats[1].chatId, text: 'Hey there! Still on for coffee?', isMe: false, sender: '+1 (555) 0192-384' },
    { id: 'm2_2', chatId: mockChats[1].chatId, text: 'Absolutely. What time?', isMe: true, sender: 'me' },
    { id: 'm2_3', chatId: mockChats[1].chatId, text: 'Let`s meet after the Apple Event coverage at 2 PM.', isMe: false, sender: '+1 (555) 0192-384' },
    { id: 'm2_4', chatId: mockChats[1].chatId, text: 'Are you coming to the WWDC keynotes viewing session?', isMe: false, sender: '+1 (555) 0192-384' },

    // Chat 3 (WhatsApp)
    { id: 'm3_1', chatId: mockChats[2].chatId, text: 'Updated local SQLite query to extract message attachments.', isMe: false, sender: 'Alice (Engineer)' },
    { id: 'm3_2', chatId: mockChats[2].chatId, text: 'Awesome. What is the database path on macOS Venture/Sonoma?', isMe: true, sender: 'me' },
    { id: 'm3_3', chatId: mockChats[2].chatId, text: 'It is localized at ~/Library/Messages/chat.db. Completely encrypted unless authenticated!', isMe: false, sender: 'Bob (Lead)' },
    { id: 'm3_4', chatId: mockChats[2].chatId, text: 'Created the background process loader.', isMe: false, sender: 'Alice (Engineer)' },
    { id: 'm3_5', chatId: mockChats[2].chatId, text: 'Does it write backup size logs in MB?', isMe: true, sender: 'me' },
    { id: 'm3_6', chatId: mockChats[2].chatId, text: 'Compiled executable releases are ready under assets directory.', isMe: false, sender: 'Bob (Lead)' }
  ];

  for (const m of messagesBatch) {
    const msgDoc: MessageRecord = {
      messageId: `msg_${m.id}_${backupId}`,
      userId,
      chatId: m.chatId,
      text: m.text,
      isFromMe: m.isMe,
      senderIdentifier: m.sender,
      timestamp: serverTimestamp()
    };
    await setDoc(doc(db, 'messages', msgDoc.messageId), msgDoc);
  }

  // Step 4: Finalize backup document state
  onProgress({ status: 'Finalizing backup archive index in Firestore...', percent: 95 });
  await new Promise((r) => setTimeout(r, 450));

  const backupDocRef = doc(db, 'backups', backupId);
  await updateDoc(backupDocRef, {
    status: 'completed',
    chatCount: mockChats.length,
    messageCount: messagesBatch.length,
    sizeBytes: Math.floor(1024 * 1024 * 1.5 + Math.random() * 800000), // ~1.5MB to 2.3MB of database state
    updatedAt: serverTimestamp()
  });

  onProgress({ status: 'Sync Completed Accurately!', percent: 100 });
}

/**
 * Permanently delete a user account and all of their Firestore data.
 */
export async function deleteUserAccountData(userId: string): Promise<void> {
  const isOffline = userId === 'offline-guest' || localStorage.getItem('is_offline_sandbox') === 'true';
  if (isOffline) {
    localStorage.removeItem('offline_backups');
    localStorage.removeItem('offline_chats');
    localStorage.removeItem('offline_messages');
    localStorage.removeItem('offline_profile');
    localStorage.removeItem('offline_initialized');
    localStorage.removeItem('is_offline_sandbox');
    return;
  }

  // 1. Delete user document
  try {
    await deleteDoc(doc(db, 'users', userId));
  } catch (err) {
    console.error('Error deleting user doc:', err);
  }

  // 2. Delete all backups for this user
  try {
    const backupSnapshot = await getDocs(
      query(collection(db, 'backups'), where('userId', '==', userId))
    );
    for (const bDoc of backupSnapshot.docs) {
      await deleteDoc(bDoc.ref);
    }
  } catch (err) {
    console.error('Error deleting user backups:', err);
  }

  // 3. Delete all chats for this user
  try {
    const chatSnapshot = await getDocs(
      query(collection(db, 'chats'), where('userId', '==', userId))
    );
    for (const cDoc of chatSnapshot.docs) {
      await deleteDoc(cDoc.ref);
    }
  } catch (err) {
    console.error('Error deleting user chats:', err);
  }

  // 4. Delete all messages for this user
  try {
    const messageSnapshot = await getDocs(
      query(collection(db, 'messages'), where('userId', '==', userId))
    );
    for (const mDoc of messageSnapshot.docs) {
      await deleteDoc(mDoc.ref);
    }
  } catch (err) {
    console.error('Error deleting user messages:', err);
  }
}

