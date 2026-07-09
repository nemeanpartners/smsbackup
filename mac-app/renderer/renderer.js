const chatDbLabel = document.getElementById('chatDbPath');
const chatDbLabelSecondary = document.getElementById('chatDbPathSecondary');
const outputPathLabel = document.getElementById('outputPath');
const pickChatDbButton = document.getElementById('pickChatDb');
const pickChatDbSecondaryButton = document.getElementById('pickChatDbSecondary');
const pickOutputButton = document.getElementById('pickOutput');
const convertButton = document.getElementById('convertButton');
const statusLabel = document.getElementById('status');
const loadContactsButton = document.getElementById('loadContactsButton');
const contactSelect = document.getElementById('contactSelect');
const myNumberInput = document.getElementById('myNumberInput');
const selectedContactNumber = document.getElementById('selectedContactNumber');
const threadContainer = document.getElementById('threadContainer');
const threadToggle = document.getElementById('threadToggle');
const threadToggleIcon = document.getElementById('threadToggleIcon');
const logoutButton = document.getElementById('logoutButton');
const accountModeBadge = document.getElementById('accountModeBadge');
const accountEmail = document.getElementById('accountEmail');
const accountExports = document.getElementById('accountExports');
const openLoginButton = document.getElementById('openLoginButton');
const authStatus = document.getElementById('authStatus');

let chatDbPath = null;
let chatDbBookmark = null;
let outputPath = null;
let outputBookmark = null;
let threadCollapsed = false;
let accountState = null;

