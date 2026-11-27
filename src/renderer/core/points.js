// "Çalışma puanı": every kind of study earns points; each kind has a daily cap so one activity can't be farmed.
// The same table is mirrored in SQL (private.day_points) for the weekly / monthly rankings — keep them in sync.
//   [activity key, label, points per item, daily cap (items), unit]
export const POINTS = [
  ['puzzles', 'Bulmaca', 1, 60, 'bulmaca'],
  ['reviews', 'Bulmaca tekrarı', 1, 30, 'tekrar'],
  ['openings', 'Açılış Tekrarı', 1, 30, 'pozisyon'],
  ['endgames', 'Oyunsonu', 5, 10, 'konum'],
  ['strategy', 'Strateji', 3, 20, 'soru'],
  ['videos', 'Video', 10, 3, 'video'],
  ['gtmGames', 'Hamleyi Tahmin Et', 15, 3, 'oyun'],
  ['playGames', 'Pozisyondan Oyna', 8, 5, 'oyun'],
  ['lichessGames', "Lichess'te Oyna", 10, 4, 'oyun'],
];
export const DAY_MAX = POINTS.reduce((a, [, , p, cap]) => a + p * cap, 0);

export function dayPoints(d) {
  if (!d) return 0;
  let s = 0;
  for (const [k, , p, cap] of POINTS) s += Math.min(Math.max(0, d[k] || 0), cap) * p;
  return s;
}

// All-time summary from the full activity log: { total, by: { key: count } } (goes into the student's report).
export function pointsSummary(days) {
  const out = { total: 0, by: {} };
  for (const [k] of POINTS) out.by[k] = 0;
  for (const d of Object.values(days || {})) {
    out.total += dayPoints(d);
    for (const [k] of POINTS) out.by[k] += d[k] || 0;
  }
  return out;
}
