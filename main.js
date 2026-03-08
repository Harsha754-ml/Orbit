const { app, BrowserWindow, screen, ipcMain, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Hardened lib modules
const logger = require('./lib/logger');
const orbitState = require('./lib/state');
const { loadConfig, writeConfigSafe } = require('./lib/configLoader');
const { executeApp } = require('./lib/executor');
const { getCursorPositionScaled } = require('./lib/windowUtils');
const contextEngine = require('./lib/contextEngine');
const pluginLoader = require('./lib/pluginLoader');

let mainWindow;
let tray = null;
let config = null;
let rendererCrashCount = 0;
let isReady = false;
let lastTriggerTime = 0;
let watchdogId = null;
const TRIGGER_DEBOUNCE = 150; // ms

// Global Error Boundaries
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err.stack || err);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) showWindow();
  });
  app.whenReady().then(() => {
    config = loadConfig();
    createWindow();
    createTray();
    contextEngine.start();
    
    // Give pluginLoader a reference to the window for broadcasts
    pluginLoader.setWindow(mainWindow);

    // Initialize Plugin API Context
    const pluginContext = {
        config,
        registerAction: (action) => {
            config.actions.push(action);
            if (mainWindow) mainWindow.webContents.send('config-updated', config);
        },
        onStateChange: (handler) => {
            orbitState.on('modeChanged', handler);
        }
    };
    pluginLoader.loadPlugins(pluginContext);

    // Inject "Plugins" entry into the Settings group (in-memory only, not saved to disk)
    const settingsGroup = config.actions.find(a => a.label === 'Settings' && a.type === 'group');
    if (settingsGroup && Array.isArray(settingsGroup.children)) {
        if (!settingsGroup.children.some(c => c.command === 'ui:show-plugins')) {
            settingsGroup.children.push({
                type: 'command',
                label: 'Plugins',
                icon: 'settings.svg',
                command: 'ui:show-plugins'
            });
        }
    }

    isReady = true;
    logger.info('app_ready', { version: '2.0.0-elevated' });
  });
}

// Graceful Shutdown
app.on('before-quit', () => {
    logger.info('app_shutting_down');
});

process.on('SIGTERM', () => {
    app.quit();
});

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'icon.png')); // Replace with your tray icon path
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Orbit', click: () => showWindow() },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setToolTip('Orbit Premium');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => showWindow());
}

function createWindow() {
  config = loadConfig();
  
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Orbit Premium',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.loadFile(path.join(__dirname, 'src/index.html'));

  setupLifecycleGuards(mainWindow);
  setupIpcHandlers();
  setupWatchdog(mainWindow);

  // Fallback / AHK direct show catcher
  mainWindow.on('show', () => {
    triggerReveal();
  });
}

function setupWatchdog(win) {
  if (watchdogId) clearInterval(watchdogId);
  
  watchdogId = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    
    // Heartbeat check
    win.webContents.send('ping-health');
  }, 5000);

  ipcMain.on('pong-health', () => {
    // Healthy
  });
}

function setupLifecycleGuards(win) {
  win.webContents.on('render-process-gone', (event, details) => {
    logger.error('Renderer process gone:', details);
    rendererCrashCount++;
    
    if (rendererCrashCount <= 3) {
      logger.info(`Attempting renderer recovery (Attempt ${rendererCrashCount}/3)...`);
      win.reload();
    } else {
      logger.error('Renderer recovery failed after 3 attempts.');
      app.quit();
    }
  });

  win.on('unresponsive', () => {
    logger.warn('Window detected as unresponsive.');
  });
}

function triggerReveal() {
  if (!isReady || orbitState.isLocked() || !mainWindow) return;

  const now = Date.now();
  if (now - lastTriggerTime < TRIGGER_DEBOUNCE) return;
  lastTriggerTime = now;

  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  
  // Pivot window to the correct display
  mainWindow.setBounds(display.bounds);
  
  // Calculate relative coordinates for the fullscreen window on that display
  const relX = point.x - display.bounds.x;
  const relY = point.y - display.bounds.y;

  orbitState.setCursor(relX, relY);
  orbitState.setMode(orbitState.modes.EXPANDING);

  // Send relative coords to renderer
  mainWindow.webContents.send('window-shown', { x: relX, y: relY });
  
  if (!mainWindow.isVisible()) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    mainWindow.focus();
  }

  rendererCrashCount = 0;
}

function showWindow() {
  triggerReveal();
}

function setupIpcHandlers() {
  ipcMain.handle('get-config', () => config);
  ipcMain.handle('get-themes', () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(__dirname, 'themes.json'), 'utf8'));
    } catch (e) {
      return [];
    }
  });
  ipcMain.handle('get-plugins', () => pluginLoader.getPluginList());
  ipcMain.handle('open-plugins-folder', () => pluginLoader.openPluginsFolder());

  const allowedChannels = ['toggle-mouse', 'execute-action', 'update-config', 'set-state', 'log', 'pong-health', 'plugin-command'];

  ipcMain.on('orbit-api', (event, channel, data) => {
    if (!allowedChannels.includes(channel)) {
      logger.warn(`Blocked unauthorized IPC channel: ${channel}`);
      return;
    }

    switch (channel) {
      case 'toggle-mouse':
        mainWindow.setIgnoreMouseEvents(data, { forward: true });
        break;
      case 'execute-action':
        handleAction(data);
        break;
      case 'update-config':
        config = { ...config, ...data };
        writeConfigSafe(config);
        break;
      case 'set-state':
        orbitState.setMode(data.mode);
        break;
      case 'log':
        logger[data.level || 'info'](`renderer_${data.msg}`, data.data || {});
        break;
      case 'pong-health':
        // Renderer is alive — watchdog satisfied
        break;
      case 'plugin-command':
        if (data && data.cmd) {
          pluginLoader.handleCommand(data.cmd, data.data || {});
        }
        break;
    }
  });

  // Keep compatibility for simple calls if needed
  ipcMain.on('set-ignore-mouse', (event, ignore) => {
    mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
  });

  ipcMain.on('update-config', (event, newConfig) => {
    config = { ...config, ...newConfig };
    writeConfigSafe(config);
  });
}

const { exec } = require('child_process');

function handleAction(action) {
  if (!action) return;

  const { type, path: pathValue, cmd, args } = action;

  if (type === 'custom') {
    if (!pathValue) return;
    executeApp(pathValue, args);
    return;
  }

  if (cmd) {
    exec(cmd, (err) => {
      if (err) logger.error('action_failed', { cmd, error: err.message });
    });
  }
}




contextEngine.on('context-changed', (data) => {
    if (mainWindow) {
        mainWindow.webContents.send('context-update', data);
    }
});

// Hot Reloading
fs.watchFile(path.join(process.cwd(), 'config.json'), () => {
    logger.info('config_hot_reload_triggered');
    config = loadConfig();
    if (mainWindow) mainWindow.webContents.send('config-updated', config);
});

fs.watchFile(path.join(process.cwd(), 'themes.json'), () => {
    logger.info('themes_hot_reload_triggered');
    if (mainWindow) mainWindow.webContents.send('themes-updated');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
