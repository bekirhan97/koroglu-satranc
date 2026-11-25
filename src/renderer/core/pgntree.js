// PGN parser that keeps variations (RAV) and comments, producing a move tree.
// Several games are merged into one tree per starting position. Unknown tokens
// (novelty marks like "N", evaluation symbols, etc.) are ignored.
import { Chess } from 'chess.js';
import { splitPgn } from './pgn.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const RESULT = /^(1-0|0-1|1\/2-1\/2|\*)$/;

function tokenize(text) {
  const tokens = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '{') { const j = text.indexOf('}', i + 1); const end = j < 0 ? n : j; tokens.push({ t: 'c', v: text.slice(i + 1, end).replace(/\s+/g, ' ').trim() }); i = end + 1; continue; }
    if (ch === ';') { const j = text.indexOf('\n', i); const end = j < 0 ? n : j; tokens.push({ t: 'c', v: text.slice(i + 1, end).trim() }); i = end + 1; continue; }
    if (ch === '(' || ch === ')') { tokens.push({ t: ch }); i++; continue; }
    if (/\s/.test(ch)) { i++; continue; }
    let j = i;
    while (j < n && !/[\s(){};]/.test(text[j])) j++;
    tokens.push({ t: 'w', v: text.slice(i, j) });
    i = j;
  }
  return tokens;
}

function cleanSan(w) {
  let s = w.replace(/^\d+\.+/, '');           // "12." / "12..." prefix glued to move
  s = s.replace(/[!?]+$/g, '').replace(/[+#]?[!?]+$/, (m) => m.replace(/[!?]/g, ''));
  s = s.replace(/[!?]/g, '');
  s = s.replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O');
  return s;
}

let nextId = 1;
const newNode = (parent, mv, fen) => ({ id: nextId++, parent, uci: mv ? mv.from + mv.to + (mv.promotion || '') : null, san: mv ? mv.san : null, fen, children: [], comment: '', pre: '' });

function addChild(node, mv, fen) {
  const u = mv.from + mv.to + (mv.promotion || '');
  let c = node.children.find((x) => x.uci === u);
  if (!c) { c = newNode(node, mv, fen); node.children.push(c); }
  return c;
}

function appendComment(node, text) {
  if (!text) return;
  node.comment = node.comment ? node.comment + ' ' + text : text;
}

/**
 * @returns {{ roots: Node[], games: number, skipped: number }}
 *   Node = { id, parent, uci, san, fen, children, comment, pre }
 */
export function parsePgnTree(text, { maxPlies = Infinity } = {}) {
  const rootsByFen = new Map();
  let games = 0, skipped = 0;
  for (const g of splitPgn(text)) {
    const headerFen = (g.match(/\[FEN\s+"([^"]+)"\]/) || [])[1];
    const startFen = headerFen || START;
    let chessRoot;
    try { chessRoot = new Chess(startFen); } catch { skipped++; continue; }
    const key = chessRoot.fen().split(' ').slice(0, 4).join(' ');
    let root = rootsByFen.get(key);
    if (!root) { root = newNode(null, null, chessRoot.fen()); rootsByFen.set(key, root); }
    const body = g.replace(/^\s*\[[^\]]*\]\s*$/gm, '');
    const tokens = tokenize(body);
    let cur = root;
    let depth = 0;
    let pending = '';
    const stack = [];
    let moved = false;
    for (const tok of tokens) {
      if (tok.t === 'c') {
        const atStart = cur === root || (stack.length && cur === stack[stack.length - 1].base && !stack[stack.length - 1].moved);
        if (atStart) pending += (pending ? ' ' : '') + tok.v;
        else appendComment(cur, tok.v);
        continue;
      }
      if (tok.t === '(') {
        stack.push({ resume: cur, depth, base: cur.parent || cur });
        cur = cur.parent || cur;
        depth = Math.max(0, depth - 1);
        pending = '';
        continue;
      }
      if (tok.t === ')') {
        const s = stack.pop();
        if (s) { cur = s.resume; depth = s.depth; }
        pending = '';
        continue;
      }
      const w = tok.v;
      if (RESULT.test(w) || /^\d+\.+$/.test(w) || /^\$\d+$/.test(w)) continue;
      const san = cleanSan(w);
      if (!san || !/[a-hKQRBNOx]/.test(san)) continue;
      if (depth >= maxPlies) continue;
      let mv = null;
      const c = new Chess(cur.fen);
      try { mv = c.move(san, { strict: false }); } catch { mv = null; }
      if (!mv) continue; // e.g. "N" novelty marks, "+-", "=" evaluation symbols
      const child = addChild(cur, mv, mv.after);
      if (pending) { child.pre = child.pre ? child.pre + ' ' + pending : pending; pending = ''; }
      cur = child;
      depth++;
      moved = true;
      if (stack.length) stack[stack.length - 1].moved = true;
    }
    if (moved) games++; else skipped++;
  }
  return { roots: [...rootsByFen.values()].filter((r) => r.children.length), games, skipped };
}

// Serialise a tree compactly (no parent pointers / fens): [uci, san, comment, pre, children]
export function packTree(node) {
  return [node.uci, node.san, node.comment || '', node.pre || '', node.children.map(packTree)];
}

export function unpackTree(packed, startFen) {
  let id = 0;
  const build = (p, parent, fen) => {
    const n = { id: ++id, parent, uci: p[0], san: p[1], comment: p[2], pre: p[3], fen, children: [] };
    n.children = p[4].map((cp) => {
      const c = new Chess(fen);
      c.move({ from: cp[0].slice(0, 2), to: cp[0].slice(2, 4), promotion: cp[0][4] });
      return build(cp, n, c.fen());
    });
    return n;
  };
  return build(packed, null, startFen);
}

// Path of UCI moves from the root to a node (used as a stable key).
export function pathKey(node) {
  const parts = [];
  for (let n = node; n && n.uci; n = n.parent) parts.push(n.uci);
  return parts.reverse().join(' ');
}

export function countNodes(node) { let n = 1; for (const c of node.children) n += countNodes(c); return n; }
