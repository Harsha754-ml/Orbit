const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
    getConfig:         ()      => ipcRenderer.invoke('get-config'),
    saveConfig:        (cfg)   => ipcRenderer.invoke('save-config', cfg),
    getThemes:         ()      => ipcRenderer.invoke('get-themes'),
    getPlugins:        ()      => ipcRenderer.invoke('get-plugins'),
    openPluginsFolder: ()      => ipcRenderer.invoke('open-plugins-folder'),
    onConfigUpdated:   (cb)    => ipcRenderer.on('config-updated', (_, data) => cb(data))
});
