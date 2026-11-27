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

// Same position (pieces, side to move, castling rights); move counters and en passant ignored.
const posKey = (fen) => fen.split(' ').slice(0, 3).join(' ');
// Is `fen` the position reached by one legal move from `base` (i.e. the opponent's reply)?
function followsFrom(base, fen) {
  try {
    const k = posKey(fen);
    return new Chess(base).moves({ verbose: true }).some((m) => posKey(m.after) === k);
  } catch { return false; }
}

export class Board {
  // premove: true lets the player queue a move while the opponent is to move (puzzles, games).
  // The queued move is played as soon as the opponent's reply arrives and the board becomes
  // interactive again; it is dropped if the position jumps somewhere else (wrong move, next puzzle).
  constructor(container, { orientation = 'white', onMove, premove = false } = {}) {
    this.wrap = h('div.board-wrap');
    this.el = h('div.cg-board-host');
    this.wrap.append(this.el);
    container.append(this.wrap);
    this.onMove = onMove;
    this.fen = new Chess().fen();
    this.premove = premove;
    this.waitFen = null; // position in which the player is waiting for the opponent (premove base)
    this.cg = Chessground(this.el, {
      orientation,
      coordinates: true,
      animation: { enabled: true, duration: 180 },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: premove, showDests: true, castle: true },
      draggable: { enabled: true, showGhost: true },
      drawable: { enabled: true, visible: true },
      movable: { free: false, color: undefined, showDests: true, events: { after: (o, d) => this.handleUserMove(o, d) } },
    });
  }

  // premove: true (with interactive false) = the opponent is to move and the player may queue a move.
  setPosition(fen, { lastMove, interactive = false, animate = true, premove = false } = {}) {
    this.fen = fen;
    const c = new Chess(fen);
    const turn = c.turn() === 'w' ? 'white' : 'black';
    const waiting = this.premove && premove && !interactive;
    const keep = this.keepPremove(fen);
    this.cg.set({
      fen,
      turnColor: turn,
      lastMove: lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : undefined,
      check: c.inCheck() ? turn : false,
      animation: { enabled: animate },
      movable: {
        color: interactive ? turn : waiting ? (turn === 'white' ? 'black' : 'white') : undefined,
        dests: interactive ? legalDests(fen) : new Map(),
      },
    });
    if (!keep) { this.cg.cancelPremove(); this.waitFen = waiting ? fen : null; }
    else if (waiting && posKey(fen) === posKey(this.waitFen)) this.waitFen = fen;
    if (interactive) this.playPremove();
  }

  setInteractive(on) {
    const turn = this.fen.split(' ')[1] === 'w' ? 'white' : 'black';
    if (!on) { this.cg.cancelPremove(); this.waitFen = null; }
    this.cg.set({ movable: { color: on ? turn : undefined, dests: on ? legalDests(this.fen) : new Map() } });
    if (on) this.playPremove();
  }

  // A queued premove survives only while the board shows the waiting position or the opponent's reply to it.
  keepPremove(fen) {
    if (!this.premove || !this.waitFen || !this.cg.state.premovable.current) return false;
    return posKey(fen) === posKey(this.waitFen) || followsFrom(this.waitFen, fen);
  }

  playPremove() {
    if (!this.cg.state.premovable.current) { this.waitFen = null; return; }
    if (!this.waitFen || posKey(this.fen) === posKey(this.waitFen) || !followsFrom(this.waitFen, this.fen)) return;
    this.waitFen = null;
    // an illegal premove (e.g. the piece was captured) is simply dropped by chessground
    this.cg.playPremove();
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
    if (this.premove) {
      // keep the player's colour so a move can be queued while the opponent answers
      this.cg.set({ movable: { color: piece.color === 'w' ? 'white' : 'black', dests: new Map() } });
      this.waitFen = this.fen;
    } else this.cg.set({ movable: { color: undefined, dests: new Map() } });
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
