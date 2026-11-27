// Puzzle solving screen: plays the setup move, checks the solver's moves, handles hints/solution,
// accepts any mating move at the final step (as Lichess does), and shows the result with rating change.
import { Chess } from 'chess.js';
import { h, clear, fmtTime } from '../../core/dom.js';
import { Board, localSan } from '../../core/board.js';
import { store } from '../../core/store.js';
import { LivePanel } from '../../core/livePanel.js';
import { recordResult } from './data.js';
import { themeName } from './themes.js';

const tr = () => store.settings.turkishNotation !== false;

export class PuzzleSolver {
  constructor(root, puzzle, { rated, onFinish, onNext, header, nextLabel = 'Sonraki bulmaca ▸' }) {
    this.root = root; this.p = puzzle; this.rated = rated;
    this.onFinish = onFinish; this.onNext = onNext; this.header = header; this.nextLabel = nextLabel;
    this.step = 0;           // index into puzzle.moves
    this.failed = false;
    this.done = false;
    this.timers = [];
    this.live = new LivePanel({ tag: 'puzzle-live' });
    // positions after each move, for browsing the solution once finished
    this.fens = [puzzle.fen];
    const c = new Chess(puzzle.fen);
    for (const u of puzzle.moves) { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); this.fens.push(c.fen()); }
    const solverColor = puzzle.firstAuto ? (puzzle.fen.split(' ')[1] === 'w' ? 'b' : 'w') : puzzle.fen.split(' ')[1];
    this.solver = solverColor;
  }

  mount() {
    this.boardHost = h('div.board-host');
    this.statusHost = h('div.pz-status');
    this.infoHost = h('div');
    this.solutionHost = h('div.pz-solution');
    this.btns = h('div.controls');
    clear(this.root).append(h('div.pz-layout',
      h('div.gtm-center', this.header || null, this.boardHost, this.btns),
      h('div.pz-side', this.statusHost, this.infoHost, this.solutionHost, window.api.web ? null : this.live.button, window.api.web ? null : this.live.el)));
    this.board = new Board(this.boardHost, { orientation: this.solver === 'w' ? 'white' : 'black', onMove: (m) => this.onUserMove(m), premove: true });
    this.board.setPosition(this.p.fen, { animate: false });
    this.start = Date.now();
    window.__currentPuzzle = this.p; // used by automated tests
    this.renderButtons();
    this.renderInfo();
    if (this.p.firstAuto) {
      this.status('wait', 'Rakip oynuyor…');
      this.later(() => this.playAuto(), 600);
    } else this.yourTurn();
  }

  later(fn, ms) { const t = setTimeout(() => { if (!this.destroyed) fn(); }, ms); this.timers.push(t); }

  status(kind, text, sub) {
    clear(this.statusHost).append(h('div.pz-box.' + kind, h('div.pz-title', text), sub ? h('div.pz-sub', sub) : null));
  }

  renderInfo() {
    const p = this.p;
    clear(this.infoHost).append(h('div.panel.pz-info',
      p.src === 'lichess'
        ? h('div', h('b', `Bulmaca #${p.id}`), h('span.muted', `  ·  zorluk ${this.done || !this.rated ? p.rating : '?'}`))
        : h('div', h('b', p.title || `Bulmaca ${p.id}`)),
      h('div.muted', `${this.solver === 'w' ? 'Beyaz' : 'Siyah'} oynar ve kazanır`),
      this.done && p.themes && p.themes.length ? h('div.pz-themes', p.themes.filter((t) => !['short', 'long', 'veryLong', 'oneMove', 'master', 'masterVsMaster', 'superGM'].includes(t)).map((t) => h('span.chip', themeName(t)))) : null,
      this.done && p.src === 'lichess' ? h('button.btn.small.ghost', { onclick: () => window.api.openExternal(`https://lichess.org/training/${p.id}`) }, "Lichess'te aç ↗") : null));
  }

  renderButtons() {
    const b = clear(this.btns);
    if (!this.done) {
      b.append(h('button.btn', { title: 'Hangi taşın oynayacağını gösterir. Bulmaca çözülmemiş sayılır.', onclick: () => this.hint() }, 'İpucu'));
      b.append(h('button.btn', { title: 'Bulmaca çözülmemiş sayılır.', onclick: () => this.showSolution() }, 'Çözümü göster'));
    } else {
      b.append(h('button.btn', { onclick: () => this.retry() }, 'Tekrar dene'));
      if (this.onNext) b.append(h('button.btn.primary', { onclick: () => this.onNext() }, this.nextLabel));
    }
  }

  playAuto() {
    const u = this.p.moves[this.step];
    this.board.setPosition(this.fens[this.step + 1], { lastMove: u });
    this.step++;
    if (this.step >= this.p.moves.length) return this.finish();
    this.yourTurn();
  }

  yourTurn() {
    this.board.setPosition(this.fens[this.step], { lastMove: this.step > 0 ? this.p.moves[this.step - 1] : undefined, interactive: true, animate: false });
    this.board.setArrows([]);
    if (!this.failed) this.status('turn', 'Sıra sizde', 'En iyi hamleyi bulun.');
    else this.status('turn', 'Tekrar deneyin', 'Bu bulmaca çözülmemiş sayılacak, ama doğru yolu bulabilirsiniz.');
  }

  onUserMove({ uci, fenAfter }) {
    if (this.done) return;
    const expected = this.p.moves[this.step];
    const isLast = this.step === this.p.moves.length - 1;
    const mates = new Chess(fenAfter).isCheckmate();
    if (uci === expected || (isLast && mates)) {
      this.step++;
      if (this.step >= this.p.moves.length) { this.board.setPosition(fenAfter, { lastMove: uci }); return this.finish(); }
      this.status('good', '✓ Doğru!', 'Devam edin…');
      this.later(() => this.playAuto(), 450);
    } else {
      this.failed = true;
      this.status('bad', '✗ Bu hamle değil', 'Tekrar deneyin.');
      this.board.setArrows([{ orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush: 'red' }]);
      this.later(() => this.yourTurn(), 700);
    }
  }

  hint() {
    if (this.done) return;
    this.failed = true;
    const u = this.p.moves[this.step];
    this.board.setArrows([{ orig: u.slice(0, 2), brush: 'green' }]);
    this.status('turn', 'İpucu', `${u.slice(0, 2)} karesindeki taşla oynayın.`);
  }

  showSolution() {
    if (this.done) return;
    this.failed = true;
    this.board.setInteractive(false);
    const run = () => {
      if (this.step >= this.p.moves.length) return this.finish();
      const u = this.p.moves[this.step];
      this.board.setPosition(this.fens[this.step + 1], { lastMove: u });
      this.step++;
      this.later(run, 700);
    };
    this.status('wait', 'Çözüm gösteriliyor…');
    run();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.board.setInteractive(false);
    const ms = Date.now() - this.start;
    const ok = !this.failed;
    const delta = this.onFinish ? this.onFinish({ ok, ms }) : recordResult(this.p, { ok, ms, rated: this.rated });
    window.dispatchEvent(new Event('ratings-changed'));
    const sign = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
    const sub = [this.rated && this.p.rating ? `Puan: ${store.profile.ratings.puzzles.r.toFixed(0)} (${sign(delta || 0)})` : null, `Süre: ${fmtTime(ms)}`].filter(Boolean).join('  ·  ');
    this.status(ok ? 'good' : 'bad', ok ? '✓ Bulmaca çözüldü!' : 'Bulmaca tamamlandı (hatalı)', sub);
    this.renderInfo();
    this.renderButtons();
    this.renderSolution();
    this.live.setPosition(this.fens[this.fens.length - 1]);
  }

  renderSolution() {
    const host = clear(this.solutionHost);
    const c = new Chess(this.p.fen);
    const items = this.p.moves.map((u, i) => {
      const fenBefore = c.fen();
      const mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      const num = fenBefore.split(' ')[1] === 'w' ? `${fenBefore.split(' ')[5]}. ` : (i === 0 ? `${fenBefore.split(' ')[5]}... ` : '');
      return h('span.mv.pz-mv', { onclick: () => { this.board.setPosition(this.fens[i + 1], { lastMove: u }); this.live.setPosition(this.fens[i + 1]); } },
        num ? h('span.mvnum', num) : null, localSan(mv.san, tr()));
    });
    host.append(h('div.panel', h('div.panel-title', 'Çözüm'), h('div.movelist.flat', items)));
  }

  retry() {
    // Replay for practice (does not change rating again)
    this.done = false; this.failed = false; this.step = 0;
    this.onFinish = () => 0; this.rated = false;
    clear(this.solutionHost);
    this.renderButtons(); this.renderInfo();
    this.board.setPosition(this.p.fen, { animate: false });
    if (this.p.firstAuto) this.later(() => this.playAuto(), 500); else this.yourTurn();
  }

  destroy() {
    this.destroyed = true;
    this.timers.forEach(clearTimeout);
    this.live.destroy();
    if (this.board) this.board.destroy();
  }
}
