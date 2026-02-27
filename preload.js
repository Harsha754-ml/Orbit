const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orbitAPI', {
  hideApp: () => ipcRenderer.send('hide-app'),
  executeAction: (action) => ipcRenderer.send('execute-action', action)
});
