const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orbitAPI', {
  // Primary Hardened API
  getConfig: () => ipcRenderer.invoke('get-config'),
  getThemes: () => ipcRenderer.invoke('get-themes'),
  send: (channel, data) => {
    const allowedChannels = ['toggle-mouse', 'execute-action', 'update-config', 'set-state'];
    if (allowedChannels.includes(channel)) {
      ipcRenderer.send('orbit-api', channel, data);
    }
  },

  // Legacy/Specific Helpers (transitioning to .send)
  onWindowShown: (callback) => ipcRenderer.on('window-shown', (event, data) => callback(data)),
  updateConfig: (config) => ipcRenderer.send('orbit-api', 'update-config', config),
  setIgnoreMouse: (ignore) => ipcRenderer.send('orbit-api', 'toggle-mouse', ignore),
  executeAction: (action) => ipcRenderer.send('orbit-api', 'execute-action', action),
  setState: (mode) => ipcRenderer.send('orbit-api', 'set-state', { mode })
});
