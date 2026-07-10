async function openWorkspaceView() {
  const api = window.electronAPI;

  if (api && typeof api.openWorkspace === 'function') {
    return api.openWorkspace();
  }

  if (api && typeof api.openLocalWorkspace === 'function') {
    return api.openLocalWorkspace();
  }

  window.location.href = 'index.html';
  return { ok: true };
}

function initWelcomePage() {
  const continueButton = document.getElementById('continueButton');
  const navBackupButton = document.getElementById('navBackupButton');
  const openWebAppButton = document.getElementById('openWebAppButton');

  const goToBackup = async (button) => {
    if (button) {
      button.disabled = true;
    }

    try {
      const result = await openWorkspaceView();
      if (result && result.ok === false && button) {
        button.disabled = false;
      }
    } catch {
      if (button) {
        button.disabled = false;
      }
      window.location.href = 'index.html';
    }
  };

  if (continueButton) {
    continueButton.addEventListener('click', () => goToBackup(continueButton));
  }

  if (navBackupButton) {
    navBackupButton.addEventListener('click', () => goToBackup(navBackupButton));
  }

  if (openWebAppButton) {
    openWebAppButton.addEventListener('click', async () => {
      const api = window.electronAPI;
      if (api?.showLoginPopup) {
        await api.showLoginPopup();
        return;
      }
      await goToBackup(null);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWelcomePage);
} else {
  initWelcomePage();
}
