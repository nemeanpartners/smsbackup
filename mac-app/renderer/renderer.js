let webPreview = null;

const HOSTED_LOGIN_URL = 'https://message-backup-web-dashboard-206706021143.asia-southeast1.run.app';

const views = document.querySelectorAll('.view');
const sectionToggles = document.querySelectorAll('.side-section-toggle');
const submenus = document.querySelectorAll('.side-submenu');
const subTabs = document.querySelectorAll('.side-subtab');

function setActiveView(target) {
  views.forEach((view) => {
    const id = view.id;
    let isTarget = false;
    if (target === 'backup' && id === 'clarifiedView') {
      isTarget = true;
    } else if (target === 'analysis' && id === 'webPreviewView') {
      isTarget = true;
    } else if (target === 'login' && id === 'webPreviewView') {
      isTarget = true;
    } else if (target === 'reports' && id === 'reportsView') {
      isTarget = true;
    }
    view.classList.toggle('view-active', isTarget);
  });
}

function setActiveSubtab(tab) {
  subTabs.forEach((t) => t.classList.remove('side-subtab-active'));
  if (tab) {
    tab.classList.add('side-subtab-active');
  }
}

function toggleSection(sectionKey) {
  sectionToggles.forEach((toggle) => {
    const key = toggle.dataset.section;
    const submenu = document.querySelector('.side-submenu[data-section="' + key + '"]');
    const arrow = toggle.querySelector('.side-section-arrow');

    if (!submenu) {
      const isActive = key === sectionKey;
      toggle.classList.toggle('side-section-toggle-active', isActive);
      if (arrow) {
        arrow.textContent = '';
      }
      return;
    }

    if (key === sectionKey) {
      const isOpen = submenu.classList.contains('side-submenu-open');
      if (isOpen) {
        submenu.classList.remove('side-submenu-open');
        toggle.classList.remove('side-section-toggle-active');
        if (arrow) {
          arrow.textContent = '▸';
        }
      } else {
        submenu.classList.add('side-submenu-open');
        toggle.classList.add('side-section-toggle-active');
        if (arrow) {
          arrow.textContent = '▾';
        }
      }
    } else {
      submenu.classList.remove('side-submenu-open');
      toggle.classList.remove('side-section-toggle-active');
      if (arrow) {
        arrow.textContent = '▸';
      }
    }
  });
}

function navigateBottomTab(label) {
  if (!webPreview) return;
  const js = `
    (function() {
      try {
        var candidates = Array.prototype.slice.call(
          document.querySelectorAll('button, a, [role="tab"], [role="button"])
        );
        for (var i = 0; i < candidates.length; i++) {
          var el = candidates[i];
          var text = (el.innerText || el.textContent || '').trim();
          if (text === ${JSON.stringify(label)}) {
            el.click();
            return;
          }
        }
      } catch (e) {
        console.error('Clarified desktop nav error', e);
      }
    })();
  `;
  try {
    webPreview.executeJavaScript(js).catch(() => {});
  } catch (_) {
    // no-op
  }
}

function navigateWebSubpage(bottomLabel, targetLabel) {
  if (!webPreview) return;
  const js = `
    (function() {
      try {
        var bottom = ${JSON.stringify(bottomLabel)};
        var target = ${JSON.stringify(targetLabel)};

        function clickByText(label) {
          if (!label) return false;
          var candidates = Array.prototype.slice.call(
            document.querySelectorAll('button, a, [role="tab"], [role="button"], [role="menuitem"], [data-testid]')
          );
          for (var i = 0; i < candidates.length; i++) {
            var el = candidates[i];
            var text = (el.innerText || el.textContent || '').trim();
            if (text === label) {
              el.click();
              return true;
            }
          }
          return false;
        }

        if (bottom) {
          clickByText(bottom);
        }

        if (target) {
          setTimeout(function() {
            clickByText(target);
          }, 120);
        }
      } catch (e) {
        console.error('Clarified desktop subpage nav error', e);
      }
    })();
  `;
  try {
    webPreview.executeJavaScript(js).catch(() => {});
  } catch (_) {
    // no-op
  }
}

