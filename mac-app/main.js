const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const { convertIphoneSmsToXml, convertThreadToXml, listContacts, listOwnNumberSuggestions, fetchThreadForHandle } = require('./converter');
const { createAuthService } = require('./auth');
const {
  getMessagesDir,
  getDefaultChatDbPath,
  isReadableFile,
  findChatDbInFolder,
  saveStoredChatDbSelection,
  resolveChatDbAutomatically
} = require('./chat-db-access');
const packageConfig = require('./package.json');

const HOSTED_LOGIN_URL = 'https://message-backup-web-dashboard-206706021143.asia-southeast1.run.app';
const DESKTOP_BUILD = packageConfig.build?.buildVersion || packageConfig.version || 'dev';

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

function showAndFocusWindow(win, reason) {
  if (!win || win.isDestroyed()) return;
  writeBridgeLog(`Showing main window: ${reason}`);
  if (process.platform === 'darwin') {
    app.setActivationPolicy('regular');
    app.dock?.show?.();
  }
  if (!win.isVisible()) {
    win.show();
  }
  if (win.isMinimized()) {
    win.restore();
  }
  app.focus({ steal: true });
  win.focus();
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
  if (process.platform !== 'darwin') {
    return {};
  }

  return {
    securityScopedBookmarks: true
  };
}

function getDialogParentWindow() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    return mainWindow;
  }

  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) {
    return focused;
  }

  return mainWindow;
}

async function withSecurityScopedAccess(bookmark, callback) {
  if (process.platform !== 'darwin' || !bookmark) {
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

function finalizeChatDbSelection(selection) {
  if (!selection?.path) {
    return null;
  }

  saveStoredChatDbSelection(app.getPath('userData'), selection);
  return selection;
}

function tryResolveChatDb(userDataPath) {
  const stored = resolveChatDbAutomatically(userDataPath);
  if (!stored) {
    return null;
  }

  if (stored.bookmark && process.platform === 'darwin') {
    const stopAccessing = app.startAccessingSecurityScopedResource(stored.bookmark);
    try {
      if (isReadableFile(stored.path)) {
        return stored;
      }
    } finally {
      if (typeof stopAccessing === 'function') {
        stopAccessing();
      }
    }
    return null;
  }

  return isReadableFile(stored.path) ? stored : null;
}

async function pickChatDbFileDialog() {
  const messagesDir = getMessagesDir();
  const defaultChatDbPath = getDefaultChatDbPath();

  const result = await dialog.showOpenDialog(getDialogParentWindow(), {
    title: 'Allow SMSBackup to access your Messages database',
    message: 'Select chat.db so macOS can grant read access. The app only reads the file you choose.',
    buttonLabel: 'Allow Access',
    defaultPath: isReadableFile(defaultChatDbPath) ? defaultChatDbPath : messagesDir,
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

  return finalizeChatDbSelection({
    path: result.filePaths[0],
    bookmark: result.bookmarks?.[0] ?? null,
    source: 'file'
  });
}

async function pickChatDbFromFolderDialog() {
  const messagesDir = getMessagesDir();

  const result = await dialog.showOpenDialog(getDialogParentWindow(), {
    title: 'Select your Messages database folder',
    message: 'Choose the Messages folder (or any folder containing chat.db). macOS will ask you to allow access.',
    buttonLabel: 'Use Folder',
    defaultPath: messagesDir,
    properties: ['openDirectory', 'createDirectory'],
    ...getSecurityScopedDialogOptions()
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const folderPath = result.filePaths[0];
  const bookmark = result.bookmarks?.[0] ?? null;
  let chatDbPath = findChatDbInFolder(folderPath);

  if (!chatDbPath && bookmark && process.platform === 'darwin') {
    const stopAccessing = app.startAccessingSecurityScopedResource(bookmark);
    try {
      chatDbPath = findChatDbInFolder(folderPath);
    } finally {
      if (typeof stopAccessing === 'function') {
        stopAccessing();
      }
    }
  }

  if (!chatDbPath) {
    const choice = await dialog.showMessageBox(getDialogParentWindow(), {
      type: 'warning',
      title: 'chat.db not found',
      message: 'No chat.db file was found in the selected folder.',
      detail: 'Choose the Messages folder that contains chat.db, or pick the chat.db file directly.',
      buttons: ['Pick chat.db file', 'Cancel'],
      defaultId: 0,
      cancelId: 1
    });

    if (choice.response === 0) {
      return pickChatDbFileDialog();
    }

    return null;
  }

  return finalizeChatDbSelection({
    path: chatDbPath,
    bookmark,
    source: 'folder'
  });
}

async function loadWelcomeApp() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await mainWindow.loadFile(path.join(__dirname, 'renderer', 'welcome.html'));
}

async function loadNativeApp() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

async function buildLoginUrl(options = {}) {
  const url = new URL(HOSTED_LOGIN_URL);
  url.searchParams.set('desktop', '1');
  url.searchParams.set('loginPopup', '1');
  url.searchParams.set('desktopBuild', DESKTOP_BUILD);
  url.searchParams.set('desktopCacheBust', String(Date.now()));
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
    width: 540,
    height: 780,
    resizable: true,
    modal: true,
    closable: true,
    parent: mainWindow,
    show: false,
    title: 'SMSBackup Sign In',
    backgroundColor: '#0b0f19',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      partition: 'persist:messagebackup-auth'
    }
  });

  attachWindowOpenHandler(loginWindow, mainWindow);

  loginWindow.on('closed', () => {
    loginWindow = null;
    focusMainWindow();
  });

  loginWindow.once('ready-to-show', () => {
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.show();
      loginWindow.focus();
    }
  });

  await loginWindow.loadFile(path.join(__dirname, 'renderer', 'login-popup.html'));
  return loginWindow;
}

function attachWindowOpenHandler(win, parentWindow = null) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith('https://accounts.google.com') ||
      url.startsWith('https://apis.google.com') ||
      url.startsWith('https://appleid.apple.com')
    ) {
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
    showAndFocusWindow(mainWindow, 'focus requested');
  }
}

