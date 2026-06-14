// Electron shell for Roblox 2.0. Boots the bundled platform server in a child
// process, waits for it to come up, then loads the game client in a window.
const { app, BrowserWindow, shell } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = process.env.PORT || 3000;
const SERVER_ENTRY = path.join(__dirname, '..', 'server', 'src', 'index.js');
let serverProc = null;
let win = null;

function startServer() {
  // Persist user data outside the app bundle so it survives updates.
  const dataDir = path.join(app.getPath('userData'), 'data');
  serverProc = fork(SERVER_ENTRY, [], {
    // ELECTRON_RUN_AS_NODE makes the bundled Electron binary behave as plain
    // Node when forking inside a packaged app.
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  serverProc.stdout?.on('data', (d) => process.stdout.write('[server] ' + d));
  serverProc.stderr?.on('data', (d) => process.stderr.write('[server] ' + d));
}

function waitForServer(retries = 40) {
  return new Promise((resolve, reject) => {
    const tryOnce = (n) => {
      const req = http.get(`http://localhost:${PORT}/api/stats`, (res) => { res.destroy(); resolve(); });
      req.on('error', () => {
        if (n <= 0) return reject(new Error('server did not start'));
        setTimeout(() => tryOnce(n - 1), 250);
      });
    };
    tryOnce(retries);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0f1216',
    title: 'Roblox 2.0',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.loadURL(`http://localhost:${PORT}`);
  // If the server is still warming up, the first load can fail with
  // ERR_CONNECTION_REFUSED. Retry instead of leaving a blank window.
  win.webContents.on('did-fail-load', (_e, errorCode) => {
    if (errorCode === -3) return; // aborted (normal during navigation)
    setTimeout(() => { if (win && !win.isDestroyed()) win.loadURL(`http://localhost:${PORT}`); }, 600);
  });
  // open external links in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(async () => {
  startServer();
  try { await waitForServer(); } catch (e) { console.error(e); }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (serverProc) try { serverProc.kill(); } catch {}
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => { if (serverProc) try { serverProc.kill(); } catch {} });
