// Attempts (play-throughs) and the live statistics panel.
import { store } from '../../core/store.js';
import { glickoUpdate, inflateRd } from '../../core/glicko.js';
import { outcomeClass } from './scoring.js';

const POS_RD = 80;

export function attemptsOf(gameId) { return store.attempts[gameId] || []; }
export function lastAttempt(gameId) { const a = attemptsOf(gameId); return a[a.length - 1] || null; }
export function activeAttempt(gameId) { const a = lastAttempt(gameId); return a && a.status === 'active' ? a : null; }
export function hasFinished(gameId) { return attemptsOf(gameId).some((a) => a.status === 'done'); }

export function newAttempt(game, rated) {
  const att = {
    id: Date.now().toString(36),
    gameId: game.id,
    startedAt: Date.now(),
    rated,
    startRating: store.profile.ratings.gtm.r,
    status: 'active',
    lastPly: 0,
    skipped: [],
    moves: {},
  };
  (store.attempts[game.id] = store.attempts[game.id] || []).push(att);
  return att;
}

// Apply (or, for unrated attempts, only compute) the rating change for one scored move.
export function rateMove(att, posRating, score) {
  const gtm = store.profile.ratings.gtm;
  const rd = inflateRd(gtm.rd, gtm.lastAt);
  const s = Math.max(0, Math.min(1, score / 10));
  const up = glickoUpdate(gtm.r, rd, posRating, POS_RD, s);
  if (att.rated) {
    gtm.r = up.r;
    gtm.rd = up.rd;
    gtm.lastAt = Date.now();
    gtm.history.push([Date.now(), Math.round(up.r * 10) / 10]);
  }
  return up.delta;
}

export function attemptStats(att) {
  const st = {
    ratingChange: 0, master: 0, engine: 0, bonus: 0, played: 0,
    winTotal: 0, winToLoss: 0, winToEven: 0, evenTotal: 0, evenToLoss: 0,
    totalMs: 0, scoreSum: 0, avg: 0,
  };
  for (const m of Object.values(att.moves)) {
    st.played++;
    st.scoreSum += m.score;
    st.totalMs += m.timeMs || 0;
    if (att.rated) st.ratingChange += m.ratingDelta || 0;
    if (m.uci === m.masterUci) st.master++;
    if (m.uci === m.bestUci) st.engine++;
    if (m.type === 'bonus') st.bonus++;
    const before = outcomeClass(m.bestCp);
    const after = outcomeClass(m.cp);
    if (before === 'win') { st.winTotal++; if (after === 'loss') st.winToLoss++; else if (after === 'even') st.winToEven++; }
    if (before === 'even') { st.evenTotal++; if (after === 'loss') st.evenToLoss++; }
  }
  st.avg = st.played ? st.scoreSum / st.played : 0;
  return st;
}

export const pct = (a, b) => (b ? `${a}/${b} (${((100 * a) / b).toFixed(1)}%)` : `${a}/${b} (-%)`);
