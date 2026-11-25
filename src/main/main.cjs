const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { UciEngine } = require('./engine.cjs');

const isDev = !app.isPackaged;
if (process.env.KOROGLU_DATA_DIR) app.setPath('userData', process.env.KOROGLU_DATA_DIR);
const resRoot = isDev ? path.join(__dirname, '..', '..', 'resources') : process.resourcesPath;

function enginePath() {
  const settings = readJson('settings', {});
  if (settings.enginePath && fs.existsSync(settings.enginePath)) return settings.enginePath;
  const key = `${process.platform}-${process.arch}`;
  const exe = process.platform === 'win32' ? 'stockfish.exe' : 'stockfish';
  let p = path.join(resRoot, 'engines', key, exe);
  if (!fs.existsSync(p) && process.platform === 'darwin') p = path.join(resRoot, 'engines', 'darwin-x64', exe);
  return p;
}

// ---------- simple JSON store under userData/data ----------
const dataDir = () => path.join(app.getPath('userData'), 'data');
function safeName(name) { return String(name).replace(/[^a-zA-Z0-9_\-/]/g, '_'); }
function filePath(name) { return path.join(dataDir(), safeName(name) + '.json'); }
function readJson(name, fallback = null) {
  try { return JSON.parse(fs.readFileSync(filePath(name), 'utf8')); } catch { return fallback; }
}
function writeJson(name, data) {
  const p = filePath(name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, p);
  return true;
}

let engine = null;
function getEngine() {
  if (!engine) {
    const s = readJson('settings', {});
    engine = new UciEngine(enginePath(), { threads: s.threads, hash: s.hash });
  }
  return engine;
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1100, minHeight: 700,
    title: 'Köroğlu Satranç',
    backgroundColor: '#f6f3ee',
    icon: path.join(__dirname, '..', '..', 'build-src', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('store:read', (_e, name, fallback) => readJson(name, fallback));
  ipcMain.handle('store:write', (_e, name, data) => writeJson(name, data));
  ipcMain.handle('store:delete', (_e, name) => { try { fs.unlinkSync(filePath(name)); } catch {} return true; });

  ipcMain.handle('res:maia', (_e, elo) => fs.readFileSync(path.join(resRoot, 'maia', `maia-${+elo}.bin`)));
  ipcMain.handle('res:maiaTables', () => JSON.parse(fs.readFileSync(path.join(resRoot, 'maia', 'tables.json'), 'utf8')));
  ipcMain.handle('res:puzzles', () => fs.readFileSync(path.join(resRoot, 'puzzles.json'), 'utf8'));
  ipcMain.handle('app:openExternal', (_e, url) => { if (/^https:\/\/lichess\.org\//.test(url)) shell.openExternal(url); return true; });
  ipcMain.handle('res:openings', () => JSON.parse(fs.readFileSync(path.join(resRoot, 'openings.json'), 'utf8')));

  ipcMain.handle('dialog:openPgn', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'PGN dosyası seç', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PGN', extensions: ['pgn', 'PGN', 'txt'] }],
    });
    if (r.canceled) return [];
    return r.filePaths.map((p) => ({ name: path.basename(p).replace(/\.(pgn|txt)$/i, ''), text: fs.readFileSync(p, 'utf8') }));
  });

  ipcMain.handle('engine:analyse', async (_e, req, priority) => {
    try { return await getEngine().analyse(req, priority); }
    catch (e) { return { error: String(e.message || e) }; }
  });
  ipcMain.on('engine:stream', (e, reqId, req, priority) => {
    getEngine().analyse(req, priority, (lines) => {
      if (!e.sender.isDestroyed()) e.sender.send('engine:info', reqId, lines);
    }).then((res) => { if (!e.sender.isDestroyed()) e.sender.send('engine:done', reqId, res); })
      .catch((err) => { if (!e.sender.isDestroyed()) e.sender.send('engine:done', reqId, { error: String(err.message || err) }); });
  });
  ipcMain.handle('engine:cancel', (_e, tag) => { if (engine) engine.cancelTag(tag); return true; });
  ipcMain.handle('engine:restart', () => { if (engine) engine.quit(); engine = null; return true; });
  ipcMain.handle('engine:info', async () => {
    const p = enginePath();
    const exists = fs.existsSync(p);
    let name = '';
    if (exists) { try { await getEngine().start(); name = getEngine().name; } catch (e) { name = 'Hata: ' + e.message; } }
    return { path: p, exists, name };
  });

  ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataDir: dataDir(), platform: process.platform }));
  ipcMain.handle('app:openDataDir', () => { fs.mkdirSync(dataDir(), { recursive: true }); return shell.openPath(dataDir()); });

  createWindow();
});

app.on('window-all-closed', () => { if (engine) engine.quit(); app.quit(); });