function openLoginSection() {
  toggleSection('profile');
  setActiveView('login');

  const frame = document.getElementById('loginWebview') || document.querySelector('#webPreviewView webview');
  if (!frame || !window.electronAPI) {
    return;
  }

  webPreview = frame;

  void window.electronAPI.getLoginPopupConfig?.().then((config) => {
    if (config?.preloadPath) {
      frame.setAttribute('preload', config.preloadPath);
    }
    frame.src = config?.url || buildHostedLoginUrl();
  }).catch(() => {
    frame.src = buildHostedLoginUrl();
  });
}

function buildHostedLoginUrl() {
  const url = new URL(HOSTED_LOGIN_URL);
  url.searchParams.set('desktop', '1');
  url.searchParams.set('loginPopup', '1');
  return url.toString();
}

function openProfileSection() {
  openLoginSection();
}

function openSetupSection() {
  setActiveView('backup');
}

function openAnalysisSection() {
  openLoginSection();
}

function openJourneySection() {
  openLoginSection();
}

sectionToggles.forEach((toggle) => {
  toggle.addEventListener('click', () => {
    const section = toggle.dataset.section;
    if (section === 'setup') {
      toggleSection('setup');
      openSetupSection();
    } else if (section === 'analysis') {
      toggleSection('analysis');
      openAnalysisSection();
    } else if (section === 'journey') {
      toggleSection('journey');
      openJourneySection();
    } else if (section === 'profile') {
      openProfileSection();
    }
  });
});

subTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const submenu = tab.closest('.side-submenu');
    const section = submenu ? submenu.dataset.section : null;
    const viewKey = tab.getAttribute('data-view');
    setActiveSubtab(tab);

    if (section === 'setup') {
      openSetupSection();
    } else if (section === 'analysis') {
      if (viewKey === 'analysis-reports') {
        // Reports uses the dedicated /reports webview.
        toggleSection('analysis');
        setActiveView('reports');
      } else {
        setActiveView('analysis');
        if (viewKey === 'analysis-options') {
          navigateWebSubpage('Analysis', 'Analysis Options');
        } else if (viewKey === 'analysis-full') {
          navigateWebSubpage('Analysis', 'Full Analysis');
        }
      }
    } else if (section === 'journey') {
      setActiveView('analysis');
      if (viewKey === 'journey-guide') {
        navigateWebSubpage('My Journey', 'My Guide');
      } else if (viewKey === 'journey-help') {
        navigateWebSubpage('My Journey', 'Get help responding');
      } else if (viewKey === 'journey-healing') {
        navigateWebSubpage('My Journey', 'Healing guides');
      } else if (viewKey === 'journey-roadmap') {
        navigateWebSubpage('My Journey', 'Personal growth roadmap');
      }
    }
  });
});

// Initial view
setActiveView('backup');

const chatDbLabel = document.getElementById('chatDbPath');
const pickChatDbButton = document.getElementById('pickChatDb');
const step1NextButton = document.getElementById('step1Next');
const statusLabel = document.getElementById('status');
const userNumberSelect = document.getElementById('userNumberSelect');
const contactSelect = document.getElementById('contactSelect');
const step2NextButton = document.getElementById('step2Next');
const threadContainer = document.getElementById('threadContainer');
const threadToggle = document.getElementById('threadToggle');
const threadToggleIcon = document.getElementById('threadToggleIcon');
const pairSummary = document.getElementById('pairSummary');
const winMinimizeButton = document.getElementById('winMinimize');
const winMaximizeButton = document.getElementById('winMaximize');
const runFullExportButton = document.getElementById('runFullExport');
const goToBackupButton = document.getElementById('goToBackup');
const goToAnalysisButton = document.getElementById('goToAnalysis');
const startCard = document.querySelector('.start-card');
const userNumberDatalist = document.getElementById('userNumberOptions');

let chatDbPath = null;
let chatDbBookmark = null;
let threadCollapsed = false;
let contactsByHandle = {};
let selectedHandle = null;
let contactsLoaded = false;
let step3Completed = false;
let currentBackupStep = 1;
let backupFlowStarted = false;

async function handleFullDiskAccessBlocked() {
  statusLabel.textContent =
    'macOS needs Full Disk Access for this app to read Messages. A settings window will open — toggle this app on, then click Browse again.';
  statusLabel.className = 'status-label error';
  await window.electronAPI.openFullDiskAccessSettings();
}

