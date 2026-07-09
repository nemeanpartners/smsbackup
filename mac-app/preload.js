const { contextBridge, ipcRenderer } = require('electron');
const firebaseConfig = require('./firebase-config.json');

contextBridge.exposeInMainWorld('electronAPI', {
  getAuthState: () => ipcRenderer.invoke('auth-get-state'),
  signOut: () => ipcRenderer.invoke('auth-sign-out'),
  recordExport: () => ipcRenderer.invoke('auth-record-export'),
  showLoginPopup: (options = {}) => ipcRenderer.invoke('auth-show-login-popup', options),
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

async function initHostedLoginBridge() {
  const params = new URLSearchParams(window.location.search);
  const isElectronContainer = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron');
  const isDesktopMode = params.get('desktop') === '1' || isElectronContainer;
  const isLoginPopup = params.get('loginPopup') === '1';

  if (!isDesktopMode || !isLoginPopup) {
    return;
  }

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

  async function deliverSession(user) {
    if (!user || delivered) {
      return;
    }

    const result = await ipcRenderer.invoke('auth-adopt-remote-session', await buildHostedSessionPayload(user));
    if (!result?.ok) {
      throw new Error(result?.error || 'Desktop sign-in handoff failed.');
    }

    delivered = true;
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user || delivered) {
      return;
    }

    try {
      await deliverSession(user);
    } catch (error) {
      console.error('Failed to hand hosted auth session to desktop app.', error);
    }
  });
}

void initHostedLoginBridge();
