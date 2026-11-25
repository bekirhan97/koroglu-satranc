// Shared chessboard component (chessground + chess.js legality). Used by every module.
import { Chessground } from 'chessground';
import { Chess } from 'chess.js';
import { h } from './dom.js';

const PROMO = ['q', 'r', 'b', 'n'];
const PIECE_NAME = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };

export function legalDests(fen) {
  const dests = new Map();
  const c = new Chess(fen);
  for (const m of c.moves({ verbose: true })) {
    if (!dests.has(m.from)) dests.set(m.from, []);
    dests.get(m.from).push(m.to);
  }
  return dests;
}

export class Board {
  constructor(container, { orientation = 'white', onMove } = {}) {
    this.wrap = h('div.board-wrap');
    this.el = h('div.cg-board-host');
    this.wrap.append(this.el);
    container.append(this.wrap);
    this.onMove = onMove;
    this.fen = new Chess().fen();
    this.cg = Chessground(this.el, {
      orientation,
      coordinates: true,
      animation: { enabled: true, duration: 180 },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      draggable: { enabled: true, showGhost: true },
      drawable: { enabled: true, visible: true },
      movable: { free: false, color: undefined, showDests: true, events: { after: (o, d) => this.handleUserMove(o, d) } },
    });
  }

  setPosition(fen, { lastMove, interactive = false, animate = true } = {}) {
    this.fen = fen;
    const c = new Chess(fen);
    const turn = c.turn() === 'w' ? 'white' : 'black';
    this.cg.set({
      fen,
      turnColor: turn,
      lastMove: lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : undefined,
      check: c.inCheck() ? turn : false,
      animation: { enabled: animate },
      movable: { color: interactive ? turn : undefined, dests: interactive ? legalDests(fen) : new Map() },
    });
  }

  setInteractive(on) {
    const turn = this.fen.split(' ')[1] === 'w' ? 'white' : 'black';
    this.cg.set({ movable: { color: on ? turn : undefined, dests: on ? legalDests(this.fen) : new Map() } });
  }

  setOrientation(o) { this.cg.set({ orientation: o }); }
  // Recompute square positions after the layout around the board changed.
  refresh() { this.cg.redrawAll(); }
  flip() { this.cg.toggleOrientation(); }
  setArrows(shapes) { this.cg.setAutoShapes(shapes || []); }

  // Show a move on the board without changing interactivity (e.g. the user's guess).
  showMove(fenBefore, uci) {
    const c = new Chess(fenBefore);
    c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
    this.setPosition(c.fen(), { lastMove: uci });
    return c.fen();
  }

  async handleUserMove(orig, dest) {
    const c = new Chess(this.fen);
    const piece = c.get(orig);
    let promotion;
    if (piece && piece.type === 'p' && (dest[1] === '8' || dest[1] === '1')) {
      promotion = await this.askPromotion(piece.color);
      if (!promotion) { this.setPosition(this.fen, { interactive: true, animate: false }); return; }
    }
    const before = this.fen;
    const mv = c.move({ from: orig, to: dest, promotion });
    this.fen = c.fen();
    this.cg.set({ movable: { color: undefined, dests: new Map() } });
    if (promotion) this.setPosition(this.fen, { lastMove: orig + dest });
    if (this.onMove) this.onMove({ uci: orig + dest + (promotion || ''), san: mv.san, fenBefore: before, fenAfter: this.fen });
  }

  askPromotion(color) {
    return new Promise((resolve) => {
      const pick = (p) => { box.remove(); resolve(p); };
      const box = h('div.promo-overlay', { onclick: (e) => { if (e.target === box) pick(null); } },
        h('div.promo-box.cg-wrap', PROMO.map((p) =>
          h('button.promo-btn', { onclick: () => pick(p) }, h('piece.' + (color === 'w' ? 'white' : 'black') + '.' + PIECE_NAME[p])))));
      this.wrap.append(box);
    });
  }

  destroy() { this.cg.destroy(); this.wrap.remove(); }
}

// Turkish figurine letters: Ş (şah), V (vezir), K (kale), F (fil), A (at)
const TR = { K: 'Ş', Q: 'V', R: 'K', B: 'F', N: 'A' };
export function localSan(san, turkish = true) {
  if (!san || !turkish) return san;
  return san.replace(/[KQRBN]/g, (ch) => TR[ch]);
}
