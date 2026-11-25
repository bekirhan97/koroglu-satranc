// Live engine analysis panel (MultiPV lines in SAN). Shared by review, puzzles and play modules.
import { Chess } from 'chess.js';
import { h, clear, fmtEval } from './dom.js';
import { analyseStream, cancel, PRIORITY } from './engine.js';
import { localSan } from './board.js';
import { store } from './store.js';

let seq = 0;

export class LivePanel {
  constructor({ tag = 'live-' + (++seq), lines = 3, depth = 24 } = {}) {
    this.tag = tag; this.lines = lines; this.depth = depth;
    this.on = false; this.runId = 0; this.fen = null;
    this.el = h('div.live-host');
    this.button = h('button.btn.small', { onclick: () => this.toggle() }, 'Motor: Kapalı');
  }

  toggle(force) {
    this.on = force == null ? !this.on : force;
    this.button.textContent = this.on ? 'Motor: Açık' : 'Motor: Kapalı';
    if (this.on && this.fen) this.run(); else if (!this.on) { cancel(this.tag); clear(this.el); }
  }

  setPosition(fen) {
    this.fen = fen;
    if (this.on) this.run();
  }

  run() {
    cancel(this.tag);
    const id = ++this.runId;
    const fen = this.fen;
    const mover = fen.split(' ')[1];
    const host = clear(this.el);
    if (new Chess(fen).isGameOver()) { host.append(h('div.live-box', 'Oyun bitti.')); return; }
    host.append(h('div.live-box', h('div.muted', 'Analiz ediliyor…')));
    const tr = store.settings.turkishNotation !== false;
    analyseStream({ fen, depth: this.depth, multipv: this.lines, tag: this.tag, movetime: 15000 }, PRIORITY.URGENT, (lines) => {
      if (id !== this.runId || !this.on) return;
      clear(host).append(h('div.live-box', lines.map((l) => {
        const c = new Chess(fen);
        const sans = [];
        for (const u of l.pv.slice(0, 8)) {
          try { sans.push(localSan(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san, tr)); } catch { break; }
        }
        const white = mover === 'w' ? l.cp : -l.cp;
        return h('div.live-line', h('b', fmtEval(white)), h('span.muted', ` d${l.depth} `), sans.join(' '));
      })));
    });
  }

  destroy() { this.on = false; cancel(this.tag); }
}