function sanitizeForFilename(value) {
  return (value || 'unknown')
    .replace(/[^\dA-Za-z+_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'unknown';
}

function setStatus(message, kind = '') {
  if (!statusLabel) return;
  statusLabel.textContent = message;
  statusLabel.className = kind ? `status-label ${kind}` : 'status-label';
}

function setAuthStatus(message, kind = '') {
  if (!authStatus) return;
  if (!message) {
    authStatus.textContent = '';
    authStatus.className = 'sidebar-status hidden';
    return;
  }

  authStatus.textContent = message;
  authStatus.className = kind ? `sidebar-status ${kind}` : 'sidebar-status';
}

function setAuthBusy(isBusy) {
  if (openLoginButton) openLoginButton.disabled = isBusy;
}

function updateChatDbLabels(path) {
  const label = path || 'No database selected';
  if (chatDbLabel) chatDbLabel.textContent = label;
  if (chatDbLabelSecondary) chatDbLabelSecondary.textContent = path || 'No file selected';
}

function getSelectedHandle() {
  return contactSelect ? contactSelect.value : '';
}

function buildSuggestedFilename() {
  const myNumber = sanitizeForFilename(myNumberInput ? myNumberInput.value.trim() : '');
  const otherNumber = sanitizeForFilename(getSelectedHandle());
  return `conversation_${myNumber}_to_${otherNumber}.xml`;
}

function updateSelectedContactNumber() {
  if (!selectedContactNumber) return;
  const handle = getSelectedHandle();
  selectedContactNumber.value = handle || 'No contact selected yet';
}

function updateAccountPanel(state) {
  accountState = state;
  if (!accountEmail || !accountModeBadge || !accountExports) return;

  const signedIn = state?.mode === 'firebase' && state?.authenticated;
  accountEmail.textContent = signedIn ? (state.email || 'Signed in') : 'Sign in (optional)';
  accountModeBadge.textContent = signedIn ? 'Account' : 'Guest';
  accountModeBadge.classList.toggle('guest', !signedIn);

  const exportCount = Number(state?.exportCount || 0);
  accountExports.textContent = signedIn
    ? `${exportCount} export${exportCount === 1 ? '' : 's'} synced`
    : 'Export count not synced';

  if (logoutButton) {
    logoutButton.classList.toggle('hidden', !signedIn);
  }
}

function applyAuthState(state) {
  updateAccountPanel(state);
  if (state?.authenticated) {
    setAuthStatus('Signed in. Export counts will sync to your account.', 'success');
  } else {
    setAuthStatus('');
  }
}

async function openLoginPopup(message = 'Opening sign-in…') {
  setAuthBusy(true);
  setAuthStatus(message);
  try {
    const result = await window.electronAPI.showLoginPopup();
    if (!result.ok) {
      setAuthStatus(result.error || 'Could not open sign-in.', 'error');
    }
    return result;
  } finally {
    setAuthBusy(false);
  }
}

async function pickDatabase() {
  const selected = await window.electronAPI.selectChatDb();
  if (!selected) {
    setStatus('No database selected.');
    return;
  }

  chatDbPath = selected.path;
  chatDbBookmark = selected.bookmark || null;
  updateChatDbLabels(selected.path);
  setStatus('Database selected. Loading contacts…');
  resetPreview();
  await loadContacts();
}

async function loadContacts() {
  if (!loadContactsButton || !contactSelect || !threadContainer) return;
  if (!chatDbPath) {
    setStatus('Select your iPhone chat.db first.', 'error');
    return;
  }

  loadContactsButton.disabled = true;
  contactSelect.disabled = true;
  threadContainer.innerHTML = '<div class="thread-placeholder">Loading contacts…</div>';

  try {
    const result = await window.electronAPI.listContacts(chatDbPath, chatDbBookmark);
    if (!result.ok) {
      threadContainer.innerHTML = `<div class="thread-placeholder">Failed to load contacts: ${result.error}</div>`;
      return;
    }

    populateContacts(result.contacts || []);
    setStatus('Contacts loaded. Select a contact to preview and export.');
  } catch (err) {
    threadContainer.innerHTML = `<div class="thread-placeholder">Unexpected error: ${err.message || String(err)}</div>`;
  } finally {
    loadContactsButton.disabled = false;
    contactSelect.disabled = false;
  }
}

if (pickChatDbButton) {
  pickChatDbButton.addEventListener('click', pickDatabase);
}

if (pickChatDbSecondaryButton) {
  pickChatDbSecondaryButton.addEventListener('click', pickDatabase);
}

if (pickOutputButton) {
  pickOutputButton.addEventListener('click', async () => {
    const selected = await window.electronAPI.selectOutputXml(buildSuggestedFilename());
    if (!selected) {
      setStatus('Output location unchanged.');
      return;
    }

    outputPath = selected.path;
    outputBookmark = selected.bookmark || null;
    outputPathLabel.textContent = selected.path;
    setStatus('Save location selected. Ready to extract the chosen conversation.');
  });
}

if (convertButton) {
  convertButton.addEventListener('click', async () => {
    if (!chatDbPath) {
      setStatus('Select your iPhone chat.db first.', 'error');
      return;
    }

    const handle = getSelectedHandle();
    if (!handle) {
      setStatus('Select the other person\'s contact number first.', 'error');
      return;
    }

    const myNumber = myNumberInput ? myNumberInput.value.trim() : '';
    if (!myNumber) {
      setStatus('Enter your own phone number before extracting the conversation.', 'error');
      return;
    }

    convertButton.disabled = true;
    if (pickChatDbButton) pickChatDbButton.disabled = true;
    if (pickChatDbSecondaryButton) pickChatDbSecondaryButton.disabled = true;
    pickOutputButton.disabled = true;
    loadContactsButton.disabled = true;
    contactSelect.disabled = true;
    if (myNumberInput) myNumberInput.disabled = true;
    setStatus('Extracting conversation XML… this may take a moment.');

    try {
      let output = outputPath;
      if (!output) {
        const selected = await window.electronAPI.selectOutputXml(buildSuggestedFilename());
        if (!selected) {
          setStatus('Extraction canceled: no output file selected.', 'error');
          return;
        }

        outputPath = selected.path;
        outputBookmark = selected.bookmark || null;
        output = selected.path;
        outputPathLabel.textContent = selected.path;
      }

      const result = await window.electronAPI.convertThread(
        chatDbPath,
        handle,
        output,
        chatDbBookmark,
        outputBookmark
      );

      if (!result.ok) {
        setStatus(`Extraction failed: ${result.error}`, 'error');
        return;
      }

      const exportResult = await window.electronAPI.recordExport();
      if (exportResult.ok) {
        updateAccountPanel(exportResult.state);
      }

      setStatus(`Done! The selected conversation XML is ready at:\n${output}`, 'success');
    } catch (err) {
      setStatus(`Unexpected error: ${err.message || String(err)}`, 'error');
    } finally {
      convertButton.disabled = false;
      if (pickChatDbButton) pickChatDbButton.disabled = false;
      if (pickChatDbSecondaryButton) pickChatDbSecondaryButton.disabled = false;
      pickOutputButton.disabled = false;
      loadContactsButton.disabled = false;
      contactSelect.disabled = false;
      if (myNumberInput) myNumberInput.disabled = false;
    }
  });
}

if (threadToggle) {
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

if (loadContactsButton) {
  loadContactsButton.addEventListener('click', loadContacts);
}

if (contactSelect) {
  contactSelect.addEventListener('change', async () => {
    const handle = contactSelect.value;
    updateSelectedContactNumber();
    if (!handle) {
      threadContainer.innerHTML = '<div class="thread-placeholder">Pick a contact to view your message history.</div>';
      return;
    }

    if (!chatDbPath) return;

    threadContainer.innerHTML = '<div class="thread-placeholder">Loading conversation…</div>';

    try {
      const result = await window.electronAPI.getThread(chatDbPath, handle, chatDbBookmark);
      if (!result.ok) {
        threadContainer.innerHTML = `<div class="thread-placeholder">Failed to load conversation: ${result.error}</div>`;
        return;
      }

      renderThread(result.messages || []);
      setStatus('Ready to extract XML for this specific conversation.');
    } catch (err) {
      threadContainer.innerHTML = `<div class="thread-placeholder">Unexpected error: ${err.message || String(err)}</div>`;
    }
  });
}

if (openLoginButton) {
  openLoginButton.addEventListener('click', async () => {
    if (accountState?.authenticated) {
      return;
    }
    await openLoginPopup('Opening sign-in window…');
  });
}

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    const result = await window.electronAPI.signOut();
    if (!result.ok) {
      setAuthStatus(result.error || 'Could not sign out.', 'error');
      return;
    }

    applyAuthState(result.state);
    setStatus('Signed out. You can keep exporting locally without an account.');
  });
}

