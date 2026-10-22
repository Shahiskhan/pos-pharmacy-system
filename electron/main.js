const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

// Disable hardware acceleration if needed or keep default for POS performance
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    frame: true, // Frame enabled as requested
    title: 'Generic Pharmacy POS',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
    show: false, // Prevent white flash before ready
  });

  // Gracefully show window once rendered
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Load Vite dev server in development, or compiled dist/index.html in production
  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devServerUrl).catch((err) => {
      console.error('Failed to load Vite dev server:', err);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Security: Restrict navigation to prevent loading unintended remote URLs
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (isDev && parsedUrl.origin.includes('localhost')) {
      return;
    }
    if (parsedUrl.protocol !== 'file:') {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });

  // Security: Deny creation of unexpected child browser windows and open external URLs in default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers for POS Operations
function registerIpcHandlers() {
  ipcMain.handle('pos:get-version', () => app.getVersion());

  ipcMain.handle('pos:get-system-info', () => ({
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
  }));

  // Handle thermal or standard POS receipt printing
  ipcMain.handle('pos:print-receipt', async (event, options = {}) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) {
      return { success: false, error: 'Window not found' };
    }

    return new Promise((resolve) => {
      targetWindow.webContents.print(
        {
          silent: options.silent ?? false,
          printBackground: true,
          deviceName: options.printerName || '',
          margins: { marginType: 'none' },
          pageSize: options.pageSize || { width: 80000, height: 297000 }, // Standard 80mm receipt default
        },
        (success, failureReason) => {
          if (!success) {
            resolve({ success: false, error: failureReason });
          } else {
            resolve({ success: true });
          }
        }
      );
    });
  });

  // App window controls (if custom titlebar triggers are used)
  ipcMain.on('pos:window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });

  ipcMain.on('pos:window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.on('pos:window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });
}

// App Lifecycle Events
app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    // Re-create window on macOS if dock icon clicked with no open windows
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Respect macOS convention: keep app active until Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
