// Maia (lc0 SE-ResNet, classical 112-plane input, convolutional policy) inference in plain JavaScript.
// Ported from lc0's encoder (src/neural/encoder.cc) and BLAS backend (BN folding, SE unit, conv policy map).
// No native code: runs the same on Windows and macOS.

const EPS = 1e-5;
const SQ = 64;

// ---------- weights ----------
export function loadNet(buffer) {
  const dv = new DataView(buffer);
  const hlen = dv.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, hlen)));
  let off = 4 + hlen; if (off % 2) off++;
  const raw = {};
  for (const l of header.layers) {
    const u = new Uint16Array(buffer.slice(off, off + l.n * 2));
    off += l.n * 2;
    const f = new Float32Array(l.n);
    const scale = (l.max - l.min) / 65535;
    for (let i = 0; i < l.n; i++) f[i] = l.min + u[i] * scale;
    raw[l.name] = f;
  }
  const conv = (pre) => foldBn(raw[pre + '.weights'], raw[pre + '.biases'], raw[pre + '.bnMeans'], raw[pre + '.bnStddivs'], raw[pre + '.bnGammas'], raw[pre + '.bnBetas']);
  const net = { filters: header.filters, input: conv('input'), blocks: [] };
  for (let b = 0; b < header.blocks; b++) {
    net.blocks.push({
      conv1: conv(`res${b}.conv1`), conv2: conv(`res${b}.conv2`),
      se: { w1: raw[`res${b}.se.w1`], b1: raw[`res${b}.se.b1`], w2: raw[`res${b}.se.w2`], b2: raw[`res${b}.se.b2`] },
    });
  }
  net.policy1 = conv('policy1');
  net.policy = { w: raw['policy.weights'], b: raw['policy.biases'] };
  return net;
}

function foldBn(w, biases, means, vars, gammas, betas) {
  const outs = means ? means.length : biases.length;
  const ins = w.length / outs;
  const W = new Float32Array(w);
  const B = new Float32Array(outs);
  for (let o = 0; o < outs; o++) {
    const bias = biases ? biases[o] : 0;
    if (!means) { B[o] = bias; continue; }
    const g = (gammas ? gammas[o] : 1) / Math.sqrt(vars[o] + EPS);
    const m = means[o] - bias;
    for (let c = 0; c < ins; c++) W[o * ins + c] *= g;
    B[o] = -g * m + (betas ? betas[o] : 0);
  }
  return { w: W, b: B, outs, ins: ins / 9 };
}

// ---------- layers ----------
// 3x3 convolution, padding 1, on an 8x8 board. input: [cin][64], weights: [cout][cin][3][3]
function conv3(input, cin, w, b, cout, relu) {
  const out = new Float32Array(cout * SQ);
  for (let o = 0; o < cout; o++) {
    const acc = out.subarray(o * SQ, o * SQ + SQ);
    acc.fill(b ? b[o] : 0);
    for (let i = 0; i < cin; i++) {
      const inp = input.subarray(i * SQ, i * SQ + SQ);
      const k = (o * cin + i) * 9;
      for (let ky = 0; ky < 3; ky++) {
        const dy = ky - 1;
        for (let kx = 0; kx < 3; kx++) {
          const wv = w[k + ky * 3 + kx];
          if (wv === 0) continue;
          const dx = kx - 1;
          const y0 = Math.max(0, -dy), y1 = Math.min(8, 8 - dy);
          const x0 = Math.max(0, -dx), x1 = Math.min(8, 8 - dx);
          for (let y = y0; y < y1; y++) {
            const row = y * 8, srow = (y + dy) * 8 + dx;
            for (let x = x0; x < x1; x++) acc[row + x] += wv * inp[srow + x];
          }
        }
      }
    }
    if (relu) for (let s = 0; s < SQ; s++) if (acc[s] < 0) acc[s] = 0;
  }
  return out;
}

function fc(input, w, b, outs, relu) {
  const ins = input.length;
  const out = new Float32Array(outs);
  for (let o = 0; o < outs; o++) {
    let s = b ? b[o] : 0;
    const base = o * ins;
    for (let i = 0; i < ins; i++) s += w[base + i] * input[i];
    out[o] = relu && s < 0 ? 0 : s;
  }
  return out;
}

export function forward(net, planes) {
  const C = net.filters;
  let x = conv3(planes, 112, net.input.w, net.input.b, C, true);
  for (const blk of net.blocks) {
    const y1 = conv3(x, C, blk.conv1.w, blk.conv1.b, C, true);
    const y2 = conv3(y1, C, blk.conv2.w, blk.conv2.b, C, false);
    // squeeze-and-excitation
    const pool = new Float32Array(C);
    for (let c = 0; c < C; c++) { let s = 0; for (let q = 0; q < SQ; q++) s += y2[c * SQ + q]; pool[c] = s / SQ; }
    const h1 = fc(pool, blk.se.w1, blk.se.b1, blk.se.b1.length, true);
    const h2 = fc(h1, blk.se.w2, blk.se.b2, 2 * C, false);
    const nx = new Float32Array(C * SQ);
    for (let c = 0; c < C; c++) {
      const g = 1 / (1 + Math.exp(-h2[c]));
      const bt = h2[C + c];
      for (let q = 0; q < SQ; q++) {
        const v = g * y2[c * SQ + q] + bt + x[c * SQ + q];
        nx[c * SQ + q] = v > 0 ? v : 0;
      }
    }
    x = nx;
  }
  const p1 = conv3(x, C, net.policy1.w, net.policy1.b, C, true);
  const pOut = net.policy.b.length;
  return conv3(p1, C, net.policy.w, net.policy.b, pOut, false); // [80][64]
}

