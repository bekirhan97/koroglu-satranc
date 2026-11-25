// Guess-the-Move play screen.
import { h, clear, modal, fmtTime, fmtEval, toast } from '../../core/dom.js';
import { Board } from '../../core/board.js';
import { store } from '../../core/store.js';
import { gameFens, sideToMove, moveNumberLabel } from '../../core/pgn.js';
import { inBook } from '../../core/openings.js';
import { PRIORITY, cancel } from '../../core/engine.js';
import { GameAnalysis } from './analysis.js';
import { scoreMove, scoreClass } from './scoring.js';
import { newAttempt, activeAttempt, rateMove, attemptStats } from './session.js';
import { updateDifficulty } from './list.js';
import { statsPanel, feedbackBox, playerBar, san, whiteCp, gameTitle } from './widgets.js';

export class PlayView {
  constructor(root, game, { rated, onExit, onReview }) {
    this.root = root;
    this.game = game;
    this.onExit = onExit;
    this.onReview = onReview;
    this.fens = gameFens(game);
    this.n = game.ucis.length;
    this.user = game.userColor;
    this.userPlies = [];
    for (let p = 0; p < this.n; p++) if (sideToMove(this.fens[p]) === this.user) this.userPlies.push(p);
    this.att = activeAttempt(game.id) || newAttempt(game, rated);
    this.ply = this.att.lastPly || 0;
    this.state = 'idle';
    this.timers = [];
    this.destroyed = false;
  }

  async mount() {
    this.analysis = await new GameAnalysis(this.game, this.fens).load();
    this.render();
    this.tick = setInterval(() => this.updateClock(), 500);
    this.keyHandler = (e) => { if (e.key === 'Enter' && this.state === 'waitNext') this.next(); };
    window.addEventListener('keydown', this.keyHandler);
    this.analysis.lookahead(this.ply, this.userPlies, 4);
    this.advance();
  }

  render() {
    const g = this.game;
    const userIsWhite = this.user === 'w';
    this.boardHost = h('div.board-host');
    this.clockEl = h('span.clock', '00:00');
    this.counterEl = h('span.counter', '');
    this.statsHost = h('div');
    this.feedbackHost = h('div.feedback-host');
    this.movesHost = h('div.movelist');
    this.controls = h('div.controls');
    this.statusEl = h('div.status-line');

    const layout = h('div.gtm-layout',
      h('div.gtm-left',
        h('div.gtm-meta', this.clockEl, this.counterEl,
          h('button.icon-btn', { title: 'Tahtayı çevir', onclick: () => this.board.flip() }, '⇅')),
        h('div.game-source', gameTitle(g), g.headers.Event ? h('div.muted', g.headers.Event) : null),
        this.statsHost),
      h('div.gtm-center',
        playerBar(g, userIsWhite ? 'b' : 'w'),
        this.boardHost,
        playerBar(g, userIsWhite ? 'w' : 'b'),
        this.statusEl,
        this.controls),
      h('div.gtm-right', this.feedbackHost, h('div.panel-title', 'Hamleler'), this.movesHost));
    clear(this.root).append(layout);

    this.board = new Board(this.boardHost, { orientation: userIsWhite ? 'white' : 'black', onMove: (m) => this.onUserMove(m) });
    this.board.setPosition(this.fens[this.ply], { lastMove: this.ply > 0 ? g.ucis[this.ply - 1] : undefined, animate: false });
    this.refreshPanels();
  }

  refreshPanels() {
    clear(this.statsHost).append(statsPanel(this.att, { title: this.att.rated ? 'Skor (Puanlı)' : 'Skor (Puansız)' }));
    const done = Object.keys(this.att.moves).length;
    this.counterEl.textContent = `${Math.min(this.userPlies.filter((p) => p < this.ply).length + 1, this.userPlies.length)}/${this.userPlies.length}`;
    this.renderMoves();
    this.renderControls();
    if (!done && !this.feedbackHost.firstChild) {
      this.feedbackHost.append(h('div.feedback.info', h('div.fb-head', 'Ustanın hamlesini tahmin edin'),
        h('div.fb-body', `${this.user === 'w' ? 'Beyaz' : 'Siyah'} taraftasınız. Her hamleniz ustanın hamlesiyle ve motor değerlendirmesiyle karşılaştırılıp 0–12 arası puanlanır.`)));
    }
  }

