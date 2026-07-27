const fs = require('fs');
const path = require('path');
const os = require('os');

function getMessagesDir() {
  return path.join(os.homedir(), 'Library', 'Messages');
}

function getDefaultChatDbPath() {
  return path.join(getMessagesDir(), 'chat.db');
}

function getChatDbCandidatePaths() {
  const messagesDir = getMessagesDir();
  return [
    path.join(messagesDir, 'chat.db'),
    path.join(messagesDir, 'Archive', 'chat.db')
  ];
}

function isReadableFile(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findChatDbInFolder(folderPath) {
  if (!folderPath) {
    return null;
  }

  const direct = path.join(folderPath, 'chat.db');
  if (isReadableFile(direct)) {
    return direct;
  }

  const archive = path.join(folderPath, 'Archive', 'chat.db');
  if (isReadableFile(archive)) {
    return archive;
  }

  return null;
}

function loadStoredChatDbSelection(userDataPath) {
  try {
    const selectionPath = path.join(userDataPath, 'chat-db-selection.json');
    if (!fs.existsSync(selectionPath)) {
      return null;
    }

    const parsed = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
    if (parsed?.path && isReadableFile(parsed.path)) {
      return {
        path: parsed.path,
        bookmark: parsed.bookmark || null,
        source: 'stored'
      };
    }
  } catch {
    // Ignore stale stored selections.
  }

  return null;
}

function saveStoredChatDbSelection(userDataPath, selection) {
  if (!selection?.path) {
    return;
  }

  const selectionPath = path.join(userDataPath, 'chat-db-selection.json');
  fs.writeFileSync(selectionPath, JSON.stringify({
    path: selection.path,
    bookmark: selection.bookmark || null,
    updatedAt: new Date().toISOString()
  }, null, 2), 'utf8');
}

function resolveChatDbAutomatically(userDataPath) {
  const stored = loadStoredChatDbSelection(userDataPath);
  if (stored) {
    return stored;
  }

  for (const candidate of getChatDbCandidatePaths()) {
    if (isReadableFile(candidate)) {
      return {
        path: candidate,
        bookmark: null,
        source: 'auto'
      };
    }
  }

  return null;
}

module.exports = {
  getMessagesDir,
  getDefaultChatDbPath,
  getChatDbCandidatePaths,
  isReadableFile,
  findChatDbInFolder,
  loadStoredChatDbSelection,
  saveStoredChatDbSelection,
  resolveChatDbAutomatically
};
