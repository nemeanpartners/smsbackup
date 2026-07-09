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
  if (!continueButton) {
    return;
  }

  continueButton.addEventListener('click', async () => {
    continueButton.disabled = true;
    continueButton.textContent = 'Opening local SMS app…';

    try {
      const result = await openWorkspaceView();
      if (result && result.ok === false) {
        continueButton.disabled = false;
        continueButton.textContent = 'Continue to Local SMS App';
      }
    } catch {
      continueButton.disabled = false;
      continueButton.textContent = 'Continue to Local SMS App';
      window.location.href = 'index.html';
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWelcomePage);
} else {
  initWelcomePage();
}
