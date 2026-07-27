const chatDbLabel = document.getElementById('chatDbPath');
const outputPathLabel = document.getElementById('outputPath');
const exportDescription = document.getElementById('exportDescription');
const pickChatDbButton = document.getElementById('pickChatDb');
const pickOutputButton = document.getElementById('pickOutput');
const convertButton = document.getElementById('convertButton');
const statusLabel = document.getElementById('status');
const loadContactsButton = document.getElementById('loadContactsButton');
const contactSelect = document.getElementById('contactSelect');
const myNumberInput = document.getElementById('myNumberInput');
const myNumberSuggestions = document.getElementById('myNumberSuggestions');
const threadContainer = document.getElementById('threadContainer');
const logoutButton = document.getElementById('logoutButton');
const accountModeBadge = document.getElementById('accountModeBadge');
const accountEmail = document.getElementById('accountEmail');
const openLoginButton = document.getElementById('openLoginButton');
const authStatus = document.getElementById('authStatus');
const navStartButton = document.getElementById('navStartButton');

let chatDbPath = null;
let chatDbBookmark = null;
let outputPath = null;
let outputBookmark = null;
let accountState = null;
let ownNumberSuggestions = [];

function getApi() {
  return window.electronAPI || null;
}

function sanitizeForFilename(value) {
  return (value || 'unknown')
    .replace(/[^\dA-Za-z+_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'unknown';
}

function setStatus(message, kind = '') {
  if (!statusLabel) return;
  statusLabel.textContent = message;
  statusLabel.className = kind ? `status-label clarified-status ${kind}` : 'status-label clarified-status';
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
  if (chatDbLabel) {
    chatDbLabel.textContent = path || 'No database selected';
  }
}

function getSelectedHandle() {
  return contactSelect ? contactSelect.value : '';
}

function buildSuggestedFilename() {
  const myNumber = sanitizeForFilename(myNumberInput ? myNumberInput.value.trim() : '');
  const otherNumber = sanitizeForFilename(getSelectedHandle());
  if (myNumber && otherNumber && myNumber !== 'unknown' && otherNumber !== 'unknown') {
    return `conversation_${myNumber}_to_${otherNumber}.xml`;
  }
  return 'sms_export.xml';
}

function updateExportDescription() {
  if (!exportDescription) return;

  const myNumber = myNumberInput ? myNumberInput.value.trim() : '';
  const handle = getSelectedHandle();

  if (myNumber && handle) {
    exportDescription.textContent = `Clarified will export the full conversation between ${myNumber} (you) and ${handle} into a single XML file.`;
    return;
  }

  exportDescription.textContent = 'Select your phone number and a contact to preview the conversation.';
}

function updateAccountPanel(state) {
  accountState = state;
  if (!accountEmail || !accountModeBadge) return;

  const signedIn = state?.mode === 'firebase' && state?.authenticated;
  accountEmail.textContent = signedIn ? (state.email || 'Signed in') : 'Sign in (optional)';
  accountModeBadge.textContent = signedIn ? 'Account' : 'Guest';
  accountModeBadge.classList.toggle('guest', !signedIn);

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

function formatMessageTimestamp(dateMs) {
  if (!dateMs) return '';
  return new Date(dateMs).toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

async function loadOwnNumberSuggestions() {
  if (!chatDbPath || !getApi()?.listOwnNumberSuggestions) {
    return;
  }

  try {
    const result = await getApi().listOwnNumberSuggestions(chatDbPath, chatDbBookmark);
    if (!result.ok) {
      return;
    }

    ownNumberSuggestions = result.suggestions || [];
    renderOwnNumberSuggestions(ownNumberSuggestions);

    if (myNumberInput && !myNumberInput.value.trim() && ownNumberSuggestions.length) {
      myNumberInput.value = ownNumberSuggestions[0];
      updateExportDescription();
    }
  } catch {
    // Suggestions are optional UI polish.
  }
}

function renderOwnNumberSuggestions(suggestions) {
  if (!myNumberSuggestions) return;

  myNumberSuggestions.innerHTML = '';
  for (const suggestion of suggestions) {
    const option = document.createElement('option');
    option.value = suggestion;
    myNumberSuggestions.appendChild(option);
  }
}

async function loadThreadPreview(handle) {
  if (!handle || !threadContainer || !chatDbPath) {
    return;
  }

  const myNumber = myNumberInput ? myNumberInput.value.trim() : '';
  updateExportDescription();

  if (!myNumber) {
    threadContainer.innerHTML = '<div class="thread-placeholder">Enter your phone number above to preview messages between you and this contact.</div>';
    return;
  }

  threadContainer.innerHTML = '<div class="thread-placeholder">Loading conversation preview…</div>';

  try {
    const result = await getApi().getThread(chatDbPath, handle, chatDbBookmark, {
      myNumber,
      previewLimit: 0
    });

    if (!result.ok) {
      threadContainer.innerHTML = `<div class="thread-placeholder">Failed to load conversation: ${result.error}</div>`;
      return;
    }

    renderThread(result.messages || [], {
      myNumber,
      otherNumber: handle,
      totalCount: result.totalCount || 0
    });

    const total = result.totalCount || result.messages?.length || 0;
    setStatus(`Loaded ${total} message${total === 1 ? '' : 's'} between ${myNumber} and ${handle}.`);
  } catch (err) {
    threadContainer.innerHTML = `<div class="thread-placeholder">Unexpected error: ${err.message || String(err)}</div>`;
  }
}

async function openLoginPopup(message = 'Opening sign-in…') {
  const api = getApi();
  if (!api?.showLoginPopup) {
    setAuthStatus('Sign-in is unavailable in this view.', 'error');
    return { ok: false };
  }

  setAuthBusy(true);
  setAuthStatus(message);
  try {
    const result = await api.showLoginPopup();
    if (!result?.ok) {
      setAuthStatus(result?.error || 'Could not open sign-in.', 'error');
    }
    return result;
  } finally {
    setAuthBusy(false);
  }
}

async function applyDatabaseSelection(selected, { loadContactsAfter = true } = {}) {
  if (!selected?.path) {
    return false;
  }

  chatDbPath = selected.path;
  chatDbBookmark = selected.bookmark || null;
  updateChatDbLabels(selected.path);

  const sourceMessage = selected.source === 'auto' || selected.source === 'stored'
    ? 'Found your Messages database automatically.'
    : 'Database selected.';

  setStatus(loadContactsAfter ? `${sourceMessage} Loading contacts…` : sourceMessage);
  resetPreview();

  if (loadContactsAfter) {
    await loadContacts();
  }

  return true;
}

async function pickDatabase(mode = 'folder') {
  const api = getApi();
  if (!api?.selectChatDb) {
    setStatus('Desktop bridge unavailable. Restart the app.', 'error');
    return;
  }

  const selected = await api.selectChatDb({ mode });
  if (!selected) {
    setStatus('No database selected.');
    return;
  }

  await applyDatabaseSelection(selected);
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
    const result = await getApi().listContacts(chatDbPath, chatDbBookmark);
    if (!result.ok) {
      threadContainer.innerHTML = `<div class="thread-placeholder">Failed to load contacts: ${result.error}</div>`;
      return;
    }

    populateContacts(result.contacts || []);
    await loadOwnNumberSuggestions();
    setStatus('Contacts loaded. Select a contact to preview and export.');
  } catch (err) {
    threadContainer.innerHTML = `<div class="thread-placeholder">Unexpected error: ${err.message || String(err)}</div>`;
  } finally {
    loadContactsButton.disabled = false;
    contactSelect.disabled = false;
  }
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
  updateExportDescription();
}

function renderThread(messages, previewMeta = null) {
  if (!threadContainer) return;

  const readableMessages = messages.filter((message) => message.body && message.body !== '[Message]');
  const visibleMessages = readableMessages.slice(-60);

  if (!visibleMessages.length) {
    threadContainer.innerHTML = '<div class="thread-placeholder">No readable messages to show for this contact. Try reloading contacts after granting Messages access.</div>';
    return;
  }

  threadContainer.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'chat-thread';

  for (const message of visibleMessages) {
    const row = document.createElement('div');
    row.className = `chat-row ${message.isFromMe ? 'chat-row-outgoing' : 'chat-row-incoming'}`;

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${message.isFromMe ? 'chat-bubble-outgoing' : 'chat-bubble-incoming'}`;
    bubble.textContent = message.body;

    const timestamp = document.createElement('div');
    timestamp.className = 'chat-timestamp';
    timestamp.textContent = formatMessageTimestamp(message.dateMs);

    row.appendChild(bubble);
    row.appendChild(timestamp);
    list.appendChild(row);
  }

  threadContainer.appendChild(list);
  threadContainer.scrollTop = threadContainer.scrollHeight;
}

function resetPreview() {
  if (!contactSelect || !threadContainer) return;
  contactSelect.innerHTML = '<option value="">Select a contact…</option>';
  contactSelect.disabled = true;
  threadContainer.innerHTML = '<div class="thread-placeholder">Pick a contact to view your message history.</div>';
  updateExportDescription();
}

function setDefaultOutputPath() {
  if (!outputPathLabel) return;
  outputPath = null;
  outputBookmark = null;
  outputPathLabel.textContent = 'Defaults to Desktop/sms_export.xml';
}

async function bootstrap() {
  setDefaultOutputPath();
  updateExportDescription();

  const api = getApi();
  if (api?.getAuthState) {
    const state = await api.getAuthState();
    applyAuthState(state);
  }

  if (api?.ensureChatDbAccess) {
    setStatus('Loading your Messages database…');
    const access = await api.ensureChatDbAccess({ promptIfNeeded: true });
    if (access?.ok && access.selection) {
      await applyDatabaseSelection(access.selection);
      return;
    }

    if (access?.canceled) {
      setStatus('Allow Messages access to continue. Use Browse DB folder if the prompt was dismissed.', 'error');
      return;
    }
  }

  setStatus('Ready — allow Messages access to begin.');
}

if (pickChatDbButton) {
  pickChatDbButton.addEventListener('click', () => pickDatabase('folder'));
}

if (pickOutputButton) {
  pickOutputButton.addEventListener('click', async () => {
    const selected = await getApi().selectOutputXml(buildSuggestedFilename());
    if (!selected) {
      setStatus('Output location unchanged.');
      return;
    }

    outputPath = selected.path;
    outputBookmark = selected.bookmark || null;
    outputPathLabel.textContent = selected.path;
    setStatus('Save location selected. Ready to export the chosen conversation.');
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
      setStatus('Enter your own phone number before exporting the conversation.', 'error');
      return;
    }

    convertButton.disabled = true;
    if (pickChatDbButton) pickChatDbButton.disabled = true;
    pickOutputButton.disabled = true;
    loadContactsButton.disabled = true;
    contactSelect.disabled = true;
    if (myNumberInput) myNumberInput.disabled = true;
    setStatus('Saving conversation XML… this may take a moment.');

    try {
      let output = outputPath;
      if (!output) {
        const selected = await getApi().selectOutputXml(buildSuggestedFilename());
        if (!selected) {
          setStatus('Export canceled: no output file selected.', 'error');
          return;
        }

        outputPath = selected.path;
        outputBookmark = selected.bookmark || null;
        output = selected.path;
        outputPathLabel.textContent = selected.path;
      }

      const result = await getApi().convertThread(
        chatDbPath,
        handle,
        output,
        chatDbBookmark,
        outputBookmark
      );

      if (!result.ok) {
        setStatus(`Export failed: ${result.error}`, 'error');
        return;
      }

      const exportResult = await getApi().recordExport();
      if (exportResult.ok) {
        updateAccountPanel(exportResult.state);
      }

      const count = result.messageCount ? `${result.messageCount} messages saved` : 'Conversation saved';
      setStatus(`Done! ${count} to:\n${output}`, 'success');
    } catch (err) {
      setStatus(`Unexpected error: ${err.message || String(err)}`, 'error');
    } finally {
      convertButton.disabled = false;
      if (pickChatDbButton) pickChatDbButton.disabled = false;
      pickOutputButton.disabled = false;
      loadContactsButton.disabled = false;
      contactSelect.disabled = false;
      if (myNumberInput) myNumberInput.disabled = false;
    }
  });
}

if (loadContactsButton) {
  loadContactsButton.addEventListener('click', loadContacts);
}

if (contactSelect) {
  contactSelect.addEventListener('change', async () => {
    const handle = contactSelect.value;
    updateExportDescription();
    if (!handle) {
      threadContainer.innerHTML = '<div class="thread-placeholder">Pick a contact to view your message history.</div>';
      return;
    }

    await loadThreadPreview(handle);
  });
}

if (myNumberInput) {
  myNumberInput.addEventListener('input', () => {
    updateExportDescription();
    const handle = getSelectedHandle();
    if (handle) {
      void loadThreadPreview(handle);
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
    const result = await getApi().signOut();
    if (!result.ok) {
      setAuthStatus(result.error || 'Could not sign out.', 'error');
      return;
    }

    applyAuthState(result.state);
    setStatus('Signed out. You can keep exporting locally without an account.');
  });
}

if (navStartButton) {
  navStartButton.addEventListener('click', async () => {
    const api = getApi();
    if (api?.openWelcome) {
      await api.openWelcome();
      return;
    }
    window.location.href = 'welcome.html';
  });
}

void bootstrap();

const api = getApi();
if (api?.onAuthStateChanged) {
  api.onAuthStateChanged((state) => {
    applyAuthState(state);
    if (state?.authenticated) {
      setStatus('Signed in. Export counts will sync when you save a conversation.', 'success');
    }
  });
}
