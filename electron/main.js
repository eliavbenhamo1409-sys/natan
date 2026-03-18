const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let serverProcess;
const PORT = 3456;

function getServerPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'server')
    : path.join(__dirname, '..', '.next', 'standalone');
}

function getEnv() {
  const serverPath = getServerPath();
  return {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    HOSTNAME: '127.0.0.1',
    DATABASE_URL: 'postgresql://natan_app:NatanFactory2026!@db.xerounapbrhagzzjatmw.supabase.co:5432/postgres',
    DIRECT_URL: 'postgresql://natan_app:NatanFactory2026!@db.xerounapbrhagzzjatmw.supabase.co:5432/postgres',
    JWT_SECRET: 'factory-records-jwt-secret-change-in-production-2024',
    GEMINI_API_KEY: 'AIzaSyBFGj9SG8KM_E2Tpdrty42nI7oh-mvZkQQ',
  };
}

function waitForPort(port, host, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const sock = new net.Socket();
      sock.setTimeout(1000);
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('timeout', () => { sock.destroy(); retry(); });
      sock.once('error', () => { sock.destroy(); retry(); });
      sock.connect(port, host);
    };
    const retry = () => {
      if (Date.now() - start > timeout) {
        reject(new Error(`Server did not start within ${timeout}ms`));
      } else {
        setTimeout(tryConnect, 300);
      }
    };
    tryConnect();
  });
}

function startServer() {
  const serverPath = getServerPath();
  const serverScript = path.join(serverPath, 'server.js');

  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: serverPath,
    env: getEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  serverProcess.on('error', (err) => {
    dialog.showErrorBox('Server Error', `Failed to start server: ${err.message}`);
  });
  serverProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`Server exited with code ${code}`);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Natan - Factory Records',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.on('update-available', (info) => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'עדכון זמין',
      message: `גרסה חדשה ${info.version} זמינה. האם להוריד ולהתקין?`,
      buttons: ['הורד והתקן', 'בפעם אחרת'],
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });
  autoUpdater.on('update-downloaded', () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'העדכון הורד',
      message: 'העדכון הורד. האפליקציה תסגר ותתעדכן.',
      buttons: ['התקן עכשיו'],
    }).then(() => {
      autoUpdater.quitAndInstall(false, true);
    });
  });
  autoUpdater.on('error', (err) => console.error('Update error:', err));
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates(), 60 * 60 * 1000);
}

app.on('ready', async () => {
  startServer();
  try {
    await waitForPort(PORT, '127.0.0.1', 30000);
  } catch {
    dialog.showErrorBox('Startup Error', 'Server failed to start in time. Please try again.');
    app.quit();
    return;
  }
  createWindow();
  setupAutoUpdate();
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
