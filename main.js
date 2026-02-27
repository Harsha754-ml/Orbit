const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

let mainWindow;
let config;
let themes;

const CONFIG_PATH = app.isPackaged 
  ? path.join(app.getPath('userData'), 'config.json') 
  : path.join(__dirname, 'config.json');
const THEMES_PATH = app.isPackaged 
  ? path.join(app.getPath('userData'), 'themes.json') 
  : path.join(__dirname, 'themes.json');

const DEFAULT_CONFIG_PATH = path.join(__dirname, 'config.json');
const DEFAULT_THEMES_PATH = path.join(__dirname, 'themes.json');

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) showWindow();
  });
  app.whenReady().then(() => {
    ensureFilesExist();
    loadConfig();
    loadThemes();
    createWindow();
    watchFiles();
  });
}

function ensureFilesExist() {
  if (app.isPackaged) {
    if (!fs.existsSync(CONFIG_PATH) && fs.existsSync(DEFAULT_CONFIG_PATH)) {
      fs.copyFileSync(DEFAULT_CONFIG_PATH, CONFIG_PATH);
    }
    if (!fs.existsSync(THEMES_PATH) && fs.existsSync(DEFAULT_THEMES_PATH)) {
      fs.copyFileSync(DEFAULT_THEMES_PATH, THEMES_PATH);
    }
  }
}

function loadConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(data);
  } catch (err) {
    console.error('Failed to load config, using defaults', err);
    config = { radius: 140, activeTheme: 'Dark Neon', actions: [] };
  }
}

function loadThemes() {
  try {
    const data = fs.readFileSync(THEMES_PATH, 'utf8');
    themes = JSON.parse(data);
  } catch (err) {
    console.error('Failed to load themes', err);
    themes = [];
  }
}

function watchFiles() {
  fs.watchFile(CONFIG_PATH, () => {
    loadConfig();
    if (mainWindow) mainWindow.webContents.send('config-updated', config);
  });
  fs.watchFile(THEMES_PATH, () => {
    loadThemes();
    if (mainWindow) mainWindow.webContents.send('themes-updated', themes);
  });
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Click-through by default — renderer toggles this
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  setupIpcHandlers();
}

function showWindow() {
  if (!mainWindow) return;
  const cursorPoint = screen.getCursorScreenPoint();
  // Send cursor position so renderer knows where to center
  mainWindow.show();
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.webContents.send('window-shown', cursorPoint);
}

function setupIpcHandlers() {
  ipcMain.handle('get-config', () => config);
  ipcMain.handle('get-themes', () => themes);

  ipcMain.on('hide-app', () => {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.hide();
  });

  // Mouse event toggle — renderer controls this
  ipcMain.on('set-ignore-mouse', (event, ignore) => {
    if (!mainWindow) return;
    if (ignore) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      mainWindow.setIgnoreMouseEvents(false);
    }
  });

  ipcMain.on('execute-action', (event, action) => {
    handleAction(action);
    if (!config.devMode) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
      mainWindow.hide();
    }
  });

  ipcMain.on('update-radius', (event, radius) => {
    updateConfig({ radius: radius, primaryRadius: radius });
  });

  ipcMain.on('add-action', (event, newAction) => {
    const actions = [...config.actions, newAction];
    updateConfig({ actions: actions });
  });
}

function handleAction(action) {
  const cmd = action.command;
  const type = action.type;
  
  if (cmd === 'auto-detect') {
    if (action.label === 'VS Code') launchVSCode();
    else if (action.label === 'Terminal') launchTerminal();
    return;
  }

  if (cmd && cmd.startsWith('theme:')) {
    const themeName = cmd.replace('theme:', '');
    updateConfig({ activeTheme: themeName });
    return;
  }

  if (cmd && cmd.startsWith('ui:toggle-')) {
    if (cmd === 'ui:toggle-labels') updateConfig({ showHoverLabels: !config.showHoverLabels });
    else if (cmd === 'ui:toggle-sound') updateConfig({ enableSoundEffects: !config.enableSoundEffects });
    else if (cmd === 'ui:toggle-dev') updateConfig({ devMode: !config.devMode });
    return;
  }

  // Custom Action Logic
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
