const { app, BrowserWindow, Tray, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
let tray = null;
let win = null;
let steamvrPath = null; // This holds current selected path (not persisted)

function createWindow() {
  win = new BrowserWindow({
    width: 600,
    height: 480,
    show: false,
    resizable: false,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  win.loadFile('index.html');
  win.on('close', (e) => {
    e.preventDefault();
    win.hide();
  });
}

function getCurrentMode() {
  if (!steamvrPath || !fs.existsSync(steamvrPath)) {
    return 'Unknown';
  }
  const basename = path.basename(steamvrPath);
  return basename.endsWith('_') ? 'Desktop Mode' : 'VR Mode';
}

function getOtherMode() {
  const currentMode = getCurrentMode();
  if (currentMode === 'VR Mode') return 'Desktop Mode';
  if (currentMode === 'Desktop Mode') return 'VR Mode';
  return 'Unknown';
}

function updateTrayMenu() {
  if (!tray) return;
  
  const currentMode = getCurrentMode();
  const otherMode = getOtherMode();
  const canToggle = steamvrPath && fs.existsSync(steamvrPath);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open App', click: () => win.show() },
    { type: 'separator' },
    { 
      label: canToggle ? `Switch to ${otherMode}` : 'Set folder path first',
      enabled: canToggle,
      click: () => toggleFolder()
    },
    { type: 'separator' },
    { label: 'Quit', click: () => {
      tray.destroy();
      app.quit();
    }}
  ]);
  
  tray.setContextMenu(contextMenu);
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.ico'));
  tray.setToolTip('SteamVR Toggler');
  updateTrayMenu();
  tray.on('double-click', () => win.show());
}

function toggleFolder() {
  if (!steamvrPath || !fs.existsSync(steamvrPath)) {
    if (win) win.webContents.send('status', 'Folder not set or does not exist');
    return;
  }
  
  const dirname = path.dirname(steamvrPath);
  const basename = path.basename(steamvrPath);
  const isDisabled = basename.endsWith('_');
  const newName = isDisabled ? basename.slice(0, -1) : basename + '_';
  const newPath = path.join(dirname, newName);
  
  try {
    fs.renameSync(steamvrPath, newPath);
    steamvrPath = newPath;
    updateTrayMenu(); // Update the tray menu after toggling
    if (win) win.webContents.send('status', `Renamed to ${newName}`);
  } catch (err) {
    if (win) win.webContents.send('status', `Error: ${err.message}`);
  }
}

// Handle messages from HTML
ipcMain.on('toggle-folder', () => {
  toggleFolder();
});

ipcMain.on('choose-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    steamvrPath = result.filePaths[0];
    updateTrayMenu(); // Update the tray menu when folder is set
    win.webContents.send('status', `Folder set to ${steamvrPath}`);
  }
});

ipcMain.on('exit-app', () => {
  tray.destroy();
  app.quit();
});

app.whenReady().then(() => {
  createWindow();
  createTray();
});