function populateContacts(contacts) {
  if (!contactSelect || !threadContainer) return;

  contactSelect.innerHTML = '<option value="">Select a contact…</option>';

  if (!contacts.length) {
    threadContainer.innerHTML = '<div class="thread-placeholder">No contacts found in this database.</div>';
    return;
  }

  for (const contact of contacts) {
    const option = document.createElement('option');
    option.value = contact.handle;
    option.textContent = `${contact.handle} (${contact.messageCount} messages)`;
    contactSelect.appendChild(option);
  }

  threadContainer.innerHTML = '<div class="thread-placeholder">Select a contact to view your messages.</div>';
}

function renderThread(messages) {
  if (!threadContainer || !threadToggleIcon) return;

  if (!messages.length) {
    threadContainer.innerHTML = '<div class="thread-placeholder">No messages to show for this contact.</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'thread-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const thDir = document.createElement('th');
  thDir.textContent = 'Direction';
  thDir.className = 'col-direction';
  headerRow.appendChild(thDir);

  const thTime = document.createElement('th');
  thTime.textContent = 'Time';
  thTime.className = 'col-timestamp';
  headerRow.appendChild(thTime);

  const thBody = document.createElement('th');
  thBody.textContent = 'Message';
  headerRow.appendChild(thBody);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const message of messages) {
    const tr = document.createElement('tr');

    const tdDir = document.createElement('td');
    tdDir.textContent = message.isFromMe ? 'Me' : 'Them';
    tr.appendChild(tdDir);

    const tdTime = document.createElement('td');
    tdTime.textContent = message.dateMs ? new Date(message.dateMs).toLocaleString() : '';
    tr.appendChild(tdTime);

    const tdBody = document.createElement('td');
    tdBody.textContent = message.body || '';
    tr.appendChild(tdBody);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  threadContainer.innerHTML = '';
  threadContainer.appendChild(table);

  threadCollapsed = false;
  threadContainer.classList.remove('collapsed');
  threadToggleIcon.textContent = '▾';
}

function resetPreview() {
  if (!contactSelect || !threadContainer || !threadToggleIcon) return;
  contactSelect.innerHTML = '<option value="">Select a contact…</option>';
  contactSelect.disabled = true;
  updateSelectedContactNumber();
  threadContainer.innerHTML = '<div class="thread-placeholder">Pick a contact to view your message history.</div>';
  threadCollapsed = false;
  threadContainer.classList.remove('collapsed');
  threadToggleIcon.textContent = '▾';
}

async function bootstrap() {
  const state = await window.electronAPI.getAuthState();
  applyAuthState(state);
  setStatus('Ready — browse a database to begin.');
}

void bootstrap();

if (window.electronAPI.onAuthStateChanged) {
  window.electronAPI.onAuthStateChanged((state) => {
    applyAuthState(state);
    if (state?.authenticated) {
      setStatus('Signed in. Export counts will sync when you extract XML.', 'success');
    }
  });
}
