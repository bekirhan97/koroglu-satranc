// Backups of the whole data folder (userData/data) as one gzip-compressed JSON file (.kyedek).
//   { format: 'koroglu-yedek', v: 1, appVersion, createdAt, profileName, files: { 'gtm/games.json': '…' } }
// Automatic backups go to userData/backups (or a folder the user picked); the newest 7 are kept.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const FORMAT = 'koroglu-yedek';
const EXT = '.kyedek';
const KEEP = 7;
const AUTO_EVERY = 20 * 3600 * 1000;

function writeGzJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, zlib.gzipSync(Buffer.from(JSON.stringify(obj)), { level: 6 }));
  fs.renameSync(tmp, p);
}

function readGzJson(p) {
  const buf = fs.readFileSync(p);
  const raw = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf;
  return JSON.parse(raw.toString('utf8'));
}

function walk(dir, base = dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else if (e.isFile() && e.name.endsWith('.json')) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

function collect(dataDir, appVersion) {
  const files = {};
  for (const rel of walk(dataDir)) files[rel] = fs.readFileSync(path.join(dataDir, rel), 'utf8');
  let profileName = '';
  try { profileName = JSON.parse(files['profile.json'] || 'null')?.name || ''; } catch {}
  return { format: FORMAT, v: 1, appVersion, createdAt: Date.now(), profileName, files };
}

function createBackup(dataDir, outPath, appVersion) {
  const b = collect(dataDir, appVersion);
  writeGzJson(outPath, b);
  return { path: outPath, files: Object.keys(b.files).length, bytes: fs.statSync(outPath).size };
}

function readBackup(p) {
  let b;
  try { b = readGzJson(p); } catch (e) { throw new Error('Dosya okunamadı ya da bozuk.'); }
  if (!b || b.format !== FORMAT || typeof b.files !== 'object') throw new Error('Bu bir Köroğlu Satranç yedek dosyası değil.');
  for (const [rel, text] of Object.entries(b.files)) {
    if (rel.includes('..') || path.isAbsolute(rel) || !rel.endsWith('.json')) throw new Error('Yedek dosyasında geçersiz bir yol var.');
    JSON.parse(text); // every file must be valid JSON
  }
  return b;
}

// Replace the data folder with the backup's contents. The folder is swapped in one rename,
// so a failure half-way leaves the current data untouched.
function restoreBackup(dataDir, b) {
  const stage = dataDir + '.geriyukle';
  fs.rmSync(stage, { recursive: true, force: true });
  for (const [rel, text] of Object.entries(b.files)) {
    const p = path.join(stage, ...rel.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  fs.mkdirSync(stage, { recursive: true });
  const old = dataDir + '.onceki';
  fs.rmSync(old, { recursive: true, force: true });
  if (fs.existsSync(dataDir)) fs.renameSync(dataDir, old);
  fs.renameSync(stage, dataDir);
  fs.rmSync(old, { recursive: true, force: true });
}

function listBackups(dir) {
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith(EXT)); } catch { return []; }
  return names.map((n) => { const p = path.join(dir, n); const st = fs.statSync(p); return { name: n, path: p, t: st.mtimeMs, bytes: st.size }; })
    .sort((a, b) => b.t - a.t);
}

const stamp = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}`;
};

// Once a day: write otomatik-<date>.kyedek and delete old automatic backups beyond KEEP.
function autoBackup(dataDir, backupDir, appVersion, { force = false, now = Date.now() } = {}) {
  if (!fs.existsSync(path.join(dataDir, 'profile.json'))) return null;
  const autos = listBackups(backupDir).filter((b) => b.name.startsWith('otomatik-'));
  if (!force && autos.length && now - autos[0].t < AUTO_EVERY) return null;
  const out = path.join(backupDir, `otomatik-${stamp(new Date(now))}${EXT}`);
  const res = createBackup(dataDir, out, appVersion);
  for (const b of listBackups(backupDir).filter((x) => x.name.startsWith('otomatik-')).slice(KEEP)) {
    try { fs.unlinkSync(b.path); } catch {}
  }
  return res;
}

module.exports = { createBackup, readBackup, restoreBackup, listBackups, autoBackup, writeGzJson, readGzJson, stamp, EXT, FORMAT };