async function tryAutoFindChatDb({ fallbackToPicker } = { fallbackToPicker: true }) {
  if (!window.electronAPI) return false;

  try {
    const auto = await window.electronAPI.autoFindChatDb();
    if (auto && auto.ok && auto.path) {
      chatDbPath = auto.path;
      chatDbBookmark = auto.bookmark || null;
      chatDbLabel.textContent = auto.path;
      statusLabel.textContent = 'Found your Messages database automatically.';
      statusLabel.className = 'status-label';
      resetPreview();
      updateSideSteps();
      return true;
    }

    if (auto && auto.permissionDenied) {
      await handleFullDiskAccessBlocked();
      return false;
    }
  } catch (_err) {
    // fall through to manual picker
  }

  if (!fallbackToPicker) return false;

  const selected = await window.electronAPI.selectChatDb();
  if (!selected) {
    statusLabel.textContent = 'No database selected.';
    statusLabel.className = 'status-label';
    return false;
  }

  chatDbPath = selected.path || selected;
  chatDbBookmark = selected.bookmark || null;
  chatDbLabel.textContent = chatDbPath;
  statusLabel.textContent = 'Database selected. Click “Next: Pick a contact”.';
  statusLabel.className = 'status-label';
  resetPreview();
  updateSideSteps();
  return true;
}

// Bridge auth from the login webview back to the main Electron process.
webPreview = document.getElementById('loginWebview') || document.querySelector('.web-preview-frame');
let hasFirebaseAuth = false;
if (webPreview) {
  webPreview.addEventListener('ipc-message', (event) => {
    if (event.channel === 'desktop-auth' && event.args && event.args[0]) {
      const payload = event.args[0];
      if (window.electronAPI && typeof window.electronAPI.setFirebaseAuth === 'function') {
        window.electronAPI.setFirebaseAuth(payload);
      }
      if (payload && payload.uid && payload.idToken) {
        hasFirebaseAuth = true;
      }
    }
  });
}

// Window control buttons
if (winMinimizeButton && window.electronAPI && typeof window.electronAPI.minimizeWindow === 'function') {
  winMinimizeButton.addEventListener('click', () => {
    window.electronAPI.minimizeWindow();
  });
}

if (winMaximizeButton && window.electronAPI && typeof window.electronAPI.toggleMaximizeWindow === 'function') {
  winMaximizeButton.addEventListener('click', () => {
    window.electronAPI.toggleMaximizeWindow();
  });
}

