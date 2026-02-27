const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orbitAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getThemes: () => ipcRenderer.invoke('get-themes'),
  hideApp: () => ipcRenderer.send('hide-app'),
  executeAction: (action) => ipcRenderer.send('execute-action', action),
  playSound: (soundType) => ipcRenderer.send('play-sound', soundType),
  onConfigUpdated: (callback) => ipcRenderer.on('config-updated', (event, config) => callback(config)),
  onThemesUpdated: (callback) => ipcRenderer.on('themes-updated', (event, themes) => callback(themes)),
  onWindowShown: (callback) => ipcRenderer.on('window-shown', () => callback()),
  updateRadius: (radius) => ipcRenderer.send('update-radius', radius),
  addAction: (action) => ipcRenderer.send('add-action', action)
});
