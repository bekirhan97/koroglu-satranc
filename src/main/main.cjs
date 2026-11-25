const { app, BrowserWindow, ipcMain, dialog, shell, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { UciEngine } = require('./engine.cjs');
const { log } = require('./log.cjs');
const backup = require('./backup.cjs');
const updater = require('./updater.cjs');

const isDev = !app.isPackaged;
// The data folder keeps its 0.2 name ("Köroğlu Satranç") whatever the package or bundle is called.
if (process.env.KOROGLU_DATA_DIR) app.setPath('userData', process.env.KOROGLU_DATA_DIR);
else app.setPath('userData', path.join(app.getPath('appData'), 'Köroğlu Satranç'));
const resRoot = isDev ? path.join(__dirname, '..', '..', 'resources') : process.resourcesPath;
log.init(path.join(app.getPath('userData'), 'logs'));
process.on('uncaughtException', (e) => log.error('Ana süreç hatası:', e));
process.on('unhandledRejection', (e) => log.error('Ana süreç (promise):', e));

// One running copy: opening a .kpaket/.krapor while the app is open hands the file to that window.
const primary = !!process.env.KOROGLU_MULTI || app.requestSingleInstanceLock();
if (!primary) app.quit();

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
  const p = filePath(name);
  let text;
  try { text = fs.readFileSync(p, 'utf8'); } catch { return fallback; }
  try { return JSON.parse(text); } catch (e) {
    // Keep the damaged file instead of silently overwriting it later.
    const keep = `${p}.bozuk-${Date.now()}`;
    try { fs.copyFileSync(p, keep); } catch {}
    log.error(`Bozuk veri dosyası: ${name}.json (kopyası: ${path.basename(keep)})`, e.message);
    return fallback;
  }
}
function writeJson(name, data) {
  const p = filePath(name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, p);
  return true;
}

const backupDir = () => {
  const s = readJson('settings', {});
  return s.backupDir && fs.existsSync(s.backupDir) ? s.backupDir : path.join(app.getPath('userData'), 'backups');
};

// ---------- exchange files: ödev paketi (.kpaket), ilerleme raporu (.krapor) ----------
const KINDS = {
  paket: { ext: 'kpaket', label: 'Köroğlu ödev paketi' },
  rapor: { ext: 'krapor', label: 'Köroğlu ilerleme raporu' },
};
const kindOf = (p) => Object.keys(KINDS).find((k) => p.toLowerCase().endsWith('.' + KINDS[k].ext));
function readExchange(p) {
  const kind = kindOf(p);
  if (!kind) return { path: p, name: path.basename(p), error: 'Desteklenmeyen dosya türü' };
  try {
    const data = backup.readGzJson(p);
    if (!data || data.format !== 'koroglu-' + kind) throw new Error('Dosya biçimi tanınmadı');
    return { kind, path: p, name: path.basename(p), data };
  } catch (e) { return { kind, path: p, name: path.basename(p), error: 'Dosya okunamadı: ' + e.message }; }
}
// Files passed on the command line (double-click in Explorer/Finder) wait here until the renderer asks.
const pendingFiles = [];
const queueArgs = (argv) => { for (const a of argv.slice(1)) if (!a.startsWith('-') && kindOf(a) && fs.existsSync(a)) pendingFiles.push(a); };
queueArgs(process.argv);

let engine = null;
function getEngine() {
  if (!engine) {
    const s = readJson('settings', {});
    engine = new UciEngine(enginePath(), { threads: s.threads, hash: s.hash });
  }
  return engine;
}

let win;
const notifyFiles = () => { if (win && !win.isDestroyed() && pendingFiles.length) win.webContents.send('app:filesWaiting'); };

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
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 3) log.error('Arayüz:', message, source ? `(${path.basename(source)}:${line})` : '');
  });
  win.webContents.on('render-process-gone', (_e, d) => log.error('Arayüz süreci kapandı:', d.reason, d.exitCode));
  win.on('unresponsive', () => log.warn('Pencere yanıt vermiyor'));
}

const saveDialog = (title, defaultPath, filters) => dialog.showSaveDialog(win, { title, defaultPath, filters });