  renderMoves() {
    const host = clear(this.movesHost);
    for (let p = 0; p < this.ply && p < this.n; p++) {
      const label = sideToMove(this.fens[p]) === 'w' || p === 0 ? moveNumberLabel(this.fens[p]) : '';
      const m = this.att.moves[p];
      host.append(h('span.mv' + (m ? '.' + scoreClass(m.score) : ''), { title: m ? `Skor ${m.score}` : '' },
        label ? h('span.mvnum', label + ' ') : null, san(this.game.sans[p]), m ? h('sup', m.score.toFixed(1)) : null));
    }
    host.scrollTop = host.scrollHeight;
  }

  renderControls() {
    const c = clear(this.controls);
    const canSkip = this.state === 'guess' && inBook(this.fens[this.ply + 1]) && this.ply < 30;
    if (canSkip) c.append(h('button.btn', { onclick: () => this.skipOpening() }, 'Açılışı Atla'));
    if (this.state === 'waitNext') c.append(h('button.btn.primary', { onclick: () => this.next() }, 'Devam ▸ (Enter)'));
    c.append(h('button.btn.ghost', { onclick: () => this.exit() }, 'Oyun Listesi'));
  }

  updateClock() {
    if (this.state === 'guess' && this.guessStart) this.clockEl.textContent = fmtTime(Date.now() - this.guessStart);
  }

  setStatus(text) { this.statusEl.textContent = text || ''; }

  later(fn, ms) { const t = setTimeout(() => { if (!this.destroyed) fn(); }, ms); this.timers.push(t); }

  advance() {
    if (this.destroyed) return;
    if (this.ply >= this.n) return this.finish();
    if (sideToMove(this.fens[this.ply]) !== this.user) {
      this.state = 'opponent';
      this.board.setInteractive(false);
      this.renderControls();
      this.later(() => {
        this.board.setPosition(this.fens[this.ply + 1], { lastMove: this.game.ucis[this.ply] });
        this.ply++;
        this.saveProgress();
        this.refreshPanels();
        this.advance();
      }, store.settings.opponentDelay);
      return;
    }
    this.state = 'guess';
    this.guessStart = Date.now();
    this.board.setPosition(this.fens[this.ply], { lastMove: this.ply > 0 ? this.game.ucis[this.ply - 1] : undefined, interactive: true, animate: false });
    this.board.setArrows([]);
    this.setStatus('Sıra sizde – ustanın hamlesini bulun.');
    this.analysis.lookahead(this.ply, this.userPlies, 4);
    this.refreshPanels();
  }

