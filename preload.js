const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orbitAPI', {
  // Core config & theme
  getConfig:  () => ipcRenderer.invoke('get-config'),
  getThemes:  () => ipcRenderer.invoke('get-themes'),

  // Plugin API
  getPlugins:          () => ipcRenderer.invoke('get-plugins'),
  openPluginsFolder:   () => ipcRenderer.invoke('open-plugins-folder'),
  onPluginBroadcast:   (cb) => ipcRenderer.on('plugin-broadcast', (_, data) => cb(data)),
  sendPluginCommand:   (cmd, data) => ipcRenderer.send('orbit-api', 'plugin-command', { cmd, data }),

  // IPC event listeners
  onWindowShown:   (cb) => ipcRenderer.on('window-shown',   (_, data) => cb(data)),
  onConfigUpdated: (cb) => ipcRenderer.on('config-updated', (_, data) => cb(data)),
  onThemesUpdated: (cb) => ipcRenderer.on('themes-updated', () => cb()),
  onContextUpdate: (cb) => ipcRenderer.on('context-update', (_, data) => cb(data)),
  onPingHealth:    (cb) => ipcRenderer.on('ping-health',    () => cb()),

  // Action helpers
  log:           (level, msg, data) => ipcRenderer.send('orbit-api', 'log', { level, msg, data }),
  updateConfig:  (cfg)    => ipcRenderer.send('orbit-api', 'update-config', cfg),
  setIgnoreMouse:(ignore) => ipcRenderer.send('orbit-api', 'toggle-mouse', ignore),
  executeAction: (action) => ipcRenderer.send('orbit-api', 'execute-action', action),
  setState:      (mode)   => ipcRenderer.send('orbit-api', 'set-state', { mode }),
  send: (channel, data) => {
    const allowed = ['toggle-mouse', 'execute-action', 'update-config', 'set-state', 'pong-health', 'plugin-command'];
    if (allowed.includes(channel)) ipcRenderer.send('orbit-api', channel, data);
  }
});