app.on('second-instance', (_e, argv) => {
  queueArgs(argv);
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  notifyFiles();
});
app.on('open-file', (e, p) => { e.preventDefault(); if (kindOf(p)) { pendingFiles.push(p); notifyFiles(); } }); // macOS

app.whenReady().then(() => {
  if (!primary) return;
  log.info(`Başladı: sürüm ${app.getVersion()}, ${process.platform}-${process.arch}`);
  ipcMain.handle('store:read', (_e, name, fallback) => readJson(name, fallback));
  ipcMain.handle('store:write', (_e, name, data) => writeJson(name, data));
  ipcMain.handle('store:delete', (_e, name) => { try { fs.unlinkSync(filePath(name)); } catch {} return true; });

  ipcMain.handle('res:maia', (_e, elo) => fs.readFileSync(path.join(resRoot, 'maia', `maia-${+elo}.bin`)));
  ipcMain.handle('res:maiaTables', () => JSON.parse(fs.readFileSync(path.join(resRoot, 'maia', 'tables.json'), 'utf8')));
  ipcMain.handle('res:puzzles', () => fs.readFileSync(path.join(resRoot, 'puzzles.json'), 'utf8'));
  ipcMain.handle('app:openExternal', (_e, url) => {
    if (/^https:\/\/lichess\.org\//.test(url) || url.startsWith('https://github.com/bekirhan97/koroglu-satranc')) shell.openExternal(url);
    return true;
  });
  ipcMain.handle('res:miniatures', () => fs.readFileSync(path.join(resRoot, 'miniatures.pgn'), 'utf8'));
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
    catch (e) { if (e.message !== 'cancelled') log.warn('Motor:', e.message); return { error: String(e.message || e) }; }
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
    if (exists) { try { await getEngine().start(); name = getEngine().name; } catch (e) { name = 'Hata: ' + e.message; log.error('Motor başlatılamadı:', e); } }
    else log.error('Motor bulunamadı:', p);
    return { path: p, exists, name };
  });

  ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataDir: dataDir(), platform: process.platform, arch: process.arch, backupDir: backupDir() }));
  ipcMain.handle('app:openDataDir', () => { fs.mkdirSync(dataDir(), { recursive: true }); return shell.openPath(dataDir()); });

  // ---------- log ----------
  ipcMain.handle('log:write', (_e, level, msg) => { (level === 'error' ? log.error : level === 'warn' ? log.warn : log.info)('Arayüz:', String(msg).slice(0, 4000)); return true; });
  ipcMain.handle('log:saveReport', async () => {
    const r = await saveDialog('Hata raporunu kaydet', path.join(app.getPath('desktop'), `koroglu-hata-raporu-${backup.stamp()}.txt`), [{ name: 'Metin', extensions: ['txt'] }]);
    if (r.canceled || !r.filePath) return null;
    const s = readJson('settings', {});
    const head = [
      'Köroğlu Satranç – hata raporu', `Tarih: ${new Date().toLocaleString('tr-TR')}`,
      `Sürüm: ${app.getVersion()}  Sistem: ${process.platform}-${process.arch} ${require('node:os').release()}`,
      `Electron: ${process.versions.electron}  Motor: ${enginePath()} (${fs.existsSync(enginePath()) ? 'var' : 'YOK'})`,
      `Ayarlar: ${JSON.stringify({ ...s, enginePath: s.enginePath ? '(özel)' : undefined })}`, '', '---- kayıt ----', ''].join('\n');
    fs.writeFileSync(r.filePath, head + log.tail());
    return r.filePath;
  });

  // ---------- backups ----------
  ipcMain.handle('backup:export', async () => {
    const r = await saveDialog('Yedeği kaydet', path.join(app.getPath('documents'), `koroglu-yedek-${backup.stamp()}${backup.EXT}`), [{ name: 'Köroğlu yedeği', extensions: ['kyedek'] }]);
    if (r.canceled || !r.filePath) return null;
    const res = backup.createBackup(dataDir(), r.filePath, app.getVersion());
    log.info('Yedek alındı:', r.filePath);
    return res;
  });
  // Step 1 of a restore: pick and inspect a file. Step 2 (backup:restore) needs the user's confirmation.
  ipcMain.handle('backup:pick', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Yedek dosyası seç', properties: ['openFile'], filters: [{ name: 'Köroğlu yedeği', extensions: ['kyedek'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    try {
      const b = backup.readBackup(r.filePaths[0]);
      return { path: r.filePaths[0], profileName: b.profileName, createdAt: b.createdAt, appVersion: b.appVersion, files: Object.keys(b.files).length };
    } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('backup:list', () => backup.listBackups(backupDir()));
  ipcMain.handle('backup:restore', (_e, p) => {
    try {
      const b = backup.readBackup(p);
      // Save the current state first, so a restore can itself be undone.
      backup.createBackup(dataDir(), path.join(backupDir(), `geri-yukleme-oncesi-${backup.stamp()}${backup.EXT}`), app.getVersion());
      if (engine) { engine.quit(); engine = null; }
      backup.restoreBackup(dataDir(), b);
      log.info('Yedek geri yüklendi:', p);
      setTimeout(() => win && win.reload(), 300);
      return { ok: true };
    } catch (e) { log.error('Geri yükleme başarısız:', e); return { error: e.message }; }
  });
  ipcMain.handle('backup:now', () => { try { return backup.autoBackup(dataDir(), backupDir(), app.getVersion(), { force: true }); } catch (e) { log.error('Yedek alınamadı:', e); return { error: e.message }; } });
  ipcMain.handle('backup:chooseDir', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Otomatik yedek klasörü', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const s = readJson('settings', {}); s.backupDir = r.filePaths[0]; writeJson('settings', s);
    return r.filePaths[0];
  });
  ipcMain.handle('backup:resetDir', () => { const s = readJson('settings', {}); delete s.backupDir; writeJson('settings', s); return backupDir(); });
  ipcMain.handle('backup:openDir', () => { fs.mkdirSync(backupDir(), { recursive: true }); return shell.openPath(backupDir()); });

  // ---------- exchange files ----------
  ipcMain.handle('file:save', async (_e, kind, defaultName, data) => {
    const k = KINDS[kind];
    if (!k) return null;
    const r = await saveDialog(k.label, path.join(app.getPath('desktop'), `${defaultName}.${k.ext}`), [{ name: k.label, extensions: [k.ext] }]);
    if (r.canceled || !r.filePath) return null;
    backup.writeGzJson(r.filePath, { ...data, format: 'koroglu-' + kind });
    return r.filePath;
  });
  ipcMain.handle('file:open', async (_e, kind) => {
    const k = KINDS[kind];
    const r = await dialog.showOpenDialog(win, { title: k.label, properties: ['openFile', 'multiSelections'], filters: [{ name: k.label, extensions: [k.ext] }] });
    if (r.canceled) return [];
    return r.filePaths.map(readExchange);
  });
  // Print an HTML document (built by the renderer) to an A4 PDF and save it where the user chooses.
  ipcMain.handle('pdf:save', async (_e, html, defaultName) => {
    const r = await saveDialog('PDF olarak kaydet', path.join(app.getPath('desktop'), `${defaultName}.pdf`), [{ name: 'PDF', extensions: ['pdf'] }]);
    if (r.canceled || !r.filePath) return null;
    const pw = new BrowserWindow({ show: false, webPreferences: { javascript: false, offscreen: true } });
    try {
      await pw.loadURL('data:text/html;charset=utf-8;base64,' + Buffer.from(html, 'utf8').toString('base64'));
      const pdf = await pw.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } });
      fs.writeFileSync(r.filePath, pdf);
      return r.filePath;
    } catch (e) { log.error('PDF oluşturulamadı:', e); return { error: e.message }; }
    finally { pw.destroy(); }
  });
  ipcMain.handle('app:showFile', (_e, p) => { if (typeof p === 'string' && p.endsWith('.pdf')) shell.showItemInFolder(p); return true; });
  // A student's recent games from the public Lichess API (ndjson, standard games only are kept later).
  ipcMain.handle('lichess:games', async (_e, user, max) => {
    if (!/^[\w-]{2,30}$/.test(String(user))) return { error: 'Geçersiz kullanıcı adı' };
    const url = `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${Math.min(100, +max || 30)}&moves=true&opening=false&clocks=false&evals=false&perfType=bullet,blitz,rapid,classical,correspondence`;
    try {
      const r = await net.fetch(url, { headers: { Accept: 'application/x-ndjson', 'User-Agent': `KorogluSatranc/${app.getVersion()}` } });
      if (r.status === 404) return { error: 'Bu kullanıcı Lichess\'te bulunamadı' };
      if (r.status === 429) return { error: 'Lichess şu an çok yoğun; bir dakika sonra tekrar deneyin' };
      if (!r.ok) return { error: 'Lichess yanıtı: ' + r.status };
      return { text: await r.text() };
    } catch (e) { log.warn('Lichess:', e.message); return { error: 'Lichess\'e bağlanılamadı (internet bağlantınızı kontrol edin)' }; }
  });
  ipcMain.handle('app:takeFiles', () => pendingFiles.splice(0).map(readExchange));

  // ---------- updates ----------
  ipcMain.handle('update:state', () => updater.getState());
  ipcMain.handle('update:check', () => { updater.check(); return true; });
  ipcMain.handle('update:install', () => { updater.install(); return true; });

  createWindow();
  win.webContents.on('did-finish-load', notifyFiles);
  updater.init((s) => { if (win && !win.isDestroyed()) win.webContents.send('update:state', s); });

  if (process.env.KOROGLU_SELFTEST) selfTest(process.env.KOROGLU_SELFTEST);

  // Daily automatic backup (a little after start, so it never slows down opening the app).
  setTimeout(() => {
    try { const r = backup.autoBackup(dataDir(), backupDir(), app.getVersion()); if (r) log.info('Otomatik yedek:', r.path); }
    catch (e) { log.error('Otomatik yedek alınamadı:', e); }
  }, 15000).unref();
});

