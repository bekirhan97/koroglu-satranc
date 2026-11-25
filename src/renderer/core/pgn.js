import { Chess } from 'chess.js';
import { parsePgnTree } from './pgntree.js';

// Split a multi-game PGN file into single-game strings.
export function splitPgn(text) {
  const src = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const games = [];
  let cur = [];
  let inMoves = false;
  for (const line of src.split('\n')) {
    const isHeader = /^\s*\[\w+\s+".*"\]\s*$/.test(line);
    if (isHeader && inMoves) { games.push(cur.join('\n')); cur = []; inMoves = false; }
    if (!isHeader && line.trim() && !line.trim().startsWith('%')) inMoves = true;
    cur.push(line);
  }
  if (cur.join('').trim()) games.push(cur.join('\n'));
  return games.filter((g) => /\S/.test(g));
}

function hash(str) {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h1 ^= str.charCodeAt(i); h1 = Math.imul(h1, 16777619); }
  return (h1 >>> 0).toString(36);
}

// Parse one game. Returns null if it has no moves or fails to parse.
// Alternatives (RAV) to each mainline move: variations[p] = [{ ucis, sans, label, comment }] for move p.
// Each variation follows its first-choice chain, at most 16 plies; nested side lines are left out.
export function extractVariations(pgnText, ucis) {
  let roots;
  try { ({ roots } = parsePgnTree(pgnText)); } catch { return {}; }
  if (!roots || !roots.length) return {};
  const out = {};
  let node = roots[0];
  for (let p = 0; p < ucis.length && node; p++) {
    const main = node.children.find((c) => c.uci === ucis[p]);
    const alts = node.children.filter((c) => c !== main);
    if (alts.length) {
      out[p] = alts.slice(0, 4).map((alt) => {
        const line = [];
        const comments = [];
        for (let n = alt; n && line.length < 16; n = n.children[0]) { line.push(n); if (n.comment) comments.push(n.comment); }
        const label = line.map((n, i) => { const f = n.parent.fen.split(' '); const num = f[5]; return (f[1] === 'w' ? `${num}.` : i === 0 ? `${num}...` : '') + n.san; }).join(' ');
        return { ucis: line.map((n) => n.uci), sans: line.map((n) => n.san), label, comment: comments.join(' ').slice(0, 300) };
      });
    }
    node = main;
  }
  return out;
}

export function parseGame(pgnText, collection) {
  const chess = new Chess();
  try { chess.loadPgn(pgnText); } catch (e) { return { error: e.message }; }
  const headers = chess.getHeaders();
  const verbose = chess.history({ verbose: true });
  if (verbose.length < 2) return { error: 'Hamle yok' };
  const startFen = verbose[0].before;
  const comments = {};
  const byFen = {};
  for (const c of chess.getComments()) byFen[c.fen] = c.comment;
  // comment attached to the position after ply i (1-based); 0 = before first move
  if (byFen[startFen]) comments[0] = byFen[startFen];
  verbose.forEach((m, i) => { if (byFen[m.after]) comments[i + 1] = byFen[m.after]; });

  const result = headers.Result || '*';
  let userColor = null;
  const tag = (headers.GTMPlayAsColor || '').toLowerCase();
  if (tag === 'w' || tag === 'white') userColor = 'w';
  else if (tag === 'b' || tag === 'black') userColor = 'b';
  else if (result === '1-0') userColor = 'w';
  else if (result === '0-1') userColor = 'b';
  else userColor = 'w';

  const sans = verbose.map((m) => m.san);
  const ucis = verbose.map((m) => m.from + m.to + (m.promotion || ''));
  return {
    id: hash(JSON.stringify([headers.White, headers.Black, headers.Date, headers.Event, startFen, ucis.join('')])),
    collection,
    headers: {
      White: headers.White || '?', Black: headers.Black || '?', Result: result,
      Event: headers.Event && headers.Event !== '?' ? headers.Event : '',
      Date: headers.Date && !headers.Date.startsWith('?') ? headers.Date : '',
      WhiteElo: headers.WhiteElo || '', BlackElo: headers.BlackElo || '',
    },
    startFen,
    sans,
    ucis,
    comments,
    variations: extractVariations(pgnText, ucis),
    userColor,
    addedAt: Date.now(),
  };
}

// Rebuild FENs: fens[i] = position before ply i (0-based); fens[n] = final position.
export function gameFens(game) {
  const chess = new Chess(game.startFen);
  const fens = [chess.fen()];
  for (const u of game.ucis) {
    chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    fens.push(chess.fen());
  }
  return fens;
}

export function sideToMove(fen) { return fen.split(' ')[1]; }

// SAN for a UCI move in a position (null if illegal).
export function uciToSan(fen, uci) {
  try {
    const c = new Chess(fen);
    return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' }).san;
  } catch { return null; }
}

export function moveNumberLabel(fen) {
  const parts = fen.split(' ');
  return parts[1] === 'w' ? `${parts[5]}.` : `${parts[5]}...`;
}
