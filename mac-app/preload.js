const { contextBridge, ipcRenderer } = require('electron');
const firebaseConfig = require('./firebase-config.json');

const HOSTED_LOGIN_URL = 'https://message-backup-web-dashboard-206706021143.asia-southeast1.run.app';
const hostedOrigin = new URL(HOSTED_LOGIN_URL).origin;

contextBridge.exposeInMainWorld('electronAPI', {
  getAuthState: () => ipcRenderer.invoke('auth-get-state'),
  signOut: () => ipcRenderer.invoke('auth-sign-out'),
  recordExport: () => ipcRenderer.invoke('auth-record-export'),
  showHostedLogin: (options = {}) => ipcRenderer.invoke('auth-show-hosted-login', options),
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
  if (window.location.origin !== hostedOrigin) {
    return;
  }

  const [{ initializeApp, getApps, getApp }, { getAuth, onAuthStateChanged, signOut }] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth')
  ]);

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const params = new URLSearchParams(window.location.search);
  const isElectronContainer = typeof navigator !== 'undefined' && (
    navigator.userAgent.toLowerCase().includes('electron') ||
    typeof ipcRenderer.invoke === 'function'
  );
  const isDesktopMode = params.get('desktop') === '1' || isElectronContainer;

  if (params.get('desktopSignOut') === '1') {
    try {
      await signOut(auth);
    } catch {
      // Ignore stale-browser sign-out failures and continue to show the hosted login.
    }
  }

  let delivered = false;
  let launchInFlight = false;
  let currentHostedUser = auth.currentUser || null;

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

  async function adoptDesktopSession(user) {
    const result = await ipcRenderer.invoke('auth-adopt-remote-session', await buildHostedSessionPayload(user));
    if (!result?.ok) {
      throw new Error(result?.error || 'Desktop sign-in handoff failed.');
    }

    return result;
  }

  function setButtonState(button, label, disabled) {
    if (!button) {
      return;
    }

    button.disabled = disabled;
    button.textContent = label;
  }

  function ensureDesktopFallbackButton() {
    if (!isDesktopMode || !document.body || document.getElementById('desktopOpenWorkspaceButton')) {
      return;
    }

    const profileButton = Array.from(document.querySelectorAll('button')).find((button) =>
      /view account|profile page/i.test(button.textContent || '')
    );

    if (!profileButton || !profileButton.parentElement) {
      return;
    }

    const launchButton = document.createElement('button');
    launchButton.id = 'desktopOpenWorkspaceButton';
    launchButton.type = 'button';
    launchButton.textContent = 'Open Desktop App';
    launchButton.style.width = '100%';
    launchButton.style.marginBottom = '14px';
    launchButton.style.border = '1px solid rgba(15, 23, 42, 0.12)';
    launchButton.style.borderRadius = '16px';
    launchButton.style.padding = '14px 18px';
    launchButton.style.background = '#0f172a';
    launchButton.style.color = '#ffffff';
    launchButton.style.fontSize = '15px';
    launchButton.style.fontWeight = '700';
    launchButton.style.cursor = 'pointer';
    launchButton.style.boxShadow = '0 12px 28px rgba(15, 23, 42, 0.16)';
    launchButton.dataset.desktopBridge = 'open-workspace';

    const status = document.createElement('div');
    status.id = 'desktopOpenWorkspaceStatus';
    status.style.marginTop = '10px';
    status.style.fontSize = '12px';
    status.style.lineHeight = '1.5';
    status.style.color = '#2563eb';
    status.textContent = 'Open the local MessageBackup desktop workspace to browse chats and export XML on this Mac.';

    profileButton.parentElement.insertBefore(launchButton, profileButton);
    profileButton.parentElement.insertBefore(status, profileButton.nextSibling);
  }

  async function handleDesktopWorkspaceOpen(button) {
    if (launchInFlight) {
      return;
    }

    launchInFlight = true;
    const status = document.getElementById('desktopOpenWorkspaceStatus');
    setButtonState(button, 'Opening Desktop App…', true);

    if (status) {
      status.textContent = 'Opening the local MessageBackup XML export workspace…';
      status.style.color = '#2563eb';
    }

    try {
      const user = currentHostedUser || auth.currentUser;
      if (!user) {
        throw new Error('You need to finish sign-in before opening the desktop app.');
      }

      if (status) {
        status.textContent = 'Finalizing your signed-in desktop session and opening the local workspace…';
        status.style.color = '#2563eb';
      }

      const result = await ipcRenderer.invoke('auth-open-local-workspace-with-session', await buildHostedSessionPayload(user));
      if (!result?.ok) {
        throw new Error(result?.error || 'Could not open the desktop app.');
      }

      delivered = true;
      if (status) {
        status.textContent = 'Desktop app opened. Continue in the local XML export workspace.';
        status.style.color = '#059669';
      }
    } catch (error) {
      if (status) {
        status.textContent = 'Primary launch failed. Trying direct local app open…';
        status.style.color = '#d97706';
      }

      try {
        const fallback = await ipcRenderer.invoke('auth-force-open-local-workspace');
        if (!fallback?.ok) {
          throw new Error(fallback?.error || 'Could not force-open the desktop app.');
        }

        delivered = true;
        if (status) {
          status.textContent = 'Desktop app opened. Continue in the local XML export workspace.';
          status.style.color = '#059669';
        }
      } catch (fallbackError) {
        setButtonState(button, 'Open Desktop App', false);
        if (status) {
          status.textContent = fallbackError.message || String(fallbackError);
          status.style.color = '#dc2626';
        }
      }
    } finally {
      launchInFlight = false;
    }
  }

  function bindRealDesktopLauncher() {
    if (!isDesktopMode) {
      return;
    }

    const launcherButton = document.getElementById('btn-open-desktop-app');
    if (launcherButton && launcherButton.dataset.desktopBridgeBound !== '1') {
      launcherButton.dataset.desktopBridgeBound = '1';
      const statusLine = launcherButton.closest('#desktop-app-launcher-panel')?.querySelector('.text-blue-500.font-bold.animate-pulse');
      if (statusLine) {
        statusLine.textContent = 'Use this button to open the local MessageBackup XML workspace.';
      }
    }

    ensureDesktopFallbackButton();
  }

  const desktopLaunchObserver = new MutationObserver(() => {
    bindRealDesktopLauncher();
  });

  if (isDesktopMode) {
    bindRealDesktopLauncher();
    desktopLaunchObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    document.addEventListener('click', async (event) => {
      const trigger = event.target.closest('#btn-open-desktop-app, #desktopOpenWorkspaceButton');
      if (!trigger) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }

      await handleDesktopWorkspaceOpen(trigger);
    }, true);
  }

  onAuthStateChanged(auth, async (user) => {
    currentHostedUser = user || null;

    if (!user || delivered) {
      return;
    }

    try {
      const result = await ipcRenderer.invoke('auth-open-local-workspace-with-session', await buildHostedSessionPayload(user));
      if (!result?.ok) {
        throw new Error(result?.error || 'Desktop sign-in handoff failed.');
      }
      delivered = true;
      bindRealDesktopLauncher();
    } catch (error) {
      try {
        const fallback = await ipcRenderer.invoke('auth-force-open-local-workspace');
        if (fallback?.ok) {
          delivered = true;
          bindRealDesktopLauncher();
          return;
        }
      } catch {
        // Ignore fallback errors here; the user still has the manual launch button.
      }
      console.error('Failed to hand hosted auth session to desktop app.', error);
    }
  });
}

void initHostedLoginBridge();
