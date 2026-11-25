// Opening repertoires: storage, lines, and spaced repetition (Chessable-like ladder).
import { packTree, unpackTree, pathKey, countNodes } from '../../core/pgntree.js';

const api = window.api;
const H = 3600 * 1000, D = 24 * H;
// level -> interval until the next review
export const INTERVALS = [0, 4 * H, 1 * D, 3 * D, 7 * D, 14 * D, 30 * D, 90 * D, 180 * D];
export const LEVEL_NAMES = ['Yeni', '4 saat', '1 gün', '3 gün', '1 hafta', '2 hafta', '1 ay', '3 ay', '6 ay'];

export const odata = {
  reps: [],               // [{ id, name, color, addedAt, lines, cards }]
  trees: new Map(),       // id -> [root nodes]
  srs: new Map(),         // id -> { key: { lv, due, reps, lapses, last } }
  async load() { this.reps = await api.read('openings/index', []); },
  saveIndex() { return api.write('openings/index', this.reps); },
  async tree(id) {
    if (!this.trees.has(id)) {
      const t = await api.read('openings/tree-' + id, { roots: [] });
      this.trees.set(id, t.roots.map((r) => unpackTree(r.packed, r.fen)));
    }
    return this.trees.get(id);
  },
  async srsOf(id) {
    if (!this.srs.has(id)) this.srs.set(id, await api.read('openings/srs-' + id, {}));
    return this.srs.get(id);
  },
  saveSrs(id) { return api.write('openings/srs-' + id, this.srs.get(id) || {}); },
  async add({ name, color, roots }) {
    const id = Date.now().toString(36);
    await api.write('openings/tree-' + id, { roots: roots.map((r) => ({ fen: r.fen, packed: packTree(r) })) });
    this.trees.set(id, roots);
    this.srs.set(id, {});
    const st = treeStats(roots, color);
    this.reps.push({ id, name, color, addedAt: Date.now(), lines: st.lines, cards: st.cards, nodes: st.nodes });
    await this.saveIndex();
    return id;
  },
  async remove(id) {
    this.reps = this.reps.filter((r) => r.id !== id);
    this.trees.delete(id); this.srs.delete(id);
    await this.saveIndex();
    await api.remove('openings/tree-' + id); await api.remove('openings/srs-' + id);
  },
};

const sideToMove = (fen) => fen.split(' ')[1];

// Leaf-to-root paths, in PGN (depth-first, mainline first) order. Each line = [moveNode, ...]
export function linesOf(roots) {
  const out = [];
  const walk = (n, path) => {
    if (!n.children.length) { if (path.length) out.push(path); return; }
    for (const c of n.children) walk(c, [...path, c]);
  };
  for (const r of roots) walk(r, []);
  return out;
}

// A "card" is a position where the repertoire side must move: the parent of a user's move node.
export function isUserMove(node, color) { return node.parent && sideToMove(node.parent.fen) === color; }
export const cardKey = (moveNode) => pathKey(moveNode.parent) || 'root';

export function treeStats(roots, color) {
  const lines = linesOf(roots);
  const cards = new Set();
  for (const l of lines) for (const n of l) if (isUserMove(n, color)) cards.add(cardKey(n));
  return { lines: lines.length, cards: cards.size, nodes: roots.reduce((a, r) => a + countNodes(r) - 1, 0) };
}

export function lineCards(line, color) { return line.filter((n) => isUserMove(n, color)); }

export function repSummary(rep, roots, srs, now = Date.now()) {
  const keys = new Set();
  for (const l of linesOf(roots)) for (const n of lineCards(l, rep.color)) keys.add(cardKey(n));
  let learned = 0, due = 0;
  for (const k of keys) { const s = srs[k]; if (s) { learned++; if (s.due <= now) due++; } }
  return { total: keys.size, learned, due, fresh: keys.size - learned };
}

// Choose lines for a session.
export function pickLines(mode, rep, roots, srs, { limit = 10 } = {}) {
  const now = Date.now();
  const lines = linesOf(roots);
  if (mode === 'learn') {
    const l = lines.find((ln) => lineCards(ln, rep.color).some((n) => !srs[cardKey(n)]));
    return l ? [l] : [];
  }
  if (mode === 'review') {
    const covered = new Set();
    const picked = [];
    for (const ln of lines) {
      const dueCards = lineCards(ln, rep.color).filter((n) => { const s = srs[cardKey(n)]; return s && s.due <= now && !covered.has(cardKey(n)); });
      if (!dueCards.length) continue;
      dueCards.forEach((n) => covered.add(cardKey(n)));
      picked.push(ln);
      if (picked.length >= limit) break;
    }
    return picked;
  }
  // practice: random learned lines
  const learned = lines.filter((ln) => lineCards(ln, rep.color).every((n) => srs[cardKey(n)]));
  const pool = learned.length ? learned : lines;
  return Array.from({ length: Math.min(limit, pool.length) }, () => pool[Math.floor(Math.random() * pool.length)]);
}

export function grade(srs, key, correct) {
  const now = Date.now();
  const s = srs[key] || { lv: 0, reps: 0, lapses: 0 };
  s.reps++;
  if (correct) s.lv = Math.min(INTERVALS.length - 1, s.lv + 1);
  else { s.lv = 1; s.lapses++; }
  s.due = now + INTERVALS[s.lv];
  s.last = now;
  srs[key] = s;
  return s;
}

// Guess which side a repertoire is for: the repertoire side usually has fewer alternatives per position.
export function guessColor(roots) {
  const acc = { w: [0, 0], b: [0, 0] };
  const walk = (n) => { if (n.children.length) { const c = sideToMove(n.fen); acc[c][0] += n.children.length; acc[c][1]++; } n.children.forEach(walk); };
  roots.forEach(walk);
  const avg = (x) => (x[1] ? x[0] / x[1] : 1);
  return avg(acc.w) <= avg(acc.b) ? 'w' : 'b';
}