  async onUserMove({ uci, san: moveSan, fenAfter }) {
    if (this.state !== 'guess') return;
    const ply = this.ply;
    this.state = 'scoring';
    const timeMs = Date.now() - this.guessStart;
    this.renderControls();
    this.setStatus('Değerlendiriliyor…');
    let entry, played;
    try {
      entry = await this.analysis.ensure(ply, PRIORITY.URGENT);
      played = await this.analysis.evalMove(ply, uci, PRIORITY.URGENT);
    } catch (e) {
      if (this.destroyed) return;
      toast('Motor hatası: ' + e.message, 'error');
      this.state = 'guess';
      this.board.setPosition(this.fens[ply], { interactive: true, animate: false });
      return;
    }
    if (this.destroyed) return;
    const master = this.game.ucis[ply];
    const best = entry.top[0];
    const sc = scoreMove({ played: uci, playedCp: played.cp, master, masterCp: entry.master.cp, bestCp: best.cp, isBook: inBook(fenAfter) });
    const delta = rateMove(this.att, entry.rating, sc.score);
    const move = {
      uci, san: moveSan, cp: played.cp, masterUci: master, masterCp: entry.master.cp,
      bestUci: best.uci, bestCp: best.cp, score: sc.score, type: sc.type, timeMs,
      posRating: entry.rating, ratingDelta: delta, rated: this.att.rated,
      ratingAfter: store.profile.ratings.gtm.r, depth: entry.depth,
    };
    this.att.moves[ply] = move;
    clear(this.feedbackHost).append(feedbackBox({ move, entry, fen: this.fens[ply], color: this.user }));
    this.analysis.save();

    const masterSanStr = san(this.game.sans[ply]);
    if (uci !== master) {
      this.board.setArrows([{ orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush: 'blue' }]);
      this.later(() => {
        this.board.setPosition(this.fens[ply + 1], { lastMove: master });
        this.board.setArrows([{ orig: master.slice(0, 2), dest: master.slice(2, 4), brush: 'green' }]);
      }, 700);
      this.setStatus(`Usta ${masterSanStr} oynadı.`);
    } else {
      this.board.setArrows([]);
      this.setStatus(`Doğru! Usta da ${masterSanStr} oynadı.`);
    }
    this.ply = ply + 1;
    this.saveProgress();
    if (store.settings.autoNext) {
      this.state = 'auto';
      this.refreshPanels();
      this.later(() => this.next(), uci !== master ? 1500 : 700);
    } else {
      this.state = 'waitNext';
      this.refreshPanels();
    }
  }

  next() {
    if (this.state !== 'waitNext' && this.state !== 'auto') return;
    this.board.setArrows([]);
    this.state = 'idle';
    this.advance();
  }

  skipOpening() {
    if (this.state !== 'guess') return;
    while (this.ply < this.n && inBook(this.fens[this.ply + 1])) {
      if (sideToMove(this.fens[this.ply]) === this.user) this.att.skipped.push(this.ply);
      this.ply++;
    }
    this.board.setPosition(this.fens[this.ply], { lastMove: this.game.ucis[this.ply - 1], animate: false });
    this.saveProgress();
    this.setStatus('Açılış atlandı.');
    this.state = 'idle';
    this.advance();
  }

  saveProgress() {
    this.att.lastPly = this.ply;
    store.saveAttempts();
    if (this.att.rated) store.saveProfile();
  }

  finish() {
    this.state = 'done';
    this.att.status = 'done';
    this.att.finishedAt = Date.now();
    this.att.lastPly = this.n;
    store.saveAttempts();
    store.saveProfile();
    updateDifficulty(this.game, this.analysis);
    store.saveGames();
    this.analysis.save();
    this.board.setInteractive(false);
    this.setStatus('Oyun bitti.');
    this.renderControls();
    const st = attemptStats(this.att);
    const sign = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
    modal({
      title: 'Oyun tamamlandı',
      body: h('div.summary',
        h('div.big-score', st.avg.toFixed(2), h('span', ' ortalama skor')),
        h('table.kv',
          h('tr', h('td', 'Tahmin edilen hamle'), h('td', st.played)),
          h('tr', h('td', 'Usta ile aynı'), h('td', `${st.master} (${st.played ? Math.round((100 * st.master) / st.played) : 0}%)`)),
          h('tr', h('td', 'Motor ile aynı'), h('td', `${st.engine}`)),
          h('tr', h('td', 'Puan değişimi'), h('td', this.att.rated ? sign(st.ratingChange) : 'Puansız')),
          h('tr', h('td', 'Yeni puan'), h('td', store.profile.ratings.gtm.r.toFixed(1))),
          h('tr', h('td', 'Süre'), h('td', fmtTime(st.totalMs))))),
      actions: [
        { label: 'Oyun Listesi', onClick: () => this.exit() },
        { label: 'İncele', primary: true, onClick: () => { this.destroy(); this.onReview(this.att); } },
      ],
    });
  }

  exit() { this.destroy(); this.onExit(); }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.timers.forEach(clearTimeout);
    clearInterval(this.tick);
    window.removeEventListener('keydown', this.keyHandler);
    cancel(this.analysis.tag);
    this.analysis.save();
    if (this.board) this.board.destroy();
  }
}
