const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAuthState: () => ipcRenderer.invoke('auth-get-state'),
  signOut: () => ipcRenderer.invoke('auth-sign-out'),
  recordExport: () => ipcRenderer.invoke('auth-record-export'),
  showLoginPopup: (options = {}) => ipcRenderer.invoke('auth-show-login-popup', options),
  closeLoginPopup: () => ipcRenderer.invoke('auth-close-login-popup'),
  getLoginPopupConfig: (options = {}) => ipcRenderer.invoke('get-login-popup-config', options),
  openWorkspace: () => ipcRenderer.invoke('open-workspace'),
  openWelcome: () => ipcRenderer.invoke('open-welcome'),
  openLocalWorkspace: () => ipcRenderer.invoke('auth-open-local-workspace'),
  onAuthStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('auth-state-updated', listener);
    return () => ipcRenderer.removeListener('auth-state-updated', listener);
  },
  selectChatDb: async (options = {}) => {
    const selected = await ipcRenderer.invoke('select-chat-db', options);
    if (!selected) return null;
    return selected;
  },
  selectOutputXml: async (defaultFilename) => {
    const selected = await ipcRenderer.invoke('select-output-xml', { defaultFilename: defaultFilename || 'sms_export.xml' });
    if (!selected) return null;
    return selected.path || selected;
  },
  listContacts: async (chatDbPath, chatDbBookmark) =>
    ipcRenderer.invoke('list-contacts', { chatDbPath, chatDbBookmark }),
  listOwnNumberSuggestions: (chatDbPath, chatDbBookmark) =>
    ipcRenderer.invoke('list-own-number-suggestions', { chatDbPath, chatDbBookmark }),
  getThread: (chatDbPath, handle, chatDbBookmark, options = {}) =>
    ipcRenderer.invoke('get-thread', {
      chatDbPath,
      chatDbBookmark,
      handle,
      myNumber: options.myNumber,
      previewLimit: options.previewLimit
    }),

  // SMSBackup desktop UI compatibility
  autoFindChatDb: async () => {
    const access = await ipcRenderer.invoke('ensure-chat-db-access', { promptIfNeeded: true });
    if (access?.ok && access.selection?.path) {
      return {
        ok: true,
        path: access.selection.path,
        bookmark: access.selection.bookmark || null
      };
    }
    if (access?.canceled) {
      return { ok: false, permissionDenied: true };
    }
    const resolved = await ipcRenderer.invoke('auto-resolve-chat-db');
    if (resolved?.path) {
      return { ok: true, path: resolved.path, bookmark: resolved.bookmark || null };
    }
    return { ok: false, permissionDenied: false };
  },
  openFullDiskAccessSettings: () => ipcRenderer.invoke('open-full-disk-access-settings'),
  convertConversation: (chatDbPath, handle, userNumber, contactNumber, outputPath, chatDbBookmark, outputBookmark) =>
    ipcRenderer.invoke('convert-thread', {
      chatDbPath,
      chatDbBookmark,
      handle,
      outputPath,
      outputBookmark
    }),
  readFileText: (filePath) => ipcRenderer.invoke('read-file-text', filePath),
  quitApp: () => ipcRenderer.invoke('app-quit'),
  setFirebaseAuth: (payload) => ipcRenderer.send('set-firebase-auth', payload),
  uploadXmlToFirebase: (filePath, fileName) =>
    ipcRenderer.invoke('upload-xml-to-firebase', { filePath, fileName }),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window-toggle-maximize')
});

const HOSTED_LOGIN_URL = 'https://message-backup-web-dashboard-206706021143.asia-southeast1.run.app';
const hostedOrigin = new URL(HOSTED_LOGIN_URL).origin;

async function initHostedLoginBridge() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('loginPopup') !== '1') {
    return;
  }

  const firebaseConfig = require('./firebase-config.json');
  const [{ initializeApp, getApps, getApp }, { getAuth, onAuthStateChanged, signOut }] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth')
  ]);

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);

  if (params.get('desktopSignOut') === '1') {
    try {
      await signOut(auth);
    } catch {
      // Ignore stale-browser sign-out failures.
    }
  }

  let delivered = false;

  async function buildHostedSessionPayload(user) {
    const idToken = await user.getIdToken();
    const refreshToken = user.stsTokenManager?.refreshToken || user.refreshToken;
    const expirationTime = user.stsTokenManager?.expirationTime;
    const expiresIn = expirationTime
      ? Math.max(60, Math.round((expirationTime - Date.now()) / 1000))
      : 3600;

    return {
      email: user.email,
      userId: user.uid,
      idToken,
      refreshToken,
      expiresIn,
      displayName: user.displayName,
      photoURL: user.photoURL,
      isAnonymous: user.isAnonymous
    };
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user || delivered) {
      return;
    }

    try {
      const result = await ipcRenderer.invoke('auth-adopt-remote-session', await buildHostedSessionPayload(user));
      if (!result?.ok) {
        throw new Error(result?.error || 'Desktop sign-in handoff failed.');
      }
      delivered = true;
    } catch (error) {
      console.error('Failed to hand hosted auth session to desktop app.', error);
    }
  });
}

void initHostedLoginBridge();

function injectLoginPopupStyles() {
  const params = new URLSearchParams(window.location.search);
  const isDesktopShell = params.get('loginPopup') === '1' || params.get('desktop') === '1';
  if (!isDesktopShell || !navigator.userAgent.toLowerCase().includes('electron')) {
    return;
  }

  const styleId = 'mb-desktop-login-popup-style';
  if (document.getElementById(styleId)) {
    return;
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    #desktop-terminal-log-panel,
    #desktop-app-launcher-panel .font-mono.text-xs.p-4.rounded-xl.border.h-44,
    #desktop-app-launcher-panel .font-mono.text-xs.p-4.rounded-xl.border {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

injectLoginPopupStyles();
