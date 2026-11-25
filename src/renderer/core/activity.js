// Study log per local day, the daily goal and the streak.
//   activity.json: { days: { 'YYYY-MM-DD': { puzzles, reviews, openings, gtmMoves, gtmGames, playGames, ms } } }
// The daily goal comes from the teacher's assignment package (or the student sets it in Settings).
const api = window.api;

export const GOAL_KINDS = [
  ['puzzles', 'bulmaca', 'Bulmaca (tekrarlar dahil)'],
  ['openings', 'açılış pozisyonu', 'Açılış tekrarı (pozisyon)'],
  ['gtmGames', 'Tahmin Et oyunu', 'Hamleyi Tahmin Et (oyun)'],
  ['playGames', 'oyun', 'Pozisyondan Oyna (oyun)'],
];

export const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n, 12).getTime()); };

export const activity = {
  days: {},
  loaded: false,
  async load() { const a = await api.read('activity', {}); this.days = a.days || {}; this.loaded = true; return this; },
  save() { return api.write('activity', { days: this.days }); },
  // kind: puzzles | reviews | openings | gtmMoves | gtmGames | playGames
  add(kind, n = 1, t = Date.now()) {
    const k = dayKey(t);
    const d = (this.days[k] = this.days[k] || {});
    d[kind] = (d[kind] || 0) + n;
    this.save();
    if (typeof window.dispatchEvent === 'function' && typeof Event === 'function') window.dispatchEvent(new Event('activity-changed'));
  },
  day(t = Date.now()) { return this.days[dayKey(t)] || {}; },
};

// How much of each goal item is done on a given day. Reviews count towards the puzzle goal.
export function goalProgress(goal, day) {
  if (!goal) return null;
  const items = GOAL_KINDS.filter(([k]) => goal[k] > 0).map(([k, unit, label]) => {
    const done = k === 'puzzles' ? (day.puzzles || 0) + (day.reviews || 0) : day[k] || 0;
    return { kind: k, unit, label, target: goal[k], done: Math.min(done, goal[k]), raw: done };
  });
  if (!items.length) return null;
  return { items, met: items.every((i) => i.done >= i.target) };
}

const studied = (d) => !!d && ['puzzles', 'reviews', 'openings', 'gtmMoves', 'playGames'].some((k) => d[k] > 0);

// Streak: consecutive days with study (or with the goal met, when there is a goal).
// Today does not break the streak while it is still in progress.
export function streak(days, goal, today = dayKey()) {
  const ok = (k) => { const g = goal && goalProgress(goal, days[k] || {}); return g ? g.met : studied(days[k]); };
  let n = 0;
  let k = ok(today) ? today : addDays(today, -1);
  while (ok(k)) { n++; k = addDays(k, -1); }
  let best = 0, run = 0, prev = null;
  for (const key of Object.keys(days).sort()) {
    if (!ok(key)) continue;
    run = prev && addDays(prev, 1) === key ? run + 1 : 1;
    prev = key;
    best = Math.max(best, run);
  }
  return { current: n, best: Math.max(best, n), todayDone: ok(today) };
}

// Last n days, oldest first, for small charts and reports.
export function lastDays(days, n = 28, today = dayKey()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const k = addDays(today, -i); out.push({ key: k, ...(days[k] || {}) }); }
  return out;
}
