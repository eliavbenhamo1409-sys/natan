const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const net = require('net');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let splashWindow;
let serverProcess;
const PORT = 3456;

const LOG_PATH = path.join(
  app.getPath('userData'),
  'natan-debug.log'
);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_PATH, line); } catch {}
  process.stdout.write(line);
}

function getServerPath() {
  const p = app.isPackaged
    ? path.join(process.resourcesPath, 'server')
    : path.join(__dirname, '..', '.next', 'standalone');
  log(`Server path: ${p}  (exists: ${fs.existsSync(p)})`);
  return p;
}

function loadConfig() {
  try {
    if (app.isPackaged) {
      const configPath = path.join(process.resourcesPath, 'config.json');
      log(`Loading config from ${configPath}  (exists: ${fs.existsSync(configPath)})`);
      const data = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(data);
      log(`Config keys: ${Object.keys(parsed).join(', ')}`);
      return parsed;
    }
    require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
    return {};
  } catch (e) {
    log(`Config load error: ${e.message}`);
    return {};
  }
}

function getEnv() {
  const config = loadConfig();
  return {
    ...process.env,
    ...config,
    NODE_ENV: 'production',
    PORT: String(PORT),
    HOSTNAME: '127.0.0.1',
  };
}

function waitForPort(port, host, timeout = 60000) {
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
        setTimeout(tryConnect, 500);
      }
    };
    tryConnect();
  });
}

function startServer() {
  const serverPath = getServerPath();
  const serverScript = path.join(serverPath, 'server.js');
  log(`Server script: ${serverScript}  (exists: ${fs.existsSync(serverScript)})`);
  log(`Electron exe: ${process.execPath}`);

  const env = getEnv();
  env.ELECTRON_RUN_AS_NODE = '1';

  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: serverPath,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProcess.stdout.on('data', (d) => {
    const s = d.toString();
    log(`[server:out] ${s.trim()}`);
  });
  serverProcess.stderr.on('data', (d) => {
    const s = d.toString();
    log(`[server:err] ${s.trim()}`);
  });
  serverProcess.on('error', (err) => {
    log(`Server spawn error: ${err.message}`);
    dialog.showErrorBox('Server Error', `Failed to start server:\n${err.message}\n\nLog: ${LOG_PATH}`);
  });
  serverProcess.on('exit', (code, signal) => {
    log(`Server exited  code=${code} signal=${signal}`);
    if (code !== null && code !== 0) {
      dialog.showErrorBox('Server Crashed', `Server exited with code ${code}.\n\nLog: ${LOG_PATH}`);
    }
  });
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 340,
    height: 200,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const html = `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html dir="rtl"><head><meta charset="utf-8">
<style>
  body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;
       font-family:-apple-system,Segoe UI,sans-serif;background:rgba(255,255,255,0.97);
       border-radius:14px;border:1px solid #e5e7eb;flex-direction:column;gap:14px;
       -webkit-app-region:drag;user-select:none}
  .title{font-size:18px;font-weight:700;color:#111}
  .sub{font-size:13px;color:#888}
  .dots{display:flex;gap:6px;margin-top:4px}
  .dot{width:8px;height:8px;border-radius:50%;background:#2563eb;animation:pulse 1.2s ease-in-out infinite}
  .dot:nth-child(2){animation-delay:0.2s}
  .dot:nth-child(3){animation-delay:0.4s}
  @keyframes pulse{0%,100%{opacity:0.2;transform:scale(0.8)}50%{opacity:1;transform:scale(1.1)}}
</style></head><body>
  <div class="title">Natan Factory Records</div>
  <div class="sub">...טוען את המערכת</div>
  <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
</body></html>`)}`;

  splashWindow.loadURL(html);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    title: 'Natan - Factory Records',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    splashWindow = null;
    mainWindow.show();
    mainWindow.focus();
  });

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
      if (response === 0) autoUpdater.downloadUpdate();
    });
  });
  autoUpdater.on('update-downloaded', () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'העדכון הורד',
      message: 'העדכון הורד. האפליקציה תסגר ותתעדכן.',
      buttons: ['התקן עכשיו'],
    }).then(() => autoUpdater.quitAndInstall(false, true));
  });
  autoUpdater.on('error', (err) => log(`Update error: ${err.message}`));
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates(), 60 * 60 * 1000);
}

app.on('ready', async () => {
  log('=== App ready ===');
  log(`Packaged: ${app.isPackaged}`);
  log(`resourcesPath: ${process.resourcesPath}`);
  log(`userData: ${app.getPath('userData')}`);
  log(`execPath: ${process.execPath}`);

  createSplash();
  startServer();

  try {
    await waitForPort(PORT, '127.0.0.1', 60000);
    log('Server is listening');
  } catch (e) {
    log(`Startup timeout: ${e.message}`);
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    dialog.showErrorBox('Startup Error', `Server failed to start.\n\nCheck the log:\n${LOG_PATH}`);
    app.quit();
    return;
  }

  createWindow();
  setupAutoUpdate();
});

app.on('window-all-closed', () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
  app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
});
