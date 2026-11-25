// Per-game engine analysis for Guess the Move, cached to disk so reviews and replays are instant.
// For each ply where the user is to move we store:
//   top:    engine's top lines [{uci, cp}] (MultiPV)
//   master: {uci, cp}
//   extra:  { uci: cp } evals of other moves users tried
//   depth, rating (position difficulty)
import { Chess } from 'chess.js';
import { analyse, PRIORITY } from '../../core/engine.js';
import { store } from '../../core/store.js';
import { inBook } from '../../core/openings.js';
import { positionRating } from './scoring.js';

const MULTIPV = 4;

export class GameAnalysis {
  constructor(game, fens) {
    this.game = game;
    this.fens = fens;
    this.data = null;
    this.pending = new Map();
    this.tag = 'gtm-' + game.id;
    this.dirty = false;
  }

  async load() {
    this.data = (await store.loadAnalysis(this.game.id)) || { plies: {} };
    return this;
  }

  save() {
    if (!this.dirty) return;
    this.dirty = false;
    return store.saveAnalysis(this.game.id, this.data);
  }

  get depth() { return store.settings.depth || 18; }

  has(ply) { const p = this.data.plies[ply]; return !!(p && p.master); }

  // Make sure ply is analysed. priority: URGENT when the user is waiting.
  ensure(ply, priority = PRIORITY.NORMAL) {
    if (this.has(ply)) return Promise.resolve(this.data.plies[ply]);
    if (this.pending.has(ply)) return this.pending.get(ply);
    const p = this.run(ply, priority).finally(() => this.pending.delete(ply));
    this.pending.set(ply, p);
    return p;
  }

  async run(ply, priority) {
    const fen = this.fens[ply];
    const master = this.game.ucis[ply];
    const depth = this.depth;
    const chess = new Chess(fen);
    const legal = chess.moves({ verbose: true });
    const res = await analyse({ fen, depth, multipv: Math.min(MULTIPV, legal.length), movetime: 20000, tag: this.tag }, priority);
    const top = res.lines.map((l) => ({ uci: l.uci, cp: l.cp, pv: l.pv.slice(0, 8) }));
    let masterLine = top.find((l) => l.uci === master);
    if (!masterLine) {
      const r2 = await analyse({ fen, depth, multipv: 1, searchmoves: [master], movetime: 20000, tag: this.tag }, priority);
      const l = r2.lines[0];
      masterLine = { uci: master, cp: l ? l.cp : 0, pv: l ? l.pv.slice(0, 8) : [master] };
    }
    const lastUci = ply > 0 ? this.game.ucis[ply - 1] : null;
    const mv = legal.find((m) => m.from + m.to + (m.promotion || '') === master);
    const isRecapture = !!(mv && lastUci && mv.captured && mv.to === lastUci.slice(2, 4) && new Chess(this.fens[ply - 1]).get(lastUci.slice(2, 4)));
    const rating = positionRating({
      top, masterCp: masterLine.cp, masterUci: master, legalCount: legal.length, isRecapture,
      isBook: inBook(this.fens[ply + 1]),
    });
    const entry = { depth: res.lines[0] ? res.lines[0].depth : depth, top, master: masterLine, extra: {}, rating };
    const prev = this.data.plies[ply];
    if (prev && prev.extra) entry.extra = prev.extra;
    this.data.plies[ply] = entry;
    this.dirty = true;
    return entry;
  }

  // Eval of an arbitrary move in a user ply (cp from mover's POV) + its PV.
  async evalMove(ply, uci, priority = PRIORITY.URGENT) {
    const entry = await this.ensure(ply, priority);
    const t = entry.top.find((l) => l.uci === uci);
    if (t) return { cp: t.cp, pv: t.pv };
    if (entry.master.uci === uci) return { cp: entry.master.cp, pv: entry.master.pv };
    if (entry.extra[uci]) return entry.extra[uci];
    const r = await analyse({ fen: this.fens[ply], depth: entry.depth || this.depth, multipv: 1, searchmoves: [uci], movetime: 20000, tag: this.tag }, priority);
    const l = r.lines[0];
    const out = { cp: l ? l.cp : 0, pv: l ? l.pv.slice(0, 8) : [uci] };
    entry.extra[uci] = out;
    this.dirty = true;
    return out;
  }

  // Queue background analysis of upcoming user plies.
  lookahead(fromPly, userPlies, count = 4) {
    const next = userPlies.filter((p) => p >= fromPly && !this.has(p)).slice(0, count);
    next.forEach((p, i) => this.ensure(p, i === 0 ? PRIORITY.NORMAL : PRIORITY.BACKGROUND).catch(() => {}));
  }
}
