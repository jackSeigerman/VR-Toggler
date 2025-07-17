const { app, BrowserWindow, Tray, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
let tray = null;
let win = null;
let steamvrPath = null;

// Path to store the configuration in the same directory as the app
const configPath = path.join(__dirname, 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      steamvrPath = config.steamvrPath;
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
}

function saveConfig() {
  try {
    const config = { steamvrPath };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Error saving config:', err);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 300,
    height: 350,
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
        { 
      label: canToggle ? `Switch to ${otherMode}` : 'Set folder path first',
      enabled: canToggle,
      click: () => toggleFolder()
    },
    { type: 'separator' },
    { label: 'Open App', click: () => win.show() },

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
    saveConfig();
    updateTrayMenu();
    if (win) {
      win.webContents.send('status', `Renamed to ${newName}`);
      // Send button update after successful toggle
      const otherMode = getOtherMode();
      win.webContents.send('update-button', otherMode);
    }
  } catch (err) {
    if (win) win.webContents.send('status', `Error: ${err.message}`);
  }
}


// Add this new handler to send button text updates
ipcMain.on('request-button-update', () => {
  if (win) {
    const otherMode = getOtherMode();
    win.webContents.send('update-button', otherMode);
  }
});

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
    saveConfig(); // Save the config when folder is selected
    updateTrayMenu(); // Update the tray menu when folder is set
    win.webContents.send('status', `Folder set to ${steamvrPath}`);
  }
});

ipcMain.on('exit-app', () => {
  tray.destroy();
  app.quit();
});

app.whenReady().then(() => {
  loadConfig(); // Load saved configuration on startup
  createWindow();
  createTray();
});