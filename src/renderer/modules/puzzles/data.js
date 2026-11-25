// Puzzle sources (built-in Lichess sample + user PGN sets), history and rating.
import { Chess } from 'chess.js';
import { store } from '../../core/store.js';
import { splitPgn } from '../../core/pgn.js';
import { glickoUpdate, inflateRd } from '../../core/glicko.js';

const api = window.api;
const PUZZLE_RD = 80;

export const pdata = {
  db: null,          // { themes:[], puzzles:[[id, fen, moves, rating, themeIdx[]]] }
  history: [],       // [{id, src, t, ok, r, d, ms, rated, themes}]
  sets: [],          // [{id, name, addedAt, puzzles:[{id, fen, moves, title}]}]
  progress: {},      // { setId: { puzzleId: 'ok' | 'fail' } }
  seen: new Set(),
  async load() {
    this.history = await api.read('puzzles/history', []);
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
  return delta;
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