// Packaged-build smoke test (used by the release workflow on real Windows/macOS machines):
// starts the engine, reads Maia + puzzles, checks the UI rendered, writes a JSON result and quits.
async function selfTest(outFile) {
  const res = { version: app.getVersion(), platform: `${process.platform}-${process.arch}`, checks: {} };
  const step = async (name, fn) => { try { res.checks[name] = { ok: true, info: await fn() }; } catch (e) { res.checks[name] = { ok: false, error: String(e && e.message || e) }; } };
  await new Promise((r) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', r) : r()));
  await new Promise((r) => setTimeout(r, 3000));
  await step('engine', async () => {
    const r = await getEngine().analyse({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', depth: 12, multipv: 1 }, 0);
    if (!r.bestmove) throw new Error('bestmove yok');
    return `${getEngine().name}: ${r.bestmove}`;
  });
  await step('maia', () => { const n = fs.readdirSync(path.join(resRoot, 'maia')).filter((f) => f.endsWith('.bin')).length; if (n !== 9) throw new Error(n + ' ağ'); return n + ' ağ'; });
  await step('puzzles', () => { const n = JSON.parse(fs.readFileSync(path.join(resRoot, 'puzzles.json'), 'utf8')).puzzles.length; if (n < 50000) throw new Error(n); return n; });
  await step('ui', async () => {
    const t = await win.webContents.executeJavaScript("document.querySelector('.brand-name') ? document.querySelector('.brand-name').textContent : (document.querySelector('.modal h3') || {}).textContent || ''");
    if (!t) throw new Error('arayüz boş');
    return t;
  });
  await step('maiaMove', () => win.webContents.executeJavaScript(`(async () => {
    const w = new Worker('maia-worker.js', { type: 'module' });
    const call = (m, tr) => new Promise((ok, no) => { w.onmessage = (e) => e.data.ok ? ok(e.data) : no(new Error(e.data.error)); w.postMessage({ ...m, id: 1 }, tr || []); });
    await call({ type: 'tables', tables: await window.api.maiaTables() });
    const b = await window.api.maiaWeights(1500); const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    await call({ type: 'load', elo: 1500, buffer: buf }, [buf]);
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const r = await call({ type: 'policy', elo: 1500, history: [fen], legal: ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'a2a3'] });
    w.terminate(); return r.policy[0].uci;
  })()`));
  res.ok = Object.values(res.checks).every((c) => c.ok);
  fs.writeFileSync(outFile, JSON.stringify(res, null, 2));
  log.info('Öz test:', JSON.stringify(res));
  if (engine) engine.quit();
  app.exit(res.ok ? 0 : 1);
}

app.on('window-all-closed', () => { if (engine) engine.quit(); app.quit(); });
