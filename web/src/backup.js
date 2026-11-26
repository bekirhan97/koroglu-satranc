// "Akademinin yedeğini indir": every table the coach can read, as one JSON file (the free Supabase plan keeps
// no backups). The academy owner also gets the students' raw data (kv). Restoring is done by Claude/a developer.
import { supa } from './supa.js';
import { h, toast } from '../../src/renderer/core/dom.js';

const TABLES = ['profiles', 'student_coaches', 'kv', 'reports', 'assignments', 'assignment_targets', 'announcements', 'videos',
  'classes', 'class_members', 'sessions', 'attendance', 'session_notes', 'session_reads', 'scores', 'lichess_accounts',
  'endgame_positions', 'opponents', 'tournament_games', 'game_comments'];
const LAST = 'koroglu-son-yedek';

async function readAll(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from(table).select('*').range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

export async function downloadBackup(onStep) {
  const out = { app: 'koroglu-ogrenci-sistemi', format: 1, at: new Date().toISOString(), by: (window.__me || {}).username, tables: {} };
  for (const [i, t] of TABLES.entries()) {
    onStep && onStep(i + 1, TABLES.length, t);
    try { out.tables[t] = await readAll(t); } catch (e) { out.tables[t] = { error: e.message }; }
  }
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `koroglu-yedek-${new Date().toLocaleDateString('sv-SE')}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  try { localStorage.setItem(LAST, out.at); } catch (e) { /* ignore */ }
  const n = Object.values(out.tables).reduce((s, r) => s + (Array.isArray(r) ? r.length : 0), 0);
  return { rows: n, size: blob.size };
}

export function lastBackup() { try { return localStorage.getItem(LAST); } catch (e) { return null; } }
export const daysSinceBackup = () => { const l = lastBackup(); return l ? Math.floor((Date.now() - Date.parse(l)) / 864e5) : null; };

// Settings row for coaches
export function backupBox() {
  const info = h('div.muted.small');
  const paint = () => { const d = daysSinceBackup(); info.textContent = d == null ? 'Bu cihazdan henüz yedek alınmadı.' : d === 0 ? 'Son yedek: bugün.' : `Son yedek: ${d} gün önce.`; if (d == null || d >= 7) info.classList.add('bad-text'); else info.classList.remove('bad-text'); };
  const btn = h('button.btn', { onclick: async () => {
    btn.disabled = true;
    try {
      const r = await downloadBackup((i, n) => { btn.textContent = `Hazırlanıyor… ${i}/${n}`; });
      toast(`Yedek indirildi (${r.rows} kayıt, ${(r.size / 1048576).toFixed(1)} MB)`, 'ok');
    } catch (e) { toast('Yedek alınamadı: ' + e.message, 'error'); }
    btn.disabled = false; btn.textContent = '⬇ Akademinin yedeğini indir'; paint();
  } }, '⬇ Akademinin yedeğini indir');
  paint();
  return h('div', btn, info, h('div.muted.small', 'Haftada bir indirip bilgisayarında ya da Drive\'da sakla. Öğrenciler, ödevler, ders raporları, program, turnuva maçları — hepsi tek dosyada.'));
}
