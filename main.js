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
  
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
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

  mainWindow.loadFile('src/index.html');
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.maximize();

  setupLifecycleGuards(mainWindow);
  setupIpcHandlers();
  setupWatchdog(mainWindow);
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

function showWindow() {
  if (!isReady || orbitState.isLocked()) return;

  const now = Date.now();
  if (now - lastTriggerTime < TRIGGER_DEBOUNCE) {
      logger.debug('trigger_rate_limited');
      return;
  }
  lastTriggerTime = now;

  const { x, y, display } = getCursorPositionScaled();
  orbitState.setCursor(x, y);
  orbitState.setMode(orbitState.modes.EXPANDING);

  mainWindow.webContents.send('window-shown', { x, y });
  
  mainWindow.show();
  mainWindow.focus();

  // Reset crash count on successful show
  rendererCrashCount = 0;
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

  const allowedChannels = ['toggle-mouse', 'execute-action', 'update-config', 'set-state'];

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

function handleAction(action) {
  if (type === 'custom') {
    const pathValue = action.path;
    if (!pathValue) return;

    if (pathValue.startsWith('http')) {
      shell.openExternal(pathValue);
    } else if (fs.existsSync(pathValue)) {
      const stats = fs.statSync(pathValue);
      if (stats.isDirectory()) {
        shell.openPath(pathValue);
      } else {
        exec(`"${pathValue}" ${action.args || ''}`);
      }
    } else {
      if (config.devMode) console.error(`Path not found: ${pathValue}`);
    }
    return;
  }

  if (cmd) {
    exec(cmd, (err) => {
      if (err) console.error(`Action failed: ${cmd}`, err);
    });
  }
}

function updateConfig(newValues) {
  config = { ...config, ...newValues };
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    if (mainWindow) mainWindow.webContents.send('config-updated', config);
  } catch (err) {
    console.error('Failed to update config', err);
  }
}

function launchVSCode() {
  const userPath = path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe');
  const systemPath = 'C:\\Program Files\\Microsoft VS Code\\Code.exe';
  if (fs.existsSync(userPath)) exec(`"${userPath}"`);
  else if (fs.existsSync(systemPath)) exec(`"${systemPath}"`);
  else exec('where code', (err, stdout) => {
    if (!err) exec(`"${stdout.trim()}"`);
    else console.error('VS Code not found');
  });
}

function launchTerminal() {
  const localPath = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'wt.exe');
  if (fs.existsSync(localPath)) exec(`"${localPath}"`);
  else exec('start "" "wt.exe"', (err) => {
    if (err) console.error('Windows Terminal not found');
  });
}

const orbitState = require('./lib/state');
const contextEngine = require('./lib/contextEngine');

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
