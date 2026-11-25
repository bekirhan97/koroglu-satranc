// Review of a finished (or in-progress) attempt: per-move master/played/engine lines, PGN comments,
// arrows on the board, and an optional live engine panel.
import { h, clear, fmtEval } from '../../core/dom.js';
import { Board } from '../../core/board.js';
import { store } from '../../core/store.js';
import { gameFens, sideToMove, moveNumberLabel, uciToSan } from '../../core/pgn.js';
import { LivePanel } from '../../core/livePanel.js';
import { GameAnalysis } from './analysis.js';
import { scoreClass } from './scoring.js';
import { statsPanel, feedbackBox, playerBar, san, whiteCp, gameTitle } from './widgets.js';
import { Chess } from 'chess.js';

export class ReviewView {
  constructor(root, game, att, { onExit, onPlayUnrated }) {
    this.root = root; this.game = game; this.att = att;
    this.onExit = onExit; this.onPlayUnrated = onPlayUnrated;
    this.fens = gameFens(game);
    this.n = game.ucis.length;
    this.user = game.userColor;
    this.idx = 0; // position index: fens[idx]
    this.live = new LivePanel({ tag: 'review-live' });
  }

  async mount() {
    this.analysis = await new GameAnalysis(this.game, this.fens).load();
    const firstScored = Object.keys(this.att.moves).map(Number).sort((a, b) => a - b)[0];
    this.idx = firstScored != null ? firstScored : 0;
    this.render();
    this.keyHandler = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') this.go(this.idx - 1);
      else if (e.key === 'ArrowRight') this.go(this.idx + 1);
      else if (e.key === 'Home') this.go(0);
      else if (e.key === 'End') this.go(this.n);
    };
    window.addEventListener('keydown', this.keyHandler);
    this.go(this.idx);
  }

  render() {
    const g = this.game;
    const userIsWhite = this.user === 'w';
    this.boardHost = h('div.board-host');
    this.feedbackHost = h('div.feedback-host');
    this.listHost = h('div.review-list');
    this.liveHost = this.live.el;
    const nav = h('div.nav-row',
      h('button.icon-btn', { title: 'Başa', onclick: () => this.go(0) }, '⏮'),
      h('button.icon-btn', { title: 'Geri', onclick: () => this.go(this.idx - 1) }, '◀'),
      h('button.icon-btn', { title: 'İleri', onclick: () => this.go(this.idx + 1) }, '▶'),
      h('button.icon-btn', { title: 'Sona', onclick: () => this.go(this.n) }, '⏭'),
      h('button.icon-btn', { title: 'Önceki tahminim', onclick: () => this.jumpScored(-1) }, '⇠'),
      h('button.icon-btn', { title: 'Sonraki tahminim', onclick: () => this.jumpScored(1) }, '⇢'),
      this.live.button);

    const layout = h('div.gtm-layout',
      h('div.gtm-left',
        h('div.gtm-meta', h('span.badge', 'İnceleme'),
          h('button.icon-btn', { title: 'Tahtayı çevir', onclick: () => this.board.flip() }, '⇅')),
        h('div.game-source', gameTitle(g), g.headers.Event ? h('div.muted', g.headers.Event) : null),
        statsPanel(this.att, { title: 'Skor (İnceleme)' }),
        h('div.legend',
          h('div', h('span.dot.green'), 'Usta hamlesi'),
          h('div', h('span.dot.blue'), 'Sizin hamleniz'),
          h('div', h('span.dot.yellow'), 'Motorun en iyi hamlesi'))),
      h('div.gtm-center',
        playerBar(g, userIsWhite ? 'b' : 'w'),
        this.boardHost,
        playerBar(g, userIsWhite ? 'w' : 'b'),
        h('div.controls',
          h('button.btn', { onclick: () => { this.destroy(); this.onPlayUnrated(); } }, 'Puansız Tekrar Oyna'),
          h('button.btn.ghost', { onclick: () => { this.destroy(); this.onExit(); } }, 'Oyun Listesi'))),
      h('div.gtm-right', this.feedbackHost, nav, this.liveHost, this.listHost));
    clear(this.root).append(layout);
    this.board = new Board(this.boardHost, { orientation: userIsWhite ? 'white' : 'black' });
    this.renderList();
  }

  renderList() {
    const host = clear(this.listHost);
    const color = this.user;
    if (this.game.comments[0]) host.append(h('div.comment', this.game.comments[0]));
    for (let p = 0; p < this.n; p++) {
      const fen = this.fens[p];
      const mover = sideToMove(fen);
      const m = this.att.moves[p];
      const head = h('div.rv-move' + (m ? '.' + scoreClass(m.score) : '') + (this.idx === p ? '.current' : ''),
        { 'data-ply': p, onclick: () => this.go(p) },
        h('span.mvnum', moveNumberLabel(fen) + ' '), h('b', san(this.game.sans[p])),
        m ? h('span.score-chip.' + scoreClass(m.score), m.score.toFixed(1)) : null,
        this.att.skipped.includes(p) ? h('span.muted', ' (atlandı)') : null);
      host.append(head);
      if (m && mover === color) {
        const e = this.analysis.data.plies[p];
        const rows = [];
        const add = (who, uci, cp, depth) => {
          const ex = rows.find((r) => r.uci === uci);
          if (ex) { ex.who.push(who); return; }
          rows.push({ who: [who], uci, cp, depth });
        };
        add('USTA', m.masterUci, m.masterCp, m.depth);
        add('SİZ', m.uci, m.cp, m.depth);
        add('MOTOR', m.bestUci, m.bestCp, m.depth);
        host.append(h('div.rv-lines', rows.map((r) =>
          h('div.rv-line.' + (r.who.includes('SİZ') ? 'played' : r.who.includes('USTA') ? 'master' : 'engine'),
            { onclick: (ev) => { ev.stopPropagation(); this.go(p); this.preview(p, r.uci); } },
            `${r.who.join('/')}: ${fmtEval(whiteCp(r.cp, color))} `, h('span.muted', `(derinlik ${r.depth || (e && e.depth) || '?'})`), ' ',
            h('b', san(uciToSan(fen, r.uci)))))));
      }
      const vars = this.game.variations && this.game.variations[p];
      if (vars) host.append(h('div.rv-vars', vars.map((v) => h('div.rv-var', { title: 'Tahtada göster', onclick: (ev) => { ev.stopPropagation(); this.go(p); this.showLine(p, v.ucis); } },
        h('span.rv-var-tag', 'Varyant'), ' ', v.label, v.comment ? h('span.comment', ' ' + v.comment) : null))));
      if (this.game.comments[p + 1]) host.append(h('div.comment', this.game.comments[p + 1]));
    }
  }

  jumpScored(dir) {
    const plies = Object.keys(this.att.moves).map(Number).sort((a, b) => a - b);
    const target = dir > 0 ? plies.find((p) => p > this.idx) : plies.reverse().find((p) => p < this.idx);
    if (target != null) this.go(target);
  }

  // Play a variation from the position before move p and show where it ends.
  showLine(p, ucis) {
    const c = new Chess(this.fens[p]);
    let last = null;
    for (const u of ucis) { try { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }); last = u; } catch { break; } }
    this.board.setPosition(c.fen(), { lastMove: last });
    this.board.setArrows([]);
  }

  // Show what a candidate move leads to (one move ahead) with its arrow.
  preview(p, uci) {
    const c = new Chess(this.fens[p]);
    c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
    this.board.setPosition(c.fen(), { lastMove: uci });
    this.board.setArrows([]);
  }

  go(i) {
    i = Math.max(0, Math.min(this.n, i));
    this.idx = i;
    const fen = this.fens[i];
    this.board.setPosition(fen, { lastMove: i > 0 ? this.game.ucis[i - 1] : undefined, animate: true });
    const m = this.att.moves[i];
    const shapes = [];
    clear(this.feedbackHost);
    if (m) {
      const arrow = (uci, brush) => ({ orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush });
      if (m.bestUci !== m.masterUci && m.bestUci !== m.uci) shapes.push(arrow(m.bestUci, 'yellow'));
      if (m.uci !== m.masterUci) shapes.push(arrow(m.uci, 'blue'));
      shapes.push(arrow(m.masterUci, 'green'));
      this.feedbackHost.append(feedbackBox({ move: m, entry: this.analysis.data.plies[i], fen, color: this.user }));
    } else {
      this.feedbackHost.append(h('div.feedback.info', h('div.fb-head', i >= this.n ? 'Oyun sonu' : sideToMove(fen) === this.user ? 'Bu hamle puanlanmadı' : 'Rakip hamlesi'),
        h('div.fb-body', i < this.n ? `Oynanan: ${san(this.game.sans[i])}` : `Sonuç: ${this.game.headers.Result}`)));
    }
    this.board.setArrows(shapes);
    this.listHost.querySelectorAll('.rv-move.current').forEach((e) => e.classList.remove('current'));
    const cur = this.listHost.querySelector(`.rv-move[data-ply="${i}"]`);
    if (cur) { cur.classList.add('current'); cur.scrollIntoView({ block: 'nearest' }); }
    this.live.setPosition(fen);
  }

  destroy() {
    this.live.destroy();
    window.removeEventListener('keydown', this.keyHandler);
    if (this.board) this.board.destroy();
  }
}
