const { app, BrowserWindow, Tray, Menu, dialog, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
let tray = null;
let win = null;
let steamvrPath = null;

// Path to store the configuration in the same directory as the app
const configPath = path.join(__dirname, 'config.json');






    
function loadConfig() {
  try {
    let configExists = false;
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      steamvrPath = config.steamvrPath;
      configExists = true;
    }
    
    // Only try to find the folder automatically if config doesn't exist or steamvrPath is empty
    if (!configExists || !steamvrPath) {
      const steamCommonPath = 'C:\\Program Files (x86)\\Steam\\steamapps\\common';
      const steamvrFolderPath = path.join(steamCommonPath, 'SteamVR');
      
      if (fs.existsSync(steamvrFolderPath)) {
        steamvrPath = steamvrFolderPath;
        saveConfig(); // Save the auto-discovered path
        console.log('SteamVR folder found automatically:', steamvrPath);
      } else {
        // Show popup if SteamVR folder is not found
        showSteamVRNotFoundDialog();
      }
    }
    
    // Update tray menu after config is loaded
    updateTrayMenu();
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
function showSteamVRNotFoundDialog() {
  // Wait for app to be ready before showing dialog
  app.whenReady().then(() => {
    const result = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'SteamVR Folder Not Found',
      message: 'SteamVR folder not found in the default Steam location.',
      detail: 'Please manually select your SteamVR folder through the Settings menu.',
      buttons: ['OK', 'Browse Now'],
      defaultId: 0
    });
    
    if (result === 1) { // User clicked "Browse Now"
      // Show the main window and open settings
      if (win) {
        win.show();
        win.webContents.once('dom-ready', () => {
          win.webContents.executeJavaScript('showSettings();');
        });
      }
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 250,
    height: 300,
    show: false,
    resizable: false,
     autoHideMenuBar: true,
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
  // Check if it ends with underscore (disabled/desktop mode)
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
    
    // Determine the new mode for notification
    const newMode = isDisabled ? 'VR Mode' : 'Desktop Mode';
    
    // Show Windows notification
    const notification = new Notification({
      title: 'VR Toggler',
      body: `Switched to ${newMode}`,
      icon: path.join(__dirname, 'icon.ico'),
      silent: true,
    });
    notification.show();
    
    if (win) {
      win.webContents.send('status', `Renamed to ${newName}`);
      // Send button update after successful toggle
      const otherMode = getOtherMode();
      win.webContents.send('update-button', otherMode);
    }
  } catch (err) {
    console.error('Toggle error:', err);
    let errorMessage = `Error: ${err.message}`;
    
    // Check for permission-related errors
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      errorMessage = 'Permission denied. Please run as administrator or move SteamVR to a different location.';
    }
    
    if (win) win.webContents.send('status', errorMessage);
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
    // Add these lines to immediately update the button text
    const otherMode = getOtherMode();
    win.webContents.send('update-button', otherMode);
    
    win.webContents.send('status', `Folder set to ${steamvrPath}`);
  }
});

ipcMain.on('exit-app', () => {
  tray.destroy();
  app.quit();
});

ipcMain.on('get-auto-launch-status', () => {
  if (win) {
    const isEnabled = app.getLoginItemSettings().openAtLogin;
    win.webContents.send('auto-launch-status', isEnabled);
  }
});

ipcMain.on('set-auto-launch', (event, enable) => {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: process.execPath
  });
  
  if (win) {
    const status = enable ? 'Auto-launch enabled' : 'Auto-launch disabled';
    win.webContents.send('status', status);
  }
});
app.whenReady().then(() => {
  createWindow();
  loadConfig(); // Load config first
  createTray(); // Create tray after config is loaded
  
  // Ensure button text is updated once the window is ready
  win.webContents.once('dom-ready', () => {
    // Add a small delay to ensure everything is initialized
    setTimeout(() => {
      if (steamvrPath) {
        const otherMode = getOtherMode();
        win.webContents.send('update-button', otherMode);
      }
    }, 100);
  });
});