const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAuthState: () => ipcRenderer.invoke('auth-get-state'),
  signUp: (email, password) => ipcRenderer.invoke('auth-sign-up', { email, password }),
  signIn: (email, password) => ipcRenderer.invoke('auth-sign-in', { email, password }),
  continueAsGuest: () => ipcRenderer.invoke('auth-continue-guest'),
  signOut: () => ipcRenderer.invoke('auth-sign-out'),
  recordExport: () => ipcRenderer.invoke('auth-record-export'),
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
