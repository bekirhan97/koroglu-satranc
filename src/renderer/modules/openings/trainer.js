// Trains one repertoire line. Learn mode: first shows the line with comments, then tests it.
// Review mode: only due positions are asked, the rest is played automatically. Practice: everything asked, no scheduling.
import { h, clear } from '../../core/dom.js';
import { Board, localSan } from '../../core/board.js';
import { store } from '../../core/store.js';
import { isUserMove, cardKey, grade, LEVEL_NAMES } from './data.js';
import { activity } from '../../core/activity.js';

const tr = () => store.settings.turkishNotation !== false;

export class LineTrainer {
  constructor(root, { rep, line, mode, srs, onSaved, onDone, header, index, total }) {
    Object.assign(this, { root, rep, line, mode, srs, onSaved, onDone, header, index, total });
    this.phase = mode === 'learn' ? 'show' : 'test';
    this.i = 0;                 // index of the next move in the line
    this.results = [];          // { key, correct }
    this.timers = [];
    this.wrongHere = 0;
    this.destroyed = false;
    const now = Date.now();
    // which user moves must be answered in this run
    this.ask = new Set(line.filter((n) => {
      if (!isUserMove(n, rep.color)) return false;
      const s = srs[cardKey(n)];
      if (mode === 'learn') return !s || this.phase === 'test';
      if (mode === 'review') return s && s.due <= now;
      return true;
    }).map((n) => n.id));
    if (mode === 'learn') this.learnKeys = new Set(line.filter((n) => isUserMove(n, rep.color) && !srs[cardKey(n)]).map((n) => n.id));
  }

  mount() {
    this.boardHost = h('div.board-host');
    this.statusHost = h('div');
    this.commentHost = h('div.panel.comment-panel');
    this.pathHost = h('div.panel');
    this.btns = h('div.controls');
    clear(this.root).append(h('div.pz-layout',
      h('div.gtm-center', this.header || null, this.boardHost, this.btns),
      h('div.pz-side', this.statusHost, this.commentHost, this.pathHost)));
    this.board = new Board(this.boardHost, { orientation: this.rep.color === 'w' ? 'white' : 'black', onMove: (m) => this.onUserMove(m) });
    this.board.setPosition(this.line[0].parent.fen, { animate: false });
    this.render();
    if (this.phase === 'test') this.step();
  }

  later(fn, ms) { const t = setTimeout(() => { if (!this.destroyed) fn(); }, ms); this.timers.push(t); }

  status(kind, title, sub) { clear(this.statusHost).append(h('div.pz-box.' + kind, h('div.pz-title', title), sub ? h('div.pz-sub', sub) : null)); }

  render() {
    // comments for the last played move (and the pre-comment of the next one in show mode)
    const last = this.i > 0 ? this.line[this.i - 1] : null;
    const next = this.line[this.i];
    const texts = [];
    if (last && last.comment) texts.push(last.comment);
    if (this.phase === 'show' && next && next.pre) texts.push(next.pre);
    if (this.i === 0 && this.line[0].pre) texts.push(this.line[0].pre);
    clear(this.commentHost).append(h('div.panel-title', 'Açıklama'), texts.length ? texts.map((t) => h('p.comment', t)) : h('p.muted.small', 'Bu hamle için açıklama yok.'));
    this.commentHost.style.display = this.phase === 'show' || texts.length ? '' : 'none';
    // line path
    const items = [];
    this.line.forEach((n, k) => {
      const fen = n.parent.fen.split(' ');
      if (fen[1] === 'w' || k === 0) items.push(h('span.mvnum', fen[1] === 'w' ? `${fen[5]}.` : `${fen[5]}...`));
      const hidden = this.phase === 'test' && k >= this.i;
      const key = isUserMove(n, this.rep.color) ? this.srs[cardKey(n)] : null;
      items.push(h('span.mv' + (k === this.i - 1 ? '.cur' : ''), { title: key ? `Seviye: ${LEVEL_NAMES[key.lv]}` : '' }, hidden ? '…' : localSan(n.san, tr())));
    });
    clear(this.pathHost).append(h('div.panel-title', `Çizgi ${this.index}/${this.total}`), h('div.movelist.flat', items));
    // buttons
    const b = clear(this.btns);
    if (this.phase === 'show') {
      b.append(h('button.btn', { onclick: () => this.showStep(-1), disabled: this.i === 0 }, '◀ Geri'));
      b.append(h('button.btn', { onclick: () => this.showStep(1), disabled: this.i >= this.line.length }, 'İleri ▸'));
      b.append(h('button.btn.primary', { onclick: () => this.startTest() }, 'Kendini test et'));
    } else if (this.phase === 'done') {
      b.append(h('button.btn.primary', { onclick: () => this.onDone(this.results) }, this.index < this.total ? 'Sonraki çizgi ▸' : 'Bitir'));
    } else {
      b.append(h('button.btn', { title: 'Doğru hamleyi gösterir (yanlış sayılır)', onclick: () => this.reveal() }, 'Göster'));
    }
  }

