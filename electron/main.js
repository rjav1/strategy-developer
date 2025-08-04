const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow;

function tryLoadPorts(ports, callback) {
  if (ports.length === 0) {
    callback(null);
    return;
  }
  const port = ports[0];
  const url = `http://localhost:${port}`;
  const req = http.get(url, (res) => {
    if (res.statusCode === 200) {
      callback(url);
    } else {
      tryLoadPorts(ports.slice(1), callback);
    }
  });
  req.on('error', () => {
    tryLoadPorts(ports.slice(1), callback);
  });
  req.end();
}

function createWindow() {
  console.log('Creating main window...');
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    titleBarStyle: 'default',
    show: false
  });

  // Load the React app
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  console.log('Development mode:', isDev);
  
  if (isDev) {
    // Try to find the correct port dynamically
    tryLoadPorts([3000, 3001, 3002, 3003, 3004], (url) => {
      if (url) {
        console.log('Loading from', url);
        mainWindow.loadURL(url);
        mainWindow.webContents.openDevTools();
      } else {
        console.log('No frontend found, loading from http://localhost:3000');
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
      }
    });
  } else {
    console.log('Loading from built files');
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    console.log('Window closed');
    mainWindow = null;
  });

  // Add error handling
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('crashed', (event) => {
    console.error('WebContents crashed');
  });
}

// IPC handlers for file operations
ipcMain.handle('select-file', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options.filters || [
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
});

ipcMain.handle('select-directory', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result;
});

ipcMain.handle('save-file', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: options.filters || [
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
});

app.whenReady().then(() => {
  console.log('App is ready, creating window...');
  createWindow();

  app.on('activate', () => {
    console.log('App activated');
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  console.log('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  console.log('App quitting...');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
}); 