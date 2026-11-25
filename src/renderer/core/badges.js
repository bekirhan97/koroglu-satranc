// Badges, computed from the data the app already keeps (so past work counts too).
// Earned dates are stored in badges.json: { id: earnedAt }.
import { store } from './store.js';
import { activity, streak } from './activity.js';
import { assignments, assignmentProgress } from './assign.js';
import { pdata, themeAnalysis } from '../modules/puzzles/data.js';
import { attemptStats } from '../modules/gtm/session.js';

const api = window.api;

// value(ctx) → current number, goal → target. Badges are grouped for display.
export const BADGES = [
  { id: 'pz1', group: 'Bulmaca', icon: '🧩', name: 'İlk adım', desc: 'İlk bulmacanı çöz', value: (c) => c.pzOk, goal: 1 },
  { id: 'pz100', group: 'Bulmaca', icon: '🧩', name: 'Yüz bulmaca', desc: '100 bulmaca çöz', value: (c) => c.pzOk, goal: 100 },
  { id: 'pz500', group: 'Bulmaca', icon: '🏅', name: 'Bulmaca avcısı', desc: '500 bulmaca çöz', value: (c) => c.pzOk, goal: 500 },
  { id: 'pz1000', group: 'Bulmaca', icon: '🏆', name: 'Bin bulmaca', desc: '1000 bulmaca çöz', value: (c) => c.pzOk, goal: 1000 },
  { id: 'theme', group: 'Bulmaca', icon: '🎯', name: 'Tema ustası', desc: 'Bir temada "güçlü" ol', value: (c) => c.strongThemes, goal: 1 },
  { id: 'review10', group: 'Bulmaca', icon: '🔁', name: 'Hatasından öğrenen', desc: 'Kaçırdığın 10 bulmacayı öğren', value: (c) => c.graduated, goal: 10 },
  { id: 'storm15', group: 'Storm', icon: '⚡', name: 'Fırtına', desc: "Puzzle Storm'da 15 bulmaca", value: (c) => c.stormBest, goal: 15 },
  { id: 'storm30', group: 'Storm', icon: '🌪️', name: 'Kasırga', desc: "Puzzle Storm'da 30 bulmaca", value: (c) => c.stormBest, goal: 30 },
  { id: 'streak3', group: 'Seri', icon: '🔥', name: 'Isınma', desc: '3 gün üst üste çalış', value: (c) => c.bestStreak, goal: 3 },
  { id: 'streak7', group: 'Seri', icon: '🔥', name: 'Bir hafta', desc: '7 gün üst üste çalış', value: (c) => c.bestStreak, goal: 7 },
  { id: 'streak30', group: 'Seri', icon: '👑', name: 'Bir ay', desc: '30 gün üst üste çalış', value: (c) => c.bestStreak, goal: 30 },
  { id: 'gtm1', group: 'Tahmin Et', icon: '🔍', name: 'İlk tahmin', desc: 'Bir Tahmin Et oyununu bitir', value: (c) => c.gtmDone, goal: 1 },
  { id: 'gtm10', group: 'Tahmin Et', icon: '📚', name: 'Ustaların izinde', desc: '10 Tahmin Et oyunu bitir', value: (c) => c.gtmDone, goal: 10 },
  { id: 'gtmeye', group: 'Tahmin Et', icon: '👁️', name: 'Usta gözü', desc: 'Bir oyunda ustanın hamlelerinin %60\'ını bul', value: (c) => c.gtmBestMaster, goal: 60 },
  { id: 'open100', group: 'Açılış', icon: '📖', name: 'Açılış çalışkanı', desc: '100 açılış pozisyonu tekrar et', value: (c) => c.openings, goal: 100 },
  { id: 'win1', group: 'Oyun', icon: '♟️', name: 'İlk galibiyet', desc: 'Pozisyondan Oyna\'da bir oyun kazan', value: (c) => c.wins, goal: 1 },
  { id: 'maia1900', group: 'Oyun', icon: '🤖', name: 'Maia avcısı', desc: 'Maia 1900\'ü yen', value: (c) => c.beatMaia1900, goal: 1 },
  { id: 'sf6', group: 'Oyun', icon: '🐟', name: 'Balık tutan', desc: 'Stockfish 6. seviye ya da üstünü yen', value: (c) => c.beatSf6, goal: 1 },
  { id: 'hw1', group: 'Ödev', icon: '✅', name: 'Ödev tamam', desc: 'Bir ödevin tamamını bitir', value: (c) => c.hwDone, goal: 1 },
  { id: 'exam90', group: 'Ödev', icon: '🎓', name: 'Sınav birincisi', desc: 'Bir sınavdan 90 ve üstü al', value: (c) => c.examBest, goal: 90 },
];

export async function gatherContext() {
  await Promise.all([activity.load(), assignments.load()]);
  await pdata.ensure();
  const goal = assignments.goal();
  const st = streak(activity.days, null);
  const openings = Object.values(activity.days).reduce((a, d) => a + (d.openings || 0), 0);
  let gtmDone = 0, gtmBestMaster = 0;
  for (const g of store.games) {
    for (const a of (store.attempts[g.id] || []).filter((x) => x.status === 'done')) {
      gtmDone++;
      const s = attemptStats(a);
      if (s.played >= 8) gtmBestMaster = Math.max(gtmBestMaster, Math.round((100 * s.master) / s.played));
    }
  }
  const games = (await api.read('play/games', [])).filter((g) => g.status === 'done');
  const won = games.filter((g) => g.result !== '1/2-1/2' && g.result !== '*' && (g.result === '1-0') === (g.userColor === 'w'));
  let hwDone = 0;
  for (const a of assignments.list) if ((await assignmentProgress(a)).complete) hwDone++;
  const storm = await api.read('puzzles/storm', { best: {} });
  const exams = await api.read('exams', {});
  void goal;
  return {
    pzOk: pdata.history.filter((x) => x.ok).length,
    strongThemes: themeAnalysis(pdata.history, store.profile.ratings.puzzles.r).rows.filter((r) => r.verdict === 'guclu').length,
    graduated: pdata.graduated,
    stormBest: Math.max(0, ...Object.values(storm.best || {}).map((b) => b.score || 0)),
    bestStreak: st.best,
    gtmDone, gtmBestMaster, openings,
    wins: won.length,
    beatMaia1900: won.filter((g) => g.opp.kind === 'maia' && g.opp.elo >= 1900).length,
    beatSf6: won.filter((g) => g.opp.kind === 'stockfish' && g.opp.level >= 6).length,
    hwDone,
    examBest: Math.max(0, ...Object.values(exams).map((e) => e.score || 0)),
  };
}

// Pure: which badges are earned for a context, with progress.
export function evaluate(ctx) {
  return BADGES.map((b) => { const v = b.value(ctx) || 0; return { ...b, current: v, earned: v >= b.goal, progress: Math.min(1, v / b.goal) }; });
}

// Evaluate, store newly earned ones with today's date, return { list, fresh }.
export async function refreshBadges() {
  const earnedAt = await api.read('badges', {});
  const list = evaluate(await gatherContext());
  const fresh = [];
  for (const b of list) {
    if (b.earned && !earnedAt[b.id]) { earnedAt[b.id] = Date.now(); fresh.push(b); }
    b.earnedAt = earnedAt[b.id] || null;
  }
  if (fresh.length) await api.write('badges', earnedAt);
  return { list, fresh };
}