function closeLoginPopup() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.close();
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (!mainWindow.isVisible()) {
    showAndFocusWindow(mainWindow, 'show requested');
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  showAndFocusWindow(mainWindow, 'show main window requested');
}

function installApplicationMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open SMSBackup Window',
          accelerator: 'CommandOrControl+O',
          click: showMainWindow
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        {
          label: 'Show SMSBackup',
          accelerator: 'CommandOrControl+Shift+O',
          click: showMainWindow
        },
        { role: 'front' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Message Backup Website',
          click: () => shell.openExternal(HOSTED_LOGIN_URL)
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  writeBridgeLog('Creating main window.');
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    resizable: true,
    show: true,
    title: 'SMSBackup',
    backgroundColor: '#05060a',
      webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      partition: 'persist:messagebackup-auth'
    }
  });

  attachWindowOpenHandler(mainWindow, mainWindow);

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    writeBridgeLog(`Main window failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
    showAndFocusWindow(mainWindow, 'load failure fallback');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    showAndFocusWindow(mainWindow, 'load finished');
  });

  mainWindow.once('ready-to-show', () => {
    showAndFocusWindow(mainWindow, 'ready-to-show');
  });

  void loadNativeApp();

  setTimeout(() => {
    showAndFocusWindow(mainWindow, 'startup fallback timer');
  }, 1500);

  mainWindow.on('closed', () => {
    closeLoginPopup();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.setActivationPolicy('regular');
    app.dock?.show?.();
  }
  bridgeLogPath = path.join(app.getPath('userData'), 'desktop-bridge.log');
  writeBridgeLog('Application ready.');
  authService = createAuthService({
    userDataPath: app.getPath('userData'),
    configPath: path.join(__dirname, 'firebase-config.json')
  });

  installApplicationMenu();
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
  showMainWindow();
});

ipcMain.handle('auto-resolve-chat-db', async () => {
  return tryResolveChatDb(app.getPath('userData'));
});

ipcMain.handle('ensure-chat-db-access', async (event, options = {}) => {
  const userDataPath = app.getPath('userData');
  const existing = tryResolveChatDb(userDataPath);
  if (existing) {
    return { ok: true, selection: existing };
  }

  if (options.promptIfNeeded === false) {
    return { ok: false, needsPermission: true };
  }

  let selection = await pickChatDbFileDialog();
  if (!selection) {
    selection = await pickChatDbFromFolderDialog();
  }

  if (!selection) {
    return { ok: false, canceled: true };
  }

  return { ok: true, selection };
});

ipcMain.handle('select-chat-db', async (event, options = {}) => {
  const mode = options.mode === 'file' ? 'file' : 'folder';
  const userDataPath = app.getPath('userData');

  const existing = tryResolveChatDb(userDataPath);
  if (existing) {
    return existing;
  }

  if (mode === 'file') {
    return pickChatDbFileDialog();
  }

  return pickChatDbFromFolderDialog();
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

ipcMain.handle('get-login-popup-config', async (event, options = {}) => {
  return {
    url: await buildLoginUrl(options),
    preloadPath: path.join(__dirname, 'renderer', 'webview-preload.js')
  };
});

ipcMain.handle('open-workspace', async () => {
  try {
    await loadNativeApp();
    focusMainWindow();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('open-welcome', async () => {
  try {
    await loadWelcomeApp();
    focusMainWindow();
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
    clarifiedFirebaseAuth = { uid: null, idToken: null };
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
    clarifiedFirebaseAuth = {
      uid: payload?.userId || null,
      idToken: payload?.idToken || null
    };
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
    await loadNativeApp();
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

    await loadNativeApp();
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
    clarifiedFirebaseAuth = {
      uid: payload?.userId || null,
      idToken: payload?.idToken || null
    };
    closeLoginPopup();
    await loadNativeApp();
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
    let messageCount = 0;
    await withSecurityScopedAccess(chatDbBookmark, async () => {
      await withSecurityScopedAccess(outputBookmark, async () => {
        const result = await convertThreadToXml(chatDbPath, handle, outputPath);
        messageCount = result?.messageCount || 0;
      });
    });
    return { ok: true, messageCount };
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

ipcMain.handle('list-own-number-suggestions', async (event, { chatDbPath, chatDbBookmark }) => {
  try {
    const suggestions = await withSecurityScopedAccess(chatDbBookmark, () => listOwnNumberSuggestions(chatDbPath));
    return { ok: true, suggestions };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('get-thread', async (event, { chatDbPath, chatDbBookmark, handle, myNumber, previewLimit }) => {
  try {
    const resolvedPreviewLimit = Number(previewLimit) > 0 ? Number(previewLimit) : null;
    const thread = await withSecurityScopedAccess(chatDbBookmark, () => fetchThreadForHandle(chatDbPath, handle, {
      myNumber,
      previewLimit: resolvedPreviewLimit
    }));
    return {
      ok: true,
      messages: thread.messages,
      totalCount: thread.totalCount,
      previewLimit: thread.previewLimit
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('open-full-disk-access-settings', async () => {
  try {
    spawn('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles']);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('auto-find-chat-db', async () => {
  try {
    const selection = await resolveChatDbAutomatically();
    if (selection?.path) {
      return { ok: true, path: selection.path, bookmark: selection.bookmark || null };
    }
    return { ok: false, permissionDenied: false };
  } catch (err) {
    if (err?.code === 'EACCES' || err?.code === 'EPERM') {
      return { ok: false, permissionDenied: true };
    }
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('read-file-text', async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('app-quit', async () => {
  app.quit();
});

ipcMain.handle('window-minimize', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.handle('window-toggle-maximize', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

let clarifiedFirebaseAuth = { uid: null, idToken: null };

ipcMain.on('set-firebase-auth', (_event, payload) => {
  if (payload?.uid && payload?.idToken) {
    clarifiedFirebaseAuth = { uid: payload.uid, idToken: payload.idToken };
  }
});

ipcMain.handle('upload-xml-to-firebase', async (_event, { filePath, fileName }) => {
  try {
    if (!clarifiedFirebaseAuth.uid || !clarifiedFirebaseAuth.idToken) {
      return { ok: false, error: 'No Firebase auth; sign in on the web app first.' };
    }

    const bucket = 'studio-3622430220-3c7ab.firebasestorage.app';
    const xmlBuffer = await fs.promises.readFile(filePath);
    const objectName = encodeURIComponent(
      `users/${clarifiedFirebaseAuth.uid}/uploads/${fileName || path.basename(filePath)}`
    );
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${objectName}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clarifiedFirebaseAuth.idToken}`,
        'Content-Type': 'application/xml'
      },
      body: xmlBuffer
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text || `Upload failed (${res.status})` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});