// ---------- input encoding (INPUT_CLASSICAL_112_PLANE) ----------
const PIECE_PLANE = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };
const START_BOARD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

function boardOf(fen) {
  const rows = fen.split(' ')[0].split('/');
  const cells = []; // [sq, color, type] with sq = rank*8+file (a1 = 0)
  rows.forEach((row, ri) => {
    const rank = 7 - ri;
    let file = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') { file += +ch; continue; }
      const color = ch === ch.toUpperCase() ? 'w' : 'b';
      cells.push([rank * 8 + file, color, ch.toLowerCase()]);
      file++;
    }
  });
  return cells;
}

const repKey = (fen) => fen.split(' ').slice(0, 3).join(' ');

// history: array of FENs from the game's first position to the current one (inclusive).
export function encode(history) {
  const planes = new Float32Array(112 * SQ);
  const cur = history[history.length - 1];
  const f = cur.split(' ');
  const us = f[1];
  const mirror = us === 'b';
  const castle = f[2];
  const set = (p) => planes.fill(1, p * SQ, p * SQ + SQ);
  if (castle.includes(us === 'w' ? 'Q' : 'q')) set(104);
  if (castle.includes(us === 'w' ? 'K' : 'k')) set(105);
  if (castle.includes(us === 'w' ? 'q' : 'Q')) set(106);
  if (castle.includes(us === 'w' ? 'k' : 'K')) set(107);
  if (mirror) set(108);
  planes.fill(+f[4] || 0, 109 * SQ, 110 * SQ);
  set(111);

  const seen = new Map();
  const reps = history.map((h) => { const k = repKey(h); const n = seen.get(k) || 0; seen.set(k, n + 1); return n; });
  for (let i = 0; i < 8; i++) {
    let idx = history.length - 1 - i;
    if (idx < 0) {
      // lc0 "fen_only" history fill: repeat the earliest position unless the game began at the start position
      if (history[0].split(' ')[0] === START_BOARD) break;
      idx = 0;
    }
    const fen = history[idx];
    const base = i * 13;
    for (const [sq, color, type] of boardOf(fen)) {
      const s = mirror ? (7 - (sq >> 3)) * 8 + (sq & 7) : sq;
      const plane = base + PIECE_PLANE[type] + (color === us ? 0 : 6);
      planes[plane * SQ + s] = 1;
    }
    if (reps[idx] >= 1 && history.length - 1 - i >= 0) set(base + 12);
  }
  return planes;
}

// ---------- policy decoding ----------
export function makeMoveIndex(tables) {
  const idx = new Map();
  tables.moves.forEach((m, i) => idx.set(m, i));
  return { idx, map: tables.convPolicyMap };
}

const flipSq = (s) => s[0] + (9 - +s[1]);

// Convert a legal move (uci, chess.js style castling e1g1) to lc0's NN move string from the mover's view.
export function nnMoveString(uci, fen) {
  const [board, side, castle] = fen.split(' ');
  let from = uci.slice(0, 2), to = uci.slice(2, 4);
  const promo = uci[4];
  // castling: king moves two files -> lc0 encodes as king takes own rook
  const kingFrom = side === 'w' ? 'e1' : 'e8';
  if (from === kingFrom && isKingAt(board, from, side) && (to[0] === 'g' || to[0] === 'c') && castle !== '-') {
    to = (to[0] === 'g' ? 'h' : 'a') + to[1];
  }
  if (side === 'b') { from = flipSq(from); to = flipSq(to); }
  return from + to + (promo && promo !== 'n' ? promo : '');
}

function isKingAt(board, sq, side) {
  const file = sq.charCodeAt(0) - 97, rank = +sq[1];
  const row = board.split('/')[8 - rank];
  let f = 0;
  for (const ch of row) {
    if (ch >= '1' && ch <= '8') { f += +ch; continue; }
    if (f === file) return ch === (side === 'w' ? 'K' : 'k');
    f++;
  }
  return false;
}

// Returns legal moves with probabilities, best first.
export function policyFor(net, mi, history, legalUcis) {
  const fen = history[history.length - 1];
  const out = forward(net, encode(history));
  const logits = new Float32Array(1858).fill(-Infinity);
  for (let i = 0; i < mi.map.length; i++) { const j = mi.map[i]; if (j >= 0) logits[j] = out[i]; }
  const res = legalUcis.map((u) => {
    const k = mi.idx.get(nnMoveString(u, fen));
    return { uci: u, logit: k == null ? -50 : logits[k] };
  });
  const mx = Math.max(...res.map((r) => r.logit));
  let sum = 0;
  for (const r of res) { r.p = Math.exp(r.logit - mx); sum += r.p; }
  for (const r of res) r.p /= sum;
  return res.sort((a, b) => b.p - a.p);
}
