const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");

let mainWindow;
const isDev = process.env.NODE_ENV === "development";

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      showWindow();
    }
  });

  app.whenReady().then(createWindow);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    resizable: false,
    movable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));

  mainWindow.on("blur", () => {
    mainWindow.hide();
  });

  // Handle IPC calls securely
  setupIpcHandlers();
}

function showWindow() {
  if (!mainWindow) return;

  const cursorPoint = screen.getCursorScreenPoint();
  const winBounds = mainWindow.getBounds();

  // Center window on cursor position
  mainWindow.setPosition(
    Math.round(cursorPoint.x - winBounds.width / 2),
    Math.round(cursorPoint.y - winBounds.height / 2),
  );

  mainWindow.show();
  mainWindow.focus();
}

function setupIpcHandlers() {
  ipcMain.on("show-app", () => showWindow());
  ipcMain.on("hide-app", () => mainWindow.hide());

  ipcMain.on("execute-action", (event, action) => {
    try {
      handleAction(action);
    } catch (err) {
      console.error(`Action failed: ${action}`, err);
    }
    mainWindow.hide();
  });
}

function handleAction(action) {
  switch (action) {
    case "vscode":
      launchVSCode();
      break;
    case "terminal":
      launchTerminal();
      break;
    case "taskmgr":
      exec("taskmgr.exe");
      break;
    case "downloads":
      exec("explorer.exe shell:Downloads");
      break;
    case "screenshot":
      exec("explorer.exe ms-screenclip:");
      break;
    case "shutdown":
      exec(isDev ? "shutdown /s /t 10" : "shutdown /s /t 0");
      break;
    case "restart":
      exec(isDev ? "shutdown /r /t 10" : "shutdown /r /t 0");
      break;
    case "lock":
      exec("rundll32.exe user32.dll,LockWorkStation");
      break;
  }
}

function launchVSCode() {
  const userPath = path.join(
    process.env.LOCALAPPDATA,
    "Programs",
    "Microsoft VS Code",
    "Code.exe",
  );
  const systemPath = "C:\\Program Files\\Microsoft VS Code\\Code.exe";

  if (fs.existsSync(userPath)) {
    exec(`"${userPath}"`);
  } else if (fs.existsSync(systemPath)) {
    exec(`"${systemPath}"`);
  } else {
    exec("code", (err) => {
      if (err) console.error("VS Code not found in PATH");
    });
  }
}

function launchTerminal() {
  const localPath = path.join(
    process.env.LOCALAPPDATA,
    "Microsoft",
    "WindowsApps",
    "wt.exe",
  );
  if (fs.existsSync(localPath)) {
    exec(`"${localPath}"`);
  } else {
    exec('start "" "wt.exe"', (err) => {
      if (err) console.error("Windows Terminal not found");
    });
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
