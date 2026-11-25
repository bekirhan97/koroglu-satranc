// window.api for the browser. The desktop app keeps its data in JSON files (api.read / api.write);
// here each "file" is a row in the kv table (user_id, key, value). All rows are loaded once at login
// and kept in memory; writes go to the server in the background (debounced per key).
import { supa } from './supa.js';
import { engine } from './engine.js';

const cache = new Map();
const pending = new Map(); // key -> timer
let userId = null;
let saveErrors = 0;
const listeners = new Set();
export const onSaveState = (f) => listeners.add(f);
const emit = () => listeners.forEach((f) => f({ pending: pending.size, errors: saveErrors }));

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export async function loadUserData(uid) {
  userId = uid;
  cache.clear();
  const { data, error } = await supa.from('kv').select('key, value').eq('user_id', uid);
  if (error) throw error;
  for (const r of data) cache.set(r.key, r.value);
}

async function push(key) {
  pending.delete(key);
  const value = cache.has(key) ? cache.get(key) : null;
  const { error } = cache.has(key)
    ? await supa.from('kv').upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() })
    : await supa.from('kv').delete().eq('user_id', userId).eq('key', key);
  if (error) {
    saveErrors++;
    console.error('Kaydedilemedi', key, error);
    // try again later
    pending.set(key, setTimeout(() => push(key), 5000));
  } else saveErrors = 0;
  emit();
}
function schedule(key, delay = 700) {
  clearTimeout(pending.get(key));
  pending.set(key, setTimeout(() => push(key), delay));
  emit();
}
export async function flushAll() {
  const keys = [...pending.keys()];
  keys.forEach((k) => clearTimeout(pending.get(k)));
  await Promise.all(keys.map(push));
}
export const hasPending = () => pending.size > 0;
window.addEventListener('beforeunload', (e) => { if (pending.size) { flushAll(); e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });

// Read another user's data (coach viewing a student; RLS allows only own students).
export async function readUserKey(uid, key, def = null) {
  const { data } = await supa.from('kv').select('value').eq('user_id', uid).eq('key', key).maybeSingle();
  return data ? data.value : def;
}

function pickFiles(accept, multiple = true) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.multiple = multiple;
    inp.onchange = () => resolve([...inp.files]);
    inp.addEventListener('cancel', () => resolve([]));
    inp.click();
  });
}

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

let puzzleText = null;

window.api = {
  web: true,
  read: async (key, def) => (cache.has(key) ? clone(cache.get(key)) : def),
  write: async (key, value) => { cache.set(key, clone(value)); schedule(key); return true; },
  remove: async (key) => { cache.delete(key); schedule(key, 0); return true; },
  puzzles: async () => {
    if (!puzzleText) puzzleText = await fetch('data/puzzles.json').then((r) => { if (!r.ok) throw new Error('Bulmacalar yüklenemedi'); return r.text(); });
    return puzzleText;
  },
  openings: async () => fetch('data/openings.json').then((r) => r.json()),
  miniatures: async () => fetch('data/miniatures.pgn').then((r) => r.text()),
  maiaTables: async () => fetch('data/maia/tables.json').then((r) => r.json()),
  maiaWeights: async (elo) => new Uint8Array(await fetch(`data/maia/maia-${+elo}.bin`).then((r) => { if (!r.ok) throw new Error('Maia ağı yüklenemedi'); return r.arrayBuffer(); })),
  lichessGames: async (user, max) => {
    if (!/^[\w-]{2,30}$/.test(String(user))) return { error: 'Geçersiz kullanıcı adı' };
    const url = `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${Math.min(100, +max || 30)}&moves=true&opening=false&clocks=false&evals=false&perfType=bullet,blitz,rapid,classical,correspondence`;
    try {
      const r = await fetch(url, { headers: { Accept: 'application/x-ndjson' } });
      if (r.status === 404) return { error: 'Bu kullanıcı Lichess\'te bulunamadı' };
      if (r.status === 429) return { error: 'Lichess şu an çok yoğun; bir dakika sonra tekrar deneyin' };
      if (!r.ok) return { error: `Lichess yanıt vermedi (${r.status})` };
      return { text: await r.text() };
    } catch (e) { return { error: 'Lichess\'e bağlanılamadı. İnternet bağlantınızı kontrol edin.' }; }
  },
  appInfo: async () => ({ version: 'web', dataDir: '', backupDir: '' }),
  openExternal: (url) => { window.open(url, '_blank', 'noopener'); },
  log: (level, msg) => (level === 'error' ? console.error(msg) : console.log(msg)),
  openPgn: async () => {
    const files = await pickFiles('.pgn,text/plain');
    return Promise.all(files.map(async (f) => ({ name: f.name.replace(/\.pgn$/i, ''), text: await f.text() })));
  },
  openFiles: async () => [],
  saveFile: async (kind, name, data) => { download(`${name}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' })); return name; },
  // Veli raporu: yazdırma penceresi (tarayıcının "PDF olarak kaydet" seçeneğiyle).
  savePdf: async (html) => {
    const w = window.open('', '_blank');
    if (!w) return { error: 'Açılır pencere engellendi. Tarayıcıda bu siteye izin verin.' };
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 600);
    return null;
  },
  showFile: () => {},
  // Stockfish (WASM, ./engine.js)
  analyse: (req, priority) => window.__lichessGame ? Promise.resolve({ error: 'Lichess maçı sürerken motor kapalı' }) : engine.analyse(req, priority).catch((e) => ({ error: String(e.message || e) })),
  analyseStream: (req, priority, onInfo) => window.__lichessGame ? Promise.resolve({ error: 'Lichess maçı sürerken motor kapalı' }) : engine.analyse(req, priority, onInfo).catch((e) => ({ error: String(e.message || e) })),
  cancel: async (tag) => { engine.cancelTag(tag); return true; },
  restartEngine: async () => true,
  engineInfo: async () => ({ exists: true, name: engine.name, path: 'tarayıcı' }),
};
