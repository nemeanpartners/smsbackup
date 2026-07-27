const { contextBridge, ipcRenderer } = require('electron');

// This preload runs inside the webview that hosts the SMSBackup web app.
// It forwards Firebase auth to the desktop app and adopts a full session
// so Firestore-backed downloads can be saved for the signed-in user.

contextBridge.exposeInMainWorld('electronAPI', {
  setFirebaseAuth: (payload) => {
    try {
      ipcRenderer.sendToHost('desktop-auth', payload);
    } catch (err) {
      console.error('SMSBackup webview preload: failed to forward auth to host', err);
    }
  },
  openLocalWorkspace: () => ipcRenderer.invoke('auth-open-local-workspace'),
  closeLoginPopup: () => ipcRenderer.invoke('auth-close-login-popup')
});

const HOSTED_LOGIN_URL = 'https://message-backup-web-dashboard-206706021143.asia-southeast1.run.app';
const hostedOrigin = new URL(HOSTED_LOGIN_URL).origin;

async function initHostedLoginBridge() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('loginPopup') !== '1') {
    return;
  }

  const firebaseConfig = require('../firebase-config.json');
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
      const payload = await buildHostedSessionPayload(user);
      ipcRenderer.sendToHost('desktop-auth', {
        uid: payload.userId,
        idToken: payload.idToken,
        userId: payload.userId,
        email: payload.email
      });
      const result = await ipcRenderer.invoke('auth-adopt-remote-session', payload);
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

// Desktop-only UX tweaks:
// - hide the Reports entry in the SMSBackup web app's own sidebar
//   (desktop shell has its own top-level "Reports" view)
// - hide the bottom nav bar (Analysis / My Journey / Messages / Profile)
//   because navigation is handled by the native side panel.
// These do NOT modify the hosted web app itself; they only adjust the
// DOM inside this webview.

function hideWebAppReportsNav() {
  const candidates = document.querySelectorAll('a, button, [role="menuitem"], li, div');

  candidates.forEach((el) => {
    if (el.__desktopReportsHidden) return;

    const text = (el.textContent || '').trim().toLowerCase();
    if (text === 'reports') {
      const container = el.closest('a, button, li, div[role="button"]') || el;
      container.style.display = 'none';
      container.__desktopReportsHidden = true;
    }
  });
}

function hideBottomNavBar() {
  try {
    const candidates = Array.prototype.slice.call(
      document.querySelectorAll('nav, div, footer')
    );

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      const rect = el.getBoundingClientRect();

      // Only consider relatively short elements near the bottom of the viewport.
      if (rect.height > 200 || rect.top < window.innerHeight * 0.4) {
        continue;
      }

      const text = (el.innerText || '').trim();
      if (
        text.includes('Analysis') &&
        text.includes('My Journey') &&
        text.includes('Messages')
      ) {
        el.style.display = 'none';
        return;
      }
    }
  } catch (err) {
    console.error('SMSBackup webview preload: hideBottomNavBar failed', err);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  hideWebAppReportsNav();
  hideBottomNavBar();

  const observer = new MutationObserver(() => {
    hideWebAppReportsNav();
    hideBottomNavBar();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
});
