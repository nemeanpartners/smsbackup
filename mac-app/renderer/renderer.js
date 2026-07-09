const chatDbLabel = document.getElementById('chatDbPath');
const outputPathLabel = document.getElementById('outputPath');
const pickChatDbButton = document.getElementById('pickChatDb');
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

const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const signInButton = document.getElementById('signInButton');
const signUpButton = document.getElementById('signUpButton');
const guestButton = document.getElementById('guestButton');
const authStatus = document.getElementById('authStatus');
const authConfigNotice = document.getElementById('authConfigNotice');

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
  authStatus.textContent = message;
  authStatus.className = kind ? `status-label ${kind}` : 'status-label';
}

function setAuthBusy(isBusy) {
  if (authEmail) authEmail.disabled = isBusy;
  if (authPassword) authPassword.disabled = isBusy;
  if (signInButton) signInButton.disabled = isBusy;
  if (signUpButton) signUpButton.disabled = isBusy;
  if (guestButton) guestButton.disabled = isBusy;
  if (openLoginButton) openLoginButton.disabled = isBusy;
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

  accountEmail.textContent = state?.email || 'Not signed in';
  accountModeBadge.textContent = state?.mode === 'firebase' ? 'Account' : 'Guest';
  accountModeBadge.classList.toggle('guest', state?.mode !== 'firebase');

  const exportCount = Number(state?.exportCount || 0);
  accountExports.textContent = `${exportCount} export${exportCount === 1 ? '' : 's'} recorded`;
}

function updateAuthGate(state) {
  const authenticated = Boolean(state?.authenticated);
  if (authenticated) {
    setAuthStatus('Connected. Local export tools are ready.', 'success');
    return;
  }

  const fallbackMessage = state?.error || 'Local export tools are visible now. Use the popup only if you want account sync.';
  setAuthStatus(fallbackMessage, state?.error ? 'error' : '');
}

async function openHostedLogin(message = 'Opening secure login…') {
  setAuthBusy(true);
  setAuthStatus(message);
  try {
    const result = await window.electronAPI.showHostedLogin();
    if (!result.ok) {
      setAuthStatus(result.error || 'Could not open the hosted login popup.', 'error');
    }
    return result;
  } finally {
    setAuthBusy(false);
  }
}

async function hydrateAuthState() {
  return window.electronAPI.getAuthState();
}

function applyAuthState(state) {
  updateAccountPanel(state);
  updateAuthGate(state);
}

async function routeAuthenticatedUser() {
  const state = await hydrateAuthState();
  applyAuthState(state);

  if (!state.authenticated) {
    setStatus('Local export workspace ready. Use the left menu to sign in if you want synced account tracking.');
    return;
  }

  setStatus('Account connected. You can now export conversation XML.', 'success');
}

if (authForm) {
  authForm.addEventListener('submit', (event) => {
    event.preventDefault();
  });
}

if (guestButton && !authForm) {
  guestButton.addEventListener('click', async () => {
    await openHostedLogin('Opening hosted login…');
  });
}

if (openLoginButton) {
  openLoginButton.addEventListener('click', async () => {
    await openHostedLogin('Opening secure login…');
  });
}

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    const result = await window.electronAPI.signOut();
    if (!result.ok) {
      setStatus(result.error || 'Could not sign out.', 'error');
      return;
    }

    applyAuthState(result.state);
    setStatus('Signed out. Reconnect in the popup to continue exporting.');
  });
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
  pickChatDbButton.addEventListener('click', async () => {
    const selected = await window.electronAPI.selectChatDb();
    if (!selected) {
      setStatus('No database selected.');
      return;
    }

    chatDbPath = selected.path;
    chatDbBookmark = selected.bookmark || null;
    chatDbLabel.textContent = selected.path;
    setStatus('Database selected. Loading contacts…');
    resetPreview();
    await loadContacts();
  });
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
    pickChatDbButton.disabled = true;
    pickOutputButton.disabled = true;
    loadContactsButton.disabled = true;
    contactSelect.disabled = true;
    if (myNumberInput) {
      myNumberInput.disabled = true;
    }
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
      pickChatDbButton.disabled = false;
      pickOutputButton.disabled = false;
      loadContactsButton.disabled = false;
      contactSelect.disabled = false;
      if (myNumberInput) {
        myNumberInput.disabled = false;
      }
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
  loadContactsButton.addEventListener('click', async () => {
    await loadContacts();
  });
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

void routeAuthenticatedUser();

if (window.electronAPI.onAuthStateChanged) {
  window.electronAPI.onAuthStateChanged((state) => {
    applyAuthState(state);
    if (state?.authenticated) {
      setStatus('Account connected. You can now export conversation XML.', 'success');
    }
  });
}
