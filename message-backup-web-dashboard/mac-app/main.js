const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const { convertIphoneSmsToXml, convertThreadToXml, listContacts, fetchThreadForHandle } = require('./converter');
const { createAuthService } = require('./auth');

let mainWindow;
let authService;

function getSecurityScopedDialogOptions() {
  if (!process.mas) {
    return {};
  }

  return {
    securityScopedBookmarks: true
  };
}

async function withSecurityScopedAccess(bookmark, callback) {
  if (!process.mas || !bookmark) {
    return callback();
  }

  const stopAccessing = app.startAccessingSecurityScopedResource(bookmark);
  try {
    return await callback();
  } finally {
    if (typeof stopAccessing === 'function') {
      stopAccessing();
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    resizable: false,
    title: 'MessageBackup',
    backgroundColor: '#05060a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'welcome.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  authService = createAuthService({
    userDataPath: app.getPath('userData'),
    configPath: path.join(__dirname, 'firebase-config.json')
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.handle('select-chat-db', async () => {
  const home = os.homedir();
  const defaultPath = path.join(home, 'Library', 'Messages');

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select iPhone chat.db',
    buttonLabel: 'Use chat.db',
    defaultPath,
    properties: ['openFile'],
    filters: [
      { name: 'SQLite Databases', extensions: ['db', 'sqlite', 'sqlite3'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    ...getSecurityScopedDialogOptions()
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  return {
    path: result.filePaths[0],
    bookmark: result.bookmarks?.[0] ?? null
  };
});

ipcMain.handle('select-output-xml', async (event, options = {}) => {
  const filename = options.defaultFilename || 'sms_export.xml';
  const defaultPath = path.join(os.homedir(), 'Desktop', filename);

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save SMS Backup XML',
    defaultPath,
    buttonLabel: 'Save',
    filters: [
      { name: 'XML Files', extensions: ['xml'] }
    ],
    ...getSecurityScopedDialogOptions()
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return {
    path: result.filePath,
    bookmark: result.bookmark ?? result.bookmarks?.[0] ?? null
  };
});

ipcMain.handle('convert-sms', async (event, { chatDbPath, chatDbBookmark, outputPath, outputBookmark }) => {
  try {
    await withSecurityScopedAccess(chatDbBookmark, async () => {
      await withSecurityScopedAccess(outputBookmark, async () => {
        await convertIphoneSmsToXml(chatDbPath, outputPath);
      });
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('auth-get-state', async () => {
  return authService.getAuthState();
});

ipcMain.handle('auth-sign-up', async (event, { email, password }) => {
  try {
    const state = await authService.signUp(String(email || '').trim(), String(password || ''));
    return { ok: true, state };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('auth-sign-in', async (event, { email, password }) => {
  try {
    const state = await authService.signIn(String(email || '').trim(), String(password || ''));
    return { ok: true, state };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('auth-continue-guest', async () => {
  try {
    const state = await authService.continueAsGuest();
    return { ok: true, state };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('auth-sign-out', async () => {
  try {
    const state = await authService.signOut();
    return { ok: true, state };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('auth-record-export', async () => {
  try {
    const state = await authService.recordExport();
    return { ok: true, state };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('convert-thread', async (event, { chatDbPath, chatDbBookmark, handle, outputPath, outputBookmark }) => {
  try {
    await withSecurityScopedAccess(chatDbBookmark, async () => {
      await withSecurityScopedAccess(outputBookmark, async () => {
        await convertThreadToXml(chatDbPath, handle, outputPath);
      });
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('list-contacts', async (event, { chatDbPath, chatDbBookmark }) => {
  try {
    const contacts = await withSecurityScopedAccess(chatDbBookmark, () => listContacts(chatDbPath));
    return { ok: true, contacts };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('get-thread', async (event, { chatDbPath, chatDbBookmark, handle }) => {
  try {
    const messages = await withSecurityScopedAccess(chatDbBookmark, () => fetchThreadForHandle(chatDbPath, handle));
    return { ok: true, messages };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});