// Side "Run export & analyze" button orchestrates:
// 1) auto-find / select chat.db
// 2) load contacts
// 3) ensure number + contact
// 4) trigger the existing export + upload flow.
if (runFullExportButton) {
  runFullExportButton.addEventListener('click', async () => {
    if (!window.electronAPI) return;

    // Ensure the Setup & backup section / view is active so users
    // can see the backup steps progressing as setup runs.
    openSetupSection();

    // Mark the backup flow as started so that the intro
    // collapses and the setup sections become visible.
    backupFlowStarted = true;
    if (startCard) {
      startCard.classList.add('start-card-collapsed');
    }
    updateSideSteps();
    updateStepSections();

    // 1) Ensure we have a chat.db selected (try auto-find, then manual picker).
    if (!chatDbPath) {
      statusLabel.textContent = 'Finding your iPhone Messages database…';
      statusLabel.className = 'status-label';

      try {
        const auto = await window.electronAPI.autoFindChatDb();
        if (auto && auto.ok && auto.path) {
          chatDbPath = auto.path;
          chatDbBookmark = auto.bookmark || null;
          chatDbLabel.textContent = auto.path;
          statusLabel.textContent = 'Found your Messages database automatically.';
          statusLabel.className = 'status-label';
          resetPreview();
        } else if (auto && auto.permissionDenied) {
          await handleFullDiskAccessBlocked();
          return;
        }
      } catch (_err) {
        // ignore and fall through to manual picker
      }

      if (!chatDbPath) {
        const selected = await window.electronAPI.selectChatDb();
        if (!selected) {
          statusLabel.textContent = 'No database selected. Choose your chat.db first.';
          statusLabel.className = 'status-label error';
          return;
        }
        chatDbPath = selected.path || selected;
        chatDbBookmark = selected.bookmark || null;
        chatDbLabel.textContent = chatDbPath;
        statusLabel.textContent = 'Database selected.';
        statusLabel.className = 'status-label';
        resetPreview();
      }
    }

    // 2) Ensure contacts are loaded.
    if (!contactsLoaded) {
      statusLabel.textContent = 'Loading contacts from your Messages database…';
      statusLabel.className = 'status-label';
      try {
        await loadContacts();
        contactsLoaded = true;
        statusLabel.textContent =
          'Contacts loaded. Enter your number and pick a contact, then the export will run.';
        statusLabel.className = 'status-label';
      } catch (err) {
        statusLabel.textContent = 'Failed to load contacts: ' + (err.message || String(err));
        statusLabel.className = 'status-label error';
        return;
      }
    }

    // 3) If phone number or contact is missing, prompt the user and stop.
    const userNumber = (userNumberSelect && userNumberSelect.value || '').trim();
    if (!userNumber || !selectedHandle) {
      statusLabel.textContent =
        'Enter your own number and pick a contact, then click “Next: Save Conversation”.';
      statusLabel.className = 'status-label error';
      updateSideSteps();
      updateStepSections();
      document.querySelector('.preview-step')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    // 4) All set: trigger the existing export + upload flow.
    if (step2NextButton) {
      step2NextButton.click();
    }
  });
}

// Start view shortcuts
if (goToBackupButton) {
  goToBackupButton.addEventListener('click', async () => {
    backupFlowStarted = true;
    if (startCard) {
      startCard.classList.add('start-card-collapsed');
    }
    updateSideSteps();
    updateStepSections();

    if (statusLabel) {
      statusLabel.textContent = 'Finding your Messages database…';
      statusLabel.className = 'status-label';
    }

    const firstStepSection = document.querySelector('.step-section[data-step-section="1"]');
    if (firstStepSection) {
      firstStepSection.scrollIntoView({ behavior: 'smooth' });
    }

    const found = await tryAutoFindChatDb({ fallbackToPicker: true });
    if (found && chatDbPath) {
      try {
        await loadContacts();
        if (statusLabel) {
          statusLabel.textContent = 'Database found. Enter your number and pick a contact.';
          statusLabel.className = 'status-label success';
        }
        document.querySelector('.preview-step')?.scrollIntoView({ behavior: 'smooth' });
      } catch (err) {
        if (statusLabel) {
          statusLabel.textContent = 'Found database but failed to load contacts: ' + (err.message || String(err));
          statusLabel.className = 'status-label error';
        }
      }
    }

    updateSideSteps();
    updateStepSections();
  });
}

if (goToAnalysisButton) {
  goToAnalysisButton.addEventListener('click', () => {
    openLoginSection();
  });
}

function updateSideSteps() {
  const steps = document.querySelectorAll('.side-step');
  if (!steps.length) return;

  const userNumber = (userNumberSelect && userNumberSelect.value || '').trim();
  let currentStep = 1;

  if (!chatDbPath) {
    currentStep = 1;
  } else if (!contactsLoaded || !selectedHandle || !userNumber) {
    currentStep = 2;
  } else if (!step3Completed) {
    currentStep = 3;
  } else {
    currentStep = 4;
  }

  currentBackupStep = currentStep;

  steps.forEach((step) => {
    const index = Number(step.getAttribute('data-step') || '0');
    step.classList.remove('side-step-active', 'side-step-complete');

    const statusEl = step.querySelector('.side-step-status');
    if (statusEl) {
      statusEl.textContent = '';
    }

    if (index === currentStep) {
      step.classList.add('side-step-active');
    }

    if (index === 1 && chatDbPath) {
      step.classList.add('side-step-complete');
      if (statusEl) statusEl.textContent = '✓ Completed';
    }

    if (index === 2 && contactsLoaded && selectedHandle && userNumber) {
      step.classList.add('side-step-complete');
      if (statusEl) statusEl.textContent = '✓ Completed';
    }

    if (index === 3 && step3Completed) {
      step.classList.add('side-step-complete');
      if (statusEl) statusEl.textContent = '✓ Completed';
    }

    if (index === 4 && step3Completed) {
      step.classList.add('side-step-complete');
      if (statusEl) statusEl.textContent = '✓ Completed';
    }
  });
}

function updateStepSections() {
  const sections = document.querySelectorAll('.step-section');
  if (!sections.length) return;

  sections.forEach((section) => {
    const index = Number(section.getAttribute('data-step-section') || '0');

    if (index === 3) {
      section.classList.add('step-section-active');
      return;
    }

    if (!backupFlowStarted) {
      section.classList.remove('step-section-active');
      return;
    }

    if (index === 1) {
      section.classList.add('step-section-active');
      return;
    }

    if (index === 2) {
      section.classList.toggle('step-section-active', !!chatDbPath);
      return;
    }

    section.classList.remove('step-section-active');
  });
}

if (pickChatDbButton) {
  pickChatDbButton.addEventListener('click', async () => {
    await tryAutoFindChatDb({ fallbackToPicker: true });
  });
}

if (step1NextButton) {
  step1NextButton.addEventListener('click', async () => {
  if (!chatDbPath) {
    statusLabel.textContent = 'Select your iPhone chat.db first.';
    statusLabel.className = 'status-label error';
    return;
  }

  step1NextButton.disabled = true;
  statusLabel.textContent = 'Loading contacts…';
  statusLabel.className = 'status-label';

  try {
    await loadContacts();
    document.querySelector('.preview-step').scrollIntoView({ behavior: 'smooth' });
    statusLabel.textContent =
      'Enter your phone number, pick a contact, then click “Next: Save XML”.';
    statusLabel.className = 'status-label';
  } catch (err) {
    statusLabel.textContent = 'Failed to load contacts: ' + (err.message || String(err));
    statusLabel.className = 'status-label error';
  } finally {
    step1NextButton.disabled = false;
  }

  updateSideSteps();
  updateStepSections();
  });
}

if (userNumberSelect) {
  userNumberSelect.addEventListener('input', () => {
    updatePairSummary();
    updateSideSteps();
    updateStepSections();
    if (selectedHandle && chatDbPath) {
      void loadThreadPreview(selectedHandle);
    }
  });
}

async function loadThreadPreview(handle) {
  if (!handle || !chatDbPath || !threadContainer || !window.electronAPI) {
    return;
  }

  threadContainer.innerHTML = '<div class="thread-placeholder">Loading conversation…</div>';

  try {
    const result = await window.electronAPI.getThread(chatDbPath, handle, chatDbBookmark);
    if (!result.ok) {
      threadContainer.innerHTML = '<div class="thread-placeholder">Failed to load conversation: ' +
        (result.error || 'Unknown error') + '</div>';
      return;
    }

    renderThread(result.messages || []);
  } catch (err) {
    threadContainer.innerHTML = '<div class="thread-placeholder">Unexpected error: ' +
      (err.message || String(err)) + '</div>';
  }
}

if (threadToggle && threadContainer && threadToggleIcon) {
  threadToggle.addEventListener('click', () => {
    threadCollapsed = !threadCollapsed;
    if (threadCollapsed) {
      threadContainer.classList.add('collapsed');
      threadToggleIcon.textContent = '▸';
    } else {
      threadContainer.classList.remove('collapsed');
      threadToggleIcon.textContent = '▾';
    }
  });
}

if (contactSelect) {
  contactSelect.addEventListener('change', async () => {
  const handle = contactSelect.value;
  if (!handle) {
    selectedHandle = null;
    threadContainer.innerHTML = '<div class="thread-placeholder">Pick a contact to view your message history.</div>';
    updatePairSummary();
    return;
  }

  selectedHandle = handle;
  updatePairSummary();
  updateSideSteps();

  if (!chatDbPath) return;

  await loadThreadPreview(handle);
  });
}

if (step2NextButton) {
  step2NextButton.addEventListener('click', async () => {
  if (!chatDbPath) {
    statusLabel.textContent = 'Select your iPhone chat.db first.';
    statusLabel.className = 'status-label error';
    return;
  }

  const userNumber = (userNumberSelect && userNumberSelect.value || '').trim();
  if (!userNumber) {
    statusLabel.textContent = 'Select your own phone number first.';
    statusLabel.className = 'status-label error';
    return;
  }

  if (!selectedHandle) {
    statusLabel.textContent = 'Pick a contact to export.';
    statusLabel.className = 'status-label error';
    return;
  }

  step2NextButton.disabled = true;
  if (pickChatDbButton) pickChatDbButton.disabled = true;
  statusLabel.textContent = 'Choose where to save your XML…';
  statusLabel.className = 'status-label';

  try {
    const outputPath = await window.electronAPI.selectOutputXml();
    if (!outputPath) {
      statusLabel.textContent = 'Export canceled: no output file selected.';
      statusLabel.className = 'status-label error';
      return;
    }

    statusLabel.textContent = 'Creating XML for this conversation…';
    const contactNumber = selectedHandle;

    const result = await window.electronAPI.convertConversation(
      chatDbPath,
      selectedHandle,
      userNumber,
      contactNumber,
      outputPath,
      chatDbBookmark
    );

    if (result.ok) {
      statusLabel.textContent = 'Done! XML saved for this conversation at:\n' + outputPath;
      statusLabel.className = 'status-label success';

      const fileNameParts = outputPath.split(/[/\\]/);
      const fileName = fileNameParts[fileNameParts.length - 1] || 'conversation.xml';

      try {
        const uploadResult = await window.electronAPI.uploadXmlToFirebase(outputPath, fileName);
        if (!uploadResult || !uploadResult.ok) {
          console.error('Firebase upload failed:', uploadResult && uploadResult.error);
          statusLabel.textContent = 'Done! XML saved for this conversation at:\n' + outputPath;
          statusLabel.className = 'status-label success';
          step3Completed = true;
          updateSideSteps();
        } else {
          statusLabel.textContent =
            'Done! XML saved for this conversation at:\n' + outputPath;
          statusLabel.className = 'status-label success';

          step3Completed = true;
          updateSideSteps();
        }
      } catch (uploadErr) {
        console.error('Unexpected error during Firebase upload:', uploadErr);
        statusLabel.textContent = 'Done! XML saved for this conversation at:\n' + outputPath;
        statusLabel.className = 'status-label success';
        step3Completed = true;
        updateSideSteps();
      }
    } else {
      statusLabel.textContent = 'Export failed: ' + result.error;
      statusLabel.className = 'status-label error';
    }
  } catch (err) {
    statusLabel.textContent = 'Unexpected error while exporting: ' + (err.message || String(err));
    statusLabel.className = 'status-label error';
  } finally {
    step2NextButton.disabled = false;
    if (pickChatDbButton) pickChatDbButton.disabled = false;
  }

  updateSideSteps();
  updateStepSections();
  });
}

async function loadContacts() {
  if (!chatDbPath) {
    throw new Error('No chat.db selected');
  }
  if (!contactSelect || !threadContainer) {
    throw new Error('Contact UI is not ready');
  }

  contactSelect.disabled = true;
  threadContainer.innerHTML = '<div class="thread-placeholder">Loading contacts…</div>';

  try {
    const result = await window.electronAPI.listContacts(chatDbPath, chatDbBookmark);
    if (!result.ok) {
      threadContainer.innerHTML =
        '<div class="thread-placeholder">Failed to load contacts: ' + result.error + '</div>';
      throw new Error(result.error || 'Failed to load contacts');
    }

    await populateContacts(result.contacts || []);
  } finally {
    contactSelect.disabled = false;
  }
}

async function populateContacts(contacts) {
  if (!contactSelect || !threadContainer) {
    return;
  }

  contactSelect.innerHTML = '<option value="">Select a contact…</option>';
  contactsByHandle = {};
  contactsLoaded = false;

  if (!contacts.length) {
    threadContainer.innerHTML = '<div class="thread-placeholder">No contacts found in this database.</div>';
    return;
  }

  for (const c of contacts) {
    contactsByHandle[c.handle] = c;
    const option = document.createElement('option');
    option.value = c.handle;
    option.textContent = `${c.handle} (${c.messageCount} messages)`;
    contactSelect.appendChild(option);
  }

  threadContainer.innerHTML = '<div class="thread-placeholder">Select a contact to view your messages.</div>';
  updatePairSummary();
  contactsLoaded = true;

  if (window.electronAPI?.listOwnNumberSuggestions) {
    try {
      const suggestions = await window.electronAPI.listOwnNumberSuggestions(chatDbPath, chatDbBookmark);
      if (suggestions?.ok && userNumberDatalist) {
        userNumberDatalist.innerHTML = '';
        for (const handle of suggestions.suggestions || []) {
          const opt = document.createElement('option');
          opt.value = handle;
          userNumberDatalist.appendChild(opt);
        }
        if (userNumberSelect && !userNumberSelect.value.trim() && suggestions.suggestions?.length) {
          userNumberSelect.value = suggestions.suggestions[0];
          updatePairSummary();
        }
      }
    } catch {
      // Suggestions are optional.
    }
  } else if (userNumberDatalist) {
    const seen = new Set();
    userNumberDatalist.innerHTML = '';
    for (const c of contacts) {
      if (!c.handle || seen.has(c.handle)) continue;
      seen.add(c.handle);
      const opt = document.createElement('option');
      opt.value = c.handle;
      userNumberDatalist.appendChild(opt);
    }
  }

  updateSideSteps();
  updateStepSections();
}

function renderThread(messages) {
  if (!threadContainer) {
    return;
  }

  const readable = (messages || []).filter((msg) => msg.body && msg.body !== '[Message]');

  if (!readable.length) {
    threadContainer.innerHTML = '<div class="thread-placeholder">No readable messages to show for this contact.</div>';
    return;
  }

  const snippetSize = 60;
  const snippet = readable.slice(-snippetSize);

  const container = document.createElement('div');
  container.className = 'message-thread';

  for (const msg of snippet) {
    const row = document.createElement('div');
    row.className = 'message-row ' + (msg.isFromMe ? 'me' : 'them');

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = msg.body;
    row.appendChild(bubble);

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    if (msg.dateMs) {
      meta.textContent = new Date(msg.dateMs).toLocaleString();
    } else {
      meta.textContent = msg.isFromMe ? 'You' : 'Them';
    }
    row.appendChild(meta);

    container.appendChild(row);
  }

  threadContainer.innerHTML = '';
  threadContainer.appendChild(container);
  threadContainer.scrollTop = threadContainer.scrollHeight;

  threadCollapsed = false;
  threadContainer.classList.remove('collapsed');
  if (threadToggleIcon) {
    threadToggleIcon.textContent = '▾';
  }
}

function resetPreview() {
  if (contactSelect) {
    contactSelect.innerHTML = '<option value="">Select a contact…</option>';
  }
  if (threadContainer) {
    threadContainer.innerHTML = '<div class="thread-placeholder">Pick a contact to view your message history.</div>';
  }
  threadCollapsed = false;
  if (threadContainer) {
    threadContainer.classList.remove('collapsed');
  }
  if (threadToggleIcon) {
    threadToggleIcon.textContent = '▾';
  }
  contactsLoaded = false;
  selectedHandle = null;

  if (userNumberSelect) {
    userNumberSelect.value = '';
  }

  if (userNumberDatalist) {
    userNumberDatalist.innerHTML = '';
  }

  step3Completed = false;
  updateSideSteps();
  updateStepSections();
}

function updatePairSummary() {
  if (!pairSummary) return;

  const userNumber = (userNumberSelect && userNumberSelect.value || '').trim();
  const contact = selectedHandle || '';

  if (userNumber && contact) {
    pairSummary.textContent =
      `Clarified will export the full conversation between ${userNumber} (you) and ${contact} into a single XML file.`;
  } else if (userNumber && !contact) {
    pairSummary.textContent =
      'Enter your number, then pick a contact to export your full conversation as XML.';
  } else if (!userNumber && contact) {
    pairSummary.textContent =
      'Pick a contact and enter your own number so Clarified can export the full conversation between you and that contact.';
  } else {
    pairSummary.textContent =
      'Once you’ve entered your number and picked a contact, Clarified will export the full conversation between your number and that contact into a single XML file.';
  }
}
