// Exact endgame judgement: Lichess tablebase (≤ 7 pieces) — result + best moves for the side to move.
// Falls back to Stockfish (api.analyse) when the tablebase can't be reached or there are more pieces.
import { Chess } from 'chess.js';

const TB = 'https://tablebase.lichess.ovh/standard?fen=';
const cache = new Map();

// Lichess categories are from the side to move. 50-move-rule results (cursed/blessed) count as draws.
export function norm(cat) {
  if (cat === 'win' || cat === 'syzygy-win' || cat === 'maybe-win') return 'win';
  if (cat === 'loss' || cat === 'syzygy-loss' || cat === 'maybe-loss') return 'loss';
  if (cat === 'draw' || cat === 'cursed-win' || cat === 'blessed-loss') return 'draw';
  return null;
}
export const flip = (r) => (r === 'win' ? 'loss' : r === 'loss' ? 'win' : r);
export const pieceCount = (fen) => fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;

// → { result (side to move), dtm (moves, may be null), best: [{uci, san, result (for the mover)}], source }
export async function probe(fen, { fetchFn = (u) => fetch(u), engine = null } = {}) {
  if (cache.has(fen)) return cache.get(fen);
  let out = null;
  if (pieceCount(fen) <= 7) {
    try {
      const res = await fetchFn(TB + encodeURIComponent(fen));
      if (res.ok) {
        const j = await res.json();
        const result = norm(j.category);
        if (result) {
          out = {
            result, source: 'tablebase',
            dtm: j.dtm != null ? Math.ceil(Math.abs(j.dtm) / 2) : null,
            best: (j.moves || []).map((m) => ({ uci: m.uci, san: m.san, result: flip(norm(m.category)) })).filter((m) => m.result),
          };
        }
      }
    } catch (e) { /* offline → engine */ }
  }
  if (!out && engine) out = await engineProbe(fen, engine);
  if (out) cache.set(fen, out);
  return out;
}

async function engineProbe(fen, engine) {
  const r = await engine({ fen, depth: 18, movetime: 1500 }, 2);
  if (!r || r.error || !r.lines || !r.lines.length) return null;
  const l = r.lines[0];
  const result = l.mate != null ? (l.mate > 0 ? 'win' : 'loss') : l.cp >= 300 ? 'win' : l.cp <= -300 ? 'loss' : 'draw';
  const c = new Chess(fen);
  let san = l.uci;
  try { san = c.move({ from: l.uci.slice(0, 2), to: l.uci.slice(2, 4), promotion: l.uci[4] || 'q' }).san; } catch (e) { /* keep uci */ }
  return { result, source: 'engine', dtm: l.mate != null ? Math.abs(l.mate) : null, best: [{ uci: l.uci, san, result }] };
}

// Game-over state of a position (from chess.js).
export function gameState(fen) {
  const c = new Chess(fen);
  if (c.isCheckmate()) return 'mate';
  if (c.isStalemate()) return 'stalemate';
  if (c.isInsufficientMaterial()) return 'insufficient';
  return null;
}

// How a finished attempt is scored. par = moves expected for 3 stars (null = no move limit).
export function stars({ mistakes, hints, moves, par }) {
  if (!mistakes && !hints && (par == null || moves <= par)) return 3;
  if (mistakes + hints <= 2) return 2;
  return 1;
}

export const HOLD_MOVES = 12; // a 'draw' lesson is passed after holding this many moves
