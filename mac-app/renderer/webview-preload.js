const { contextBridge, ipcRenderer } = require('electron');

// This preload runs inside the webview that hosts the Clarified AI web app.
// It exposes a minimal `window.electronAPI.setFirebaseAuth` in the page
// context so the web app can forward the current Firebase uid + ID token
// back to the host window, which then forwards it to the Electron main
// process via the main preload + ipcMain.

contextBridge.exposeInMainWorld('electronAPI', {
  setFirebaseAuth: (payload) => {
    try {
      ipcRenderer.sendToHost('desktop-auth', payload);
    } catch (err) {
      console.error('Clarified webview preload: failed to forward auth to host', err);
    }
  }
});

// Desktop-only UX tweaks:
// - hide the Reports entry in the Clarified web app's own sidebar
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
    console.error('Clarified webview preload: hideBottomNavBar failed', err);
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
