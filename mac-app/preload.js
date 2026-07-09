const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAuthState: () => ipcRenderer.invoke('auth-get-state'),
  signOut: () => ipcRenderer.invoke('auth-sign-out'),
  recordExport: () => ipcRenderer.invoke('auth-record-export'),
  showLoginPopup: (options = {}) => ipcRenderer.invoke('auth-show-login-popup', options),
  closeLoginPopup: () => ipcRenderer.invoke('auth-close-login-popup'),
  getLoginPopupConfig: (options = {}) => ipcRenderer.invoke('get-login-popup-config', options),
  openWorkspace: () => ipcRenderer.invoke('open-workspace'),
  openLocalWorkspace: () => ipcRenderer.invoke('auth-open-local-workspace'),
  onAuthStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('auth-state-updated', listener);
    return () => ipcRenderer.removeListener('auth-state-updated', listener);
  },
  selectChatDb: () => ipcRenderer.invoke('select-chat-db'),
  selectOutputXml: (defaultFilename) => ipcRenderer.invoke('select-output-xml', { defaultFilename }),
  convertSms: (chatDbPath, chatDbBookmark, outputPath, outputBookmark) =>
    ipcRenderer.invoke('convert-sms', { chatDbPath, chatDbBookmark, outputPath, outputBookmark }),
  convertThread: (chatDbPath, handle, outputPath, chatDbBookmark, outputBookmark) =>
    ipcRenderer.invoke('convert-thread', { chatDbPath, chatDbBookmark, handle, outputPath, outputBookmark }),
  listContacts: (chatDbPath, chatDbBookmark) =>
    ipcRenderer.invoke('list-contacts', { chatDbPath, chatDbBookmark }),
  getThread: (chatDbPath, handle, chatDbBookmark) =>
    ipcRenderer.invoke('get-thread', { chatDbPath, chatDbBookmark, handle })
});

const HOSTED_LOGIN_URL = 'https://message-backup-web-dashboard-206706021143.asia-southeast1.run.app';
const hostedOrigin = new URL(HOSTED_LOGIN_URL).origin;

async function initHostedLoginBridge() {
  if (window.location.origin !== hostedOrigin) {
    return;
  }

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
