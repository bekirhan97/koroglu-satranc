// Oyunsonu müfredatı: data/endgames.json (built by scripts/build-endgames.py from the coach's endgame books:
// positions only — no annotations; titles/explanations are ours; every goal verified with the Lichess tablebase
// (≤ 7 pieces) or Stockfish (practical positions)).
//   { chapters: [{ id, name, desc, icon, kind: 'teori'|'pratik' }],
//     lessons: [{ id, ch, topic, title, fen, goal, oppFirst, text, level, src }] }
export const GOAL_TEXT = { mate: 'Mat et', win: 'Kazan', draw: 'Beraberliği tut' };
export const GOAL_LONG = {
  mate: 'Mat et',
  win: 'Kazan: mat et ya da piyonu güvenle terfi ettir',
  draw: 'Beraberliği tut',
};
export const LEVELS = [
  [1, 'Başlangıç'], [2, 'Temel'], [3, 'Orta'], [4, 'İyi'], [5, 'İleri'], [6, 'Usta'],
];
export const levelName = (n) => (LEVELS.find(([k]) => k === n) || [0, ''])[1];

let cache = null;
export async function loadCurriculum(fetchFn = (u) => fetch(u)) {
  if (cache) return cache;
  const res = await fetchFn('data/endgames.json');
  if (!res.ok) throw new Error('Oyunsonu dersleri yüklenemedi');
  cache = await res.json();
  cache.byId = new Map(cache.lessons.map((l) => [l.id, l]));
  return cache;
}
export const curriculum = () => cache;
export const lessonById = (id) => (cache ? cache.byId.get(id) : null);