  // ---------- show phase ----------
  showStep(d) {
    this.i = Math.max(0, Math.min(this.line.length, this.i + d));
    const n = this.line[this.i - 1];
    const fen = n ? n.fen : this.line[0].parent.fen;
    this.board.setPosition(fen, { lastMove: n ? n.uci : undefined });
    const next = this.line[this.i];
    this.board.setArrows(next ? [{ orig: next.uci.slice(0, 2), dest: next.uci.slice(2, 4), brush: isUserMove(next, this.rep.color) ? 'green' : 'paleBlue' }] : []);
    this.status('turn', 'Çizgiyi öğren', next ? `Sıradaki hamle: ${localSan(next.san, tr())}${isUserMove(next, this.rep.color) ? ' (sizin hamleniz)' : ''}` : 'Çizginin sonu. Şimdi kendinizi test edin.');
    this.render();
  }

  startTest() {
    this.phase = 'test';
    this.i = 0;
    this.ask = new Set([...this.learnKeys]);
    this.board.setArrows([]);
    this.board.setPosition(this.line[0].parent.fen, { animate: false });
    this.render();
    this.step();
  }

  // ---------- test phase ----------
  step() {
    if (this.i >= this.line.length) return this.finish();
    const n = this.line[this.i];
    if (isUserMove(n, this.rep.color) && this.ask.has(n.id)) {
      this.wrongHere = 0;
      this.board.setPosition(n.parent.fen, { lastMove: this.i > 0 ? this.line[this.i - 1].uci : undefined, interactive: true, animate: false });
      this.status('turn', 'Sıra sizde', 'Repertuvarınızdaki hamleyi oynayın.');
      this.render();
      return;
    }
    // automatic move (opponent, or a position not due for review)
    const fast = isUserMove(n, this.rep.color);
    this.later(() => {
      this.board.setPosition(n.fen, { lastMove: n.uci });
      this.i++;
      this.render();
      this.step();
    }, fast ? 250 : 450);
  }

  onUserMove({ uci }) {
    if (this.phase !== 'test') return;
    const n = this.line[this.i];
    const siblings = n.parent.children;
    if (uci === n.uci || siblings.some((c) => c.uci === uci)) {
      const correct = this.wrongHere === 0;
      this.record(n, correct);
      if (uci !== n.uci) this.status('good', '✓ Repertuvarda var', `Bu çalışmada ${localSan(n.san, tr())} yolunu izliyoruz.`);
      else this.status('good', correct ? '✓ Doğru!' : '✓ Doğru (ikinci denemede)');
      this.board.setPosition(n.fen, { lastMove: n.uci });
      this.board.setArrows([]);
      this.i++;
      this.render();
      this.later(() => this.step(), 400);
    } else {
      this.wrongHere++;
      this.status('bad', '✗ Repertuvardaki hamle bu değil', this.wrongHere >= 2 ? `Doğru hamle: ${localSan(n.san, tr())}` : 'Tekrar deneyin.');
      this.later(() => {
        this.board.setPosition(n.parent.fen, { lastMove: this.i > 0 ? this.line[this.i - 1].uci : undefined, interactive: true, animate: false });
        if (this.wrongHere >= 2) this.board.setArrows([{ orig: n.uci.slice(0, 2), dest: n.uci.slice(2, 4), brush: 'green' }]);
      }, 600);
    }
  }

  reveal() {
    const n = this.line[this.i];
    if (!n || !this.ask.has(n.id)) return;
    this.wrongHere = Math.max(this.wrongHere, 2);
    this.board.setArrows([{ orig: n.uci.slice(0, 2), dest: n.uci.slice(2, 4), brush: 'green' }]);
    this.status('bad', `Doğru hamle: ${localSan(n.san, tr())}`, 'Oynayarak devam edin.');
  }

  record(n, correct) {
    const key = cardKey(n);
    this.results.push({ key, correct });
    activity.add('openings');
    if (this.mode !== 'practice') {
      // in learn mode a first test always starts the ladder at level 1
      if (this.mode === 'learn') { grade(this.srs, key, true); if (!correct) { this.srs[key].lv = 1; } }
      else grade(this.srs, key, correct);
      this.onSaved && this.onSaved();
    }
  }

  finish() {
    this.phase = 'done';
    const ok = this.results.filter((r) => r.correct).length;
    this.status(ok === this.results.length ? 'good' : 'bad', 'Çizgi tamamlandı', `${ok}/${this.results.length} hamle ilk denemede doğru.`);
    this.render();
  }

  destroy() { this.destroyed = true; this.timers.forEach(clearTimeout); if (this.board) this.board.destroy(); }
}
