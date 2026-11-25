// Computer opponents shared by modules: Stockfish strength levels and Maia (human-like, by rating).
import { Chess } from 'chess.js';
import { analyse, PRIORITY } from './engine.js';

// ---------- Maia (Web Worker) ----------
let worker = null;
let wid = 0;
const waiting = new Map();
const loaded = new Set();
let tablesReady = null;

function call(msg, transfer) {
  if (!worker) {
    worker = new Worker('maia-worker.js', { type: 'module' });
    worker.onmessage = (e) => { const w = waiting.get(e.data.id); if (w) { waiting.delete(e.data.id); e.data.ok ? w.resolve(e.data) : w.reject(new Error(e.data.error)); } };
  }
  return new Promise((resolve, reject) => { const id = ++wid; waiting.set(id, { resolve, reject }); worker.postMessage({ ...msg, id }, transfer || []); });
}

async function ensureMaia(elo) {
  if (!tablesReady) tablesReady = window.api.maiaTables().then((tables) => call({ type: 'tables', tables }));
  await tablesReady;
  if (!loaded.has(elo)) {
    const bytes = await window.api.maiaWeights(elo);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await call({ type: 'load', elo, buffer: buf }, [buf]);
    loaded.add(elo);
  }
}

export const MAIA_LEVELS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900];

// Stockfish levels: weakened with Skill Level and a shallow depth (similar in spirit to Lichess AI levels).
export const SF_LEVELS = [
  { level: 1, skill: 0, depth: 1, movetime: 50, approx: '~800' },
  { level: 2, skill: 3, depth: 2, movetime: 100, approx: '~1100' },
  { level: 3, skill: 6, depth: 3, movetime: 150, approx: '~1400' },
  { level: 4, skill: 9, depth: 5, movetime: 200, approx: '~1700' },
  { level: 5, skill: 12, depth: 8, movetime: 300, approx: '~2000' },
  { level: 6, skill: 15, depth: 12, movetime: 500, approx: '~2300' },
  { level: 7, skill: 18, depth: 16, movetime: 800, approx: '~2600' },
  { level: 8, skill: 20, depth: 22, movetime: 1500, approx: 'tam güç' },
];

export function opponentName(opp) {
  if (opp.kind === 'maia') return `Maia ${opp.elo}`;
  const l = SF_LEVELS[opp.level - 1];
  return `Stockfish seviye ${opp.level} (${l.approx})`;
}

/**
 * Choose a move for the side to move.
 * @param {object} opp { kind: 'maia', elo, sample } | { kind: 'stockfish', level }
 * @param {string[]} history FENs from the first position to the current one
 * @returns {Promise<string>} uci
 */
export async function chooseMove(opp, history) {
  const fen = history[history.length - 1];
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
  if (legal.length === 1) return legal[0];
  if (opp.kind === 'maia') {
    await ensureMaia(opp.elo);
    const { policy } = await call({ type: 'policy', elo: opp.elo, history, legal });
    if (!opp.sample) return policy[0].uci;
    // "More human variety": sample among moves with at least 10% of the top move's probability.
    const cands = policy.filter((m) => m.p >= policy[0].p * 0.1);
    let r = Math.random() * cands.reduce((a, m) => a + m.p, 0);
    for (const m of cands) { r -= m.p; if (r <= 0) return m.uci; }
    return cands[0].uci;
  }
  const L = SF_LEVELS[opp.level - 1];
  const res = await analyse({ fen, depth: L.depth, movetime: L.movetime, multipv: 1, options: { 'Skill Level': L.skill }, tag: 'play' }, PRIORITY.URGENT);
  return res.bestmove && res.bestmove !== '(none)' ? res.bestmove : legal[0];
}
