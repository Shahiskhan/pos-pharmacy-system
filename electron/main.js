require('dotenv').config();

const { app, BrowserWindow, session, shell } = require('electron');
const path = require('node:path');
const { openDatabase } = require('./db/connection');
const { runMigrations } = require('./db/migrate');
const sessionStore = require('./security/session');
const adminService = require('./services/admin.service');
const { blockDevtoolsInProd } = require('./security/validateSender');

const isDev = !app.isPackaged;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    frame: true,
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
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devServerUrl).catch((error) => {
      console.error('Failed to load Vite dev server:', error);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (isDev && parsedUrl.origin.includes('localhost')) return;
    if (parsedUrl.protocol !== 'file:') {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  openDatabase(app.getPath('userData'));
  runMigrations({ log: () => {} });
  sessionStore.hydrate();

  require('./ipc/handlers/auth.handlers').register();
  require('./ipc/handlers/system.handlers').register();
  require('./ipc/handlers/users.handlers').register();
  require('./ipc/handlers/roles.handlers').register();
  require('./ipc/handlers/panels.handlers').register();
  require('./ipc/handlers/admin.handlers').register();
  require('./ipc/router').registerRoutes();
  adminService.ensureEnvironmentAdminAccount().catch((error) => {
    console.error('Failed to ensure environment admin account:', error);
  });

  session.defaultSession.setPermissionRequestHandler((_, __, cb) => cb(false));
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...(details.responseHeaders || {}),
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:*; font-src 'self' data:;",
        ],
      },
    });
  });

  app.on('web-contents-created', (_, wc) => {
    blockDevtoolsInProd(wc);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

