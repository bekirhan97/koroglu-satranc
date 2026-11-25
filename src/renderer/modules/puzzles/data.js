// Puzzle sources (built-in Lichess sample + user PGN sets), history and rating.
import { Chess } from 'chess.js';
import { store } from '../../core/store.js';
import { splitPgn } from '../../core/pgn.js';
import { glickoUpdate, inflateRd } from '../../core/glicko.js';
import { gradeCard } from '../../core/srs.js';
import { activity } from '../../core/activity.js';

const api = window.api;
const PUZZLE_RD = 80;

export const pdata = {
  db: null,          // { themes:[], puzzles:[[id, fen, moves, rating, themeIdx[]]] }
  history: [],       // [{id, src, t, ok, r, d, ms, rated, themes}]
  sets: [],          // [{id, name, addedAt, puzzles:[{id, fen, moves, title}]}]
  progress: {},      // { setId: { puzzleId: 'ok' | 'fail' } }
  seen: new Set(),
  review: {},        // { key: { p: puzzle, lv, due, reps, lapses, last, added } } – missed puzzles to repeat
  graduated: 0,      // missed puzzles later solved at the 2-week level
  async load() {
    this.history = await api.read('puzzles/history', []);
    const rv = await api.read('puzzles/review', {});
    this.review = rv.cards || {};
    this.graduated = rv.graduated || 0;
    this.loaded = true;
    this.sets = await api.read('puzzles/sets', []);
    this.progress = await api.read('puzzles/progress', {});
    this.seen = new Set(this.history.filter((x) => x.src === 'lichess').map((x) => x.id));
  },
  async loadDb() {
    if (!this.db) this.db = JSON.parse(await api.puzzles());
    return this.db;
  },
  saveHistory() { return api.write('puzzles/history', this.history); },
  saveSets() { return api.write('puzzles/sets', this.sets); },
  saveProgress() { return api.write('puzzles/progress', this.progress); },
  // Load once per session (the report and assignment progress need the data even if Bulmacalar was never opened).
  async ensure() { if (!this.loaded) await this.load(); return this; },
  saveReview() { return api.write('puzzles/review', { cards: this.review, graduated: this.graduated }); },
};

// Unified puzzle object. firstAuto: moves[0] is the opponent's move that sets up the puzzle (Lichess format).
function fromDb(row, themes) {
  const [id, fen, moves, rating, th] = row;
  return { id, src: 'lichess', fen, moves: moves.split(' '), rating, themes: th.map((i) => themes[i]), firstAuto: true };
}

export function themeCounts() {
  const counts = {};
  for (const p of pdata.db.puzzles) for (const i of p[4]) counts[pdata.db.themes[i]] = (counts[pdata.db.themes[i]] || 0) + 1;
  return counts;
}

// Pick an unseen puzzle near the target rating (window widens until something is found).
// Every candidate inside the window is equally likely. (puzzles.json is sorted by rating, so stopping
// at the first N candidates would always pick from below the target.)
export function pickPuzzle({ target, theme, themes }) {
  return pickFrom(pdata.db, { target, theme, themes, seen: pdata.seen });
}

export function pickFrom(db, { target, theme, themes, seen, random = Math.random }) {
  const wanted = (themes && themes.length ? themes : theme ? [theme] : []).map((t) => db.themes.indexOf(t)).filter((i) => i >= 0);
  if ((theme || (themes && themes.length)) && !wanted.length) return null;
  for (let w = 75; w <= 1600; w *= 2) {
    let chosen = null, n = 0;
    for (const row of db.puzzles) {
      if (Math.abs(row[3] - target) > w) continue;
      if (wanted.length && !wanted.some((i) => row[4].includes(i))) continue;
      if (seen && seen.has(row[0])) continue;
      n++;
      if (random() * n < 1) chosen = row; // reservoir sampling: uniform over all candidates
    }
    if (chosen) return fromDb(chosen, db.themes);
  }
  return null;
}

export function recordResult(puzzle, { ok, ms, rated }) {
  let delta = 0;
  const pr = store.profile.ratings.puzzles;
  if (rated && puzzle.rating) {
    const up = glickoUpdate(pr.r, inflateRd(pr.rd, pr.lastAt), puzzle.rating, PUZZLE_RD, ok ? 1 : 0);
    delta = up.delta;
    pr.r = up.r; pr.rd = up.rd; pr.lastAt = Date.now();
    pr.history.push([Date.now(), Math.round(pr.r * 10) / 10]);
    store.saveProfile();
  }
  pdata.history.push({ id: puzzle.id, src: puzzle.src, t: Date.now(), ok, r: puzzle.rating || null, d: Math.round(delta * 10) / 10, ms, rated: !!rated, themes: puzzle.themes || [] });
  if (puzzle.src === 'lichess') pdata.seen.add(puzzle.id);
  pdata.saveHistory();
  activity.add('puzzles');
  if (!ok) addToReview(puzzle);
  return delta;
}

