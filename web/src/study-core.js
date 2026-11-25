// "Çalışma raporu": how much of each kind of work students did in a period, per student and per group.
// Pure functions (no browser APIs) so they can be unit-tested.
export const DAY = 86400e3;
export const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Periods: from (inclusive) .. to (inclusive) as YYYY-MM-DD keys, local time.
export const PERIODS = [
  ['today', 'Bugün'], ['d3', 'Son 3 gün'], ['d7', 'Son 7 gün'], ['d15', 'Son 15 gün'], ['d30', 'Son 30 gün'],
  ['month', 'Bu ay'], ['prevMonth', 'Geçen ay'],
];
export function periodRange(id, now = Date.now()) {
  const t = new Date(now);
  const back = (n) => keyOf(new Date(t.getFullYear(), t.getMonth(), t.getDate() - n, 12));
  const today = keyOf(t);
  if (id === 'today') return { from: today, to: today };
  const m = /^d(\d+)$/.exec(id);
  if (m) return { from: back(Number(m[1]) - 1), to: today };
  if (id === 'month') return { from: keyOf(new Date(t.getFullYear(), t.getMonth(), 1, 12)), to: today };
  if (id === 'prevMonth') return { from: keyOf(new Date(t.getFullYear(), t.getMonth() - 1, 1, 12)), to: keyOf(new Date(t.getFullYear(), t.getMonth(), 0, 12)) };
  return { from: today, to: today };
}
const ms = (key, end) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d + (end ? 1 : 0)).getTime() - (end ? 1 : 0); };
export const rangeMs = (r) => ({ since: ms(r.from), until: ms(r.to, true) });

// Columns: [key, short label, long label]
export const COLS = [
  ['puzzles', 'Bulmaca', 'Çözülen bulmaca (antrenman, ödev setleri, Storm/Rush/Streak, oyunlarımdan)'],
  ['reviews', 'Tekrar', 'Bulmaca tekrarı'],
  ['speed', 'Hız oyunu', 'Storm / Rush / Streak oyunu sayısı'],
  ['openings', 'Açılış', 'Açılış tekrarı (pozisyon)'],
  ['gtmGames', 'Tahmin Et', 'Hamleyi Tahmin Et (oyun)'],
  ['playGames', 'Motor/Maia', 'Pozisyondan Oyna (oyun)'],
  ['videos', 'Video', 'İzlenen video'],
  ['lichess', 'Lichess', 'Lichess maçı (istenince sayılır)'],
  ['days', 'Aktif gün', 'Çalıştığı gün sayısı'],
  ['lessons', 'Ders', 'Derse katılım (geldi / ders)'],
];
const ACT = ['puzzles', 'reviews', 'openings', 'gtmGames', 'playGames', 'videos'];

// rep: the student's latest report; scores: [{student_id, created_at}]; attendance: [{student_id, status, date}]
export function studentRow(st, rep, { from, to, scores = [], attendance = [], lichess = null }) {
  const row = { id: st.id, name: st.display_name, group: st.group_name || '', lesson_type: st.lesson_type, hasReport: !!rep };
  for (const k of ACT) row[k] = 0;
  row.days = 0;
  const days = (rep && rep.activity && rep.activity.days) || [];
  for (const d of days) {
    if (d.key < from || d.key > to) continue;
    let any = false;
    for (const k of ACT) if (d[k]) { row[k] += d[k]; any = true; }
    if (any || d.gtmMoves) row.days++;
  }
  row.speed = scores.filter((s) => s.student_id === st.id).length;
  const att = attendance.filter((a) => a.student_id === st.id && a.date >= from && a.date <= to);
  row.lessonsCame = att.filter((a) => a.status === 'geldi').length;
  row.lessonsTotal = att.length;
  row.lessons = row.lessonsTotal ? row.lessonsCame / row.lessonsTotal : null;
  row.lichess = lichess;
  // how far back the report reaches (data older than this is not known)
  row.coverFrom = days.length ? days[0].key : null;
  return row;
}

// Totals and per-student averages for a set of rows; lessons = overall attendance rate.
export function summarize(rows) {
  const out = { n: rows.length, total: {}, avg: {} };
  for (const [k] of COLS) {
    if (k === 'lessons') {
      const came = rows.reduce((a, r) => a + r.lessonsCame, 0), tot = rows.reduce((a, r) => a + r.lessonsTotal, 0);
      out.total.lessonsCame = came; out.total.lessonsTotal = tot;
      out.total[k] = out.avg[k] = tot ? came / tot : null;
      continue;
    }
    const vals = rows.map((r) => r[k]).filter((v) => typeof v === 'number');
    out.total[k] = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
    out.avg[k] = vals.length ? out.total[k] / rows.length : null;
  }
  return out;
}

export function groupRows(rows) {
  const by = new Map();
  for (const r of rows) {
    const g = r.lesson_type === 'ozel' ? 'Özel ders' : (r.group || 'Grupsuz');
    if (!by.has(g)) by.set(g, []);
    by.get(g).push(r);
  }
  return [...by.entries()].map(([name, rs]) => ({ name, rows: rs, sum: summarize(rs) })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

export function toCsv(rows, label) {
  const head = ['Öğrenci', 'Grup', ...COLS.filter(([k]) => k !== 'lessons').map(([, s]) => s), 'Derse geldi', 'Ders sayısı'];
  const lines = [[`Çalışma raporu: ${label}`], head];
  for (const r of rows) lines.push([r.name, r.lesson_type === 'ozel' ? 'Özel ders' : r.group, ...COLS.filter(([k]) => k !== 'lessons').map(([k]) => (r[k] == null ? '' : r[k])), r.lessonsCame, r.lessonsTotal]);
  return '﻿' + lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
}
