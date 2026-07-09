const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { convertIphoneSmsToXml, convertThreadToXml, listContacts, fetchThreadForHandle } = require('./converter');
const { createAuthService } = require('./auth');

let mainWindow;
let loginWindow;
let authService;
let bridgeLogPath;
let portalServer;
let portalBaseUrl;

function writeBridgeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    if (bridgeLogPath) {
      fs.appendFileSync(bridgeLogPath, line, 'utf8');
    }
  } catch {
    // Ignore logging failures.
  }
  console.log(message);
}

function getPortalDistDir() {
  return path.join(__dirname, 'web-portal-dist');
}

function getContentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

async function startPortalServer() {
  if (portalServer && portalBaseUrl) {
    return portalBaseUrl;
  }

  const distDir = getPortalDistDir();
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Embedded web portal is missing at ${indexPath}`);
  }

  portalServer = http.createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://localhost');
      const cleanPath = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
      const candidatePath = path.normalize(path.join(distDir, cleanPath));
      const safePath = candidatePath.startsWith(distDir) && fs.existsSync(candidatePath)
        ? candidatePath
        : indexPath;

      response.writeHead(200, { 'Content-Type': getContentType(safePath), 'Cache-Control': 'no-store' });
      response.end(fs.readFileSync(safePath));
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error.message || 'Failed to serve embedded portal.');
    }
  });

  await new Promise((resolve, reject) => {
    portalServer.once('error', reject);
    portalServer.listen(0, '127.0.0.1', () => {
      const address = portalServer.address();
      portalBaseUrl = `http://localhost:${address.port}`;
      writeBridgeLog(`Embedded portal server listening at ${portalBaseUrl}`);
      resolve();
    });
  });

  return portalBaseUrl;
}

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

async function loadNativeApp() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

async function buildLoginUrl(options = {}) {
  const baseUrl = await startPortalServer();
  const url = new URL(baseUrl);
  url.searchParams.set('desktop', '1');
  url.searchParams.set('loginPopup', '1');
  if (options.signOutFirst) {
    url.searchParams.set('desktopSignOut', '1');
  }
  return url.toString();
}

async function showLoginPopup(options = {}) {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return loginWindow;
  }

  loginWindow = new BrowserWindow({
    width: 520,
    height: 760,
    resizable: true,
    modal: true,
    parent: mainWindow,
    show: false,
    title: 'MessageBackup Sign In',
    backgroundColor: '#0b0f19',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:messagebackup-auth'
    }
  });

  attachWindowOpenHandler(loginWindow, mainWindow);

  loginWindow.on('closed', () => {
    loginWindow = null;
  });

  loginWindow.once('ready-to-show', () => {
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.show();
      loginWindow.focus();
    }
  });

  await loginWindow.loadURL(await buildLoginUrl(options));
  return loginWindow;
}

function attachWindowOpenHandler(win, parentWindow = null) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://accounts.google.com') || url.startsWith('https://apis.google.com')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          modal: true,
          parent: parentWindow || win,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            partition: 'persist:messagebackup-auth'
          }
        }
      };
    }

    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function notifyAuthState(state) {
  const windows = [mainWindow, loginWindow].filter((win) => win && !win.isDestroyed());
  for (const win of windows) {
    win.webContents.send('auth-state-updated', state);
  }
}

function focusMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
  }
}

function closeLoginPopup() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.close();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    resizable: true,
    show: false,
    title: 'MessageBackup',
    backgroundColor: '#05060a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:messagebackup-auth'
    }
  });

  attachWindowOpenHandler(mainWindow, mainWindow);

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  void loadNativeApp();

  mainWindow.on('closed', () => {
    closeLoginPopup();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  bridgeLogPath = path.join(app.getPath('userData'), 'desktop-bridge.log');
  writeBridgeLog('Application ready.');
  authService = createAuthService({
    userDataPath: app.getPath('userData'),
    configPath: path.join(__dirname, 'firebase-config.json')
  });

  createWindow();
});

app.on('before-quit', () => {
  if (portalServer) {
    portalServer.close();
    portalServer = null;
    portalBaseUrl = null;
  }
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
    closeLoginPopup();
    notifyAuthState(state);
    return { ok: true, state };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('auth-show-login-popup', async (event, options = {}) => {
  try {
    await showLoginPopup(options);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('auth-close-login-popup', async () => {
  closeLoginPopup();
  return { ok: true };
});

ipcMain.handle('auth-adopt-remote-session', async (event, payload) => {
  try {
    writeBridgeLog(`Adopting hosted session for user ${payload?.userId || 'unknown'}.`);
    const state = await authService.adoptRemoteSession(payload);
    notifyAuthState(state);
    closeLoginPopup();
    focusMainWindow();
    return { ok: true, state };
  } catch (err) {
    writeBridgeLog(`Hosted session adoption failed: ${err.message || String(err)}`);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('auth-open-local-workspace', async () => {
  try {
    const state = await authService.getAuthState();
    focusMainWindow();
    notifyAuthState(state);
    return { ok: true, state };
  } catch (err) {
    writeBridgeLog(`auth-open-local-workspace failed: ${err.message || String(err)}`);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('auth-force-open-local-workspace', async () => {
  try {
    const state = await authService.getAuthState().catch(() => ({
      authenticated: false,
      authAvailable: true,
      mode: 'guest',
      email: 'Guest account',
      userId: 'guest-local'
    }));

    focusMainWindow();
    notifyAuthState(state);
    return { ok: true, state };
  } catch (err) {
    writeBridgeLog(`Force-open local workspace failed: ${err.message || String(err)}`);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('auth-open-local-workspace-with-session', async (event, payload) => {
  try {
    writeBridgeLog(`Atomic open requested for hosted user ${payload?.userId || 'unknown'}.`);
    const state = await authService.adoptRemoteSession(payload);
    closeLoginPopup();
    focusMainWindow();
    notifyAuthState(state);
    return { ok: true, state };
  } catch (err) {
    writeBridgeLog(`Atomic open failed: ${err.message || String(err)}`);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('auth-record-export', async () => {
  try {
    const state = await authService.recordExport();
    notifyAuthState(state);
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