// ---------- missed puzzles: spaced repetition (unrated) ----------
// A missed puzzle comes back after 4 hours, then 1 day, 3 days, 1 week, 2 weeks. Solving it correctly
// at the 2-week level "graduates" it. A mistake sends it back to 4 hours. Ratings never change here.
export const GRADUATE_LEVEL = 5;
const reviewKey = (p) => (p.src === 'lichess' ? p.id : `set:${p.id}`);

export function addToReview(puzzle, now = Date.now()) {
  const key = reviewKey(puzzle);
  const keep = ({ id, src, fen, moves, rating, themes, firstAuto, title }) => ({ id, src, fen, moves, rating, themes, firstAuto, title });
  const c = pdata.review[key];
  if (c) { gradeCard(c, false, now); c.p = keep(puzzle); }
  else pdata.review[key] = { ...gradeCard(null, false, now), lapses: 0, reps: 0, p: keep(puzzle), added: now };
  pdata.saveReview();
}

export function dueReviews(now = Date.now()) {
  return Object.entries(pdata.review).filter(([, c]) => c.due <= now).sort((a, b) => a[1].due - b[1].due).map(([key, c]) => ({ key, ...c }));
}

export function nextReviewAt() {
  const ds = Object.values(pdata.review).map((c) => c.due);
  return ds.length ? Math.min(...ds) : null;
}

export function gradeReview(key, correct, now = Date.now()) {
  const c = pdata.review[key];
  if (!c) return null;
  const wasLv = c.lv;
  gradeCard(c, correct, now);
  let graduated = false;
  if (correct && wasLv >= GRADUATE_LEVEL) { delete pdata.review[key]; pdata.graduated++; graduated = true; }
  pdata.saveReview();
  activity.add('reviews');
  return { ...c, graduated };
}

// ---------- theme analysis ----------
// Per theme: performance rating over rated puzzles (avg puzzle rating + 400·(wins − losses)/n,
// clamped), compared with the student's puzzle rating. Needs MIN_N puzzles for a verdict.
export const MIN_N = 5;
export const IGNORE_THEMES = new Set(['short', 'long', 'veryLong', 'oneMove', 'master', 'masterVsMaster', 'superGM', 'crushing', 'advantage', 'equality', 'mate', 'middlegame', 'opening', 'endgame']);

export function themeAnalysis(history, rating, { minN = MIN_N, since = 0 } = {}) {
  const per = {};
  let all = { n: 0, ok: 0, rsum: 0 };
  for (const x of history) {
    if (!x.rated || !x.r || x.t < since) continue;
    all.n++; all.ok += x.ok ? 1 : 0; all.rsum += x.r;
    for (const t of x.themes || []) {
      if (IGNORE_THEMES.has(t)) continue;
      const p = (per[t] = per[t] || { n: 0, ok: 0, rsum: 0 });
      p.n++; p.ok += x.ok ? 1 : 0; p.rsum += x.r;
    }
  }
  const perf = (p) => p.rsum / p.n + Math.max(-400, Math.min(400, (400 * (2 * p.ok - p.n)) / p.n));
  const rows = Object.entries(per).map(([theme, p]) => {
    const pr = perf(p);
    const diff = pr - rating;
    const verdict = p.n < minN ? 'az' : diff <= -150 ? 'zayif' : diff >= 150 ? 'guclu' : 'normal';
    return { theme, n: p.n, ok: p.ok, rate: p.ok / p.n, avgRating: p.rsum / p.n, perf: pr, diff, verdict };
  }).sort((a, b) => (a.verdict === 'az') - (b.verdict === 'az') || a.diff - b.diff);
  return { rows, total: all.n, weakest: rows.filter((r) => r.verdict === 'zayif').slice(0, 3).map((r) => r.theme) };
}

// ---------- PGN puzzle sets ----------
// Each game needs a [FEN] tag; the side to move in the FEN is the solver, the mainline is the solution.
export function parsePuzzlePgn(text, name) {
  const puzzles = [];
  let bad = 0;
  splitPgn(text).forEach((g, i) => {
    const c = new Chess();
    try { c.loadPgn(g); } catch { bad++; return; }
    const hist = c.history({ verbose: true });
    const hd = c.getHeaders();
    if (!hist.length) { bad++; return; }
    const fen = hist[0].before;
    const title = [hd.White && hd.White !== '?' ? hd.White : '', hd.Black && hd.Black !== '?' ? hd.Black : '', hd.Event && hd.Event !== '?' ? hd.Event : ''].filter(Boolean).join(' – ');
    puzzles.push({ id: `${i + 1}`, fen, moves: hist.map((m) => m.from + m.to + (m.promotion || '')), title, src: 'set', firstAuto: false });
  });
  return { set: { id: Date.now().toString(36), name, addedAt: Date.now(), puzzles }, bad };
}
