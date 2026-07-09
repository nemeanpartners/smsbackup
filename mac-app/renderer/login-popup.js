const HOSTED_LOGIN_URL = 'https://message-backup-web-dashboard-206706021143.asia-southeast1.run.app';

function buildLoginUrl() {
  const url = new URL(HOSTED_LOGIN_URL);
  url.searchParams.set('desktop', '1');
  url.searchParams.set('loginPopup', '1');
  return url.toString();
}

function initLoginPopup() {
  const closeButton = document.getElementById('closeLoginPopupButton');
  const webview = document.getElementById('loginWebview');

  if (closeButton) {
    closeButton.addEventListener('click', () => {
      const api = window.electronAPI;
      if (api?.closeLoginPopup) {
        void api.closeLoginPopup();
        return;
      }
      window.close();
    });
  }

  if (!webview) {
    return;
  }

  void window.electronAPI?.getLoginPopupConfig?.().then((config) => {
    if (config?.preloadPath) {
      webview.setAttribute('preload', config.preloadPath);
    }
    webview.src = config?.url || buildLoginUrl();
  }).catch(() => {
    webview.src = buildLoginUrl();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLoginPopup);
} else {
  initLoginPopup();
}
