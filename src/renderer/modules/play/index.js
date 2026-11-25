// "Pozisyondan Oyna": set up any position (start, editor, FEN/PGN) and play it out against
// Stockfish levels or Maia (human-like, 1100–1900). Games are saved and can be analysed afterwards.
import { Chess } from 'chess.js';
import { h, clear, modal, toast, fmtDate } from '../../core/dom.js';
import { Board, localSan } from '../../core/board.js';
import { store } from '../../core/store.js';
import { BoardEditor, START_FEN } from '../../core/editor.js';
import { LivePanel } from '../../core/livePanel.js';
import { cancel } from '../../core/engine.js';
import { chooseMove, opponentName, MAIA_LEVELS, SF_LEVELS } from '../../core/opponents.js';

const api = window.api;
const tr = () => store.settings.turkishNotation !== false;
const pdata = {
  games: [],
  async load() { this.games = await api.read('play/games', []); },
  save() { return api.write('play/games', this.games); },
};

export default {
  id: 'play',
  title: 'Pozisyondan Oyna',
  icon: '♟',
  description: "Herhangi bir pozisyonu Stockfish seviyelerine ya da insan gibi oynayan Maia (1100–1900) motorlarına karşı sonuna kadar oynayın.",
  ready: true,
  homeInfo: async () => { await pdata.load(); const n = pdata.games.filter((g) => g.status === 'done').length; return n ? `${n} oyun oynandı` : 'Maia 1100–1900 · Stockfish 8 seviye'; },

  async mount(root) {
    await pdata.load();
    let current = null;
    const tabsHost = h('div.tabs');
    const body = h('div.module-body');
    clear(root).append(h('div.module', h('div.module-head', h('h2', this.title), tabsHost), body));
    const swap = (v) => { if (current && current.destroy) current.destroy(); current = v; };
    const setTabs = (active) => clear(tabsHost).append(...[
      ['setup', 'Yeni Oyun', showSetup], ['game', 'Oyun', null], ['history', 'Geçmiş', showHistory],
    ].filter(([k, , f]) => f || active === k).map(([k, l, f]) => h('button.tab' + (active === k ? '.active' : ''), { onclick: f || (() => {}) }, l)));

    // remembered choices
    const prefs = Object.assign({ opp: { kind: 'maia', elo: 1500, sample: false }, side: 'tomove', takeback: true }, store.settings.playPrefs || {});
    const savePrefs = () => { store.settings.playPrefs = prefs; store.saveSettings(); };

    function showSetup() {
      setTabs('setup'); swap(null);
      let mode = 'start';
      let editor = null;
      let pgnHistory = null; // FEN list from pasted PGN
      const posHost = h('div.pos-host');
      const active = pdata.games.find((g) => g.status === 'active');

      const renderPos = () => {
        if (editor) { editor.destroy(); editor = null; }
        const host = clear(posHost);
        if (mode === 'start') host.append(h('p.muted', 'Oyun normal başlangıç pozisyonundan başlar.'));
        if (mode === 'editor') editor = new BoardEditor(host, { fen: prefs.lastFen || START_FEN });
        if (mode === 'paste') {
          const ta = h('textarea.paste', { placeholder: 'FEN ya da PGN yapıştırın…', rows: 6 });
          const info = h('div.muted');
          ta.addEventListener('input', () => {
            const t = ta.value.trim();
            pgnHistory = null;
            if (!t) { info.textContent = ''; return; }
            try {
              if (/^[rnbqkpRNBQKP1-8]+(\/[rnbqkpRNBQKP1-8]+){7}\s+[wb]/.test(t)) {
                new Chess(t); pgnHistory = [t]; info.textContent = '✓ FEN okundu.';
              } else {
                const c = new Chess(); c.loadPgn(t);
                const hist = c.history({ verbose: true });
                pgnHistory = [hist.length ? hist[0].before : c.fen(), ...hist.map((m) => m.after)];
                info.textContent = `✓ PGN okundu: ${hist.length} yarım hamle. Oyun son pozisyondan devam eder.`;
              }
              info.className = 'ok-text';
            } catch (e) { info.textContent = '⚠ Okunamadı: ' + e.message; info.className = 'bad-text'; }
          });
          host.append(ta, info);
        }
      };

      const oppHost = h('div');
      const renderOpp = () => {
        const o = prefs.opp;
        clear(oppHost).append(
          h('div.seg.wide', [['maia', 'Maia (insan gibi)'], ['stockfish', 'Stockfish']].map(([k, l]) =>
            h('button' + (o.kind === k ? '.active' : ''), { onclick: () => { prefs.opp = k === 'maia' ? { kind: 'maia', elo: 1500, sample: false } : { kind: 'stockfish', level: 3 }; renderOpp(); } }, l))),
          o.kind === 'maia'
            ? h('div',
              h('p.muted.small', 'Maia, belirli bir puandaki insanların oynayacağı hamleyi tahmin eden bir yapay zekâdır. Hata yapar, insan gibi oynar.'),
              h('div.level-grid', MAIA_LEVELS.map((e) => h('button.level' + (o.elo === e ? '.active' : ''), { onclick: () => { o.elo = e; renderOpp(); } }, e))),
              h('label.chk', h('input', { type: 'checkbox', checked: o.sample, onchange: (ev) => { o.sample = ev.target.checked; } }), 'Daha çeşitli oynasın (her zaman en olası hamleyi seçmesin)'))
            : h('div',
              h('p.muted.small', 'Stockfish dünyanın en güçlü motorlarındandır. Düşük seviyelerde bilerek zayıflatılır.'),
              h('div.level-grid', SF_LEVELS.map((l) => h('button.level' + (o.level === l.level ? '.active' : ''), { title: l.approx, onclick: () => { o.level = l.level; renderOpp(); } }, h('div', l.level), h('div.small.muted', l.approx))))));
      };

      const sideSeg = () => h('div.seg', [['tomove', 'Sırası gelen'], ['w', 'Beyaz'], ['b', 'Siyah'], ['random', 'Rastgele']].map(([v, l]) =>
        h('button' + (prefs.side === v ? '.active' : ''), { onclick: (e) => { prefs.side = v; e.target.parentNode.replaceWith(sideSeg()); } }, l)));

      const start = () => {
        let history;
        if (mode === 'start') history = [START_FEN];
        else if (mode === 'editor') {
          if (!editor.validate()) { toast('Pozisyon geçerli değil', 'error'); return; }
          history = [editor.fen()];
          prefs.lastFen = editor.fen();
        } else {
          if (!pgnHistory) { toast('Önce geçerli bir FEN ya da PGN yapıştırın', 'error'); return; }
          history = pgnHistory;
        }
        const last = history[history.length - 1];
        const toMove = last.split(' ')[1];
        let userColor = prefs.side === 'tomove' ? toMove : prefs.side === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : prefs.side;
        savePrefs();
        const game = {
          id: Date.now().toString(36), t: Date.now(), status: 'active',
          startHistory: history, moves: [], userColor, opp: { ...prefs.opp }, takeback: prefs.takeback, result: null, reason: null,
        };
        pdata.games.push(game); pdata.save();
        showGame(game);
      };

      clear(body).append(h('div.setup',
        h('div.setup-left',
          active ? h('div.panel.resume', h('div', h('b', 'Yarım kalan oyun: '), `${opponentName(active.opp)} – ${active.moves.length} hamle`),
            h('div.btn-row', h('button.btn.primary.small', { onclick: () => showGame(active) }, 'Devam et'),
              h('button.btn.small.ghost', { onclick: () => { active.status = 'done'; active.result = '*'; active.reason = 'Yarıda bırakıldı'; pdata.save(); showSetup(); } }, 'Bırak'))) : null,
          h('div.panel',
            h('div.panel-title', 'Pozisyon'),
            h('div.seg.wide', [['start', 'Başlangıç'], ['editor', 'Tahtada kur'], ['paste', 'FEN / PGN']].map(([k, l]) =>
              h('button' + (mode === k ? '.active' : ''), { onclick: (e) => { mode = k; [...e.target.parentNode.children].forEach((b) => b.classList.toggle('active', b === e.target)); renderPos(); } }, l))),
            posHost)),
        h('div.setup-right',
          h('div.panel', h('div.panel-title', 'Rakip'), oppHost),
          h('div.panel', h('div.panel-title', 'Tarafınız'), sideSeg(),
            h('label.chk', { style: { marginTop: '10px' } }, h('input', { type: 'checkbox', checked: prefs.takeback, onchange: (e) => { prefs.takeback = e.target.checked; } }), 'Hamle geri almaya izin ver')),
          h('button.btn.primary.big', { onclick: start }, 'Oyunu Başlat ▸'))));
      renderPos(); renderOpp();
      swap({ destroy: () => { if (editor) editor.destroy(); } });
    }

    function showGame(game) {
      setTabs('game');
      const v = new GameView(body, game, { onNew: showSetup, onRematch: (g) => {
        const ng = { ...g, id: Date.now().toString(36), t: Date.now(), status: 'active', moves: [], result: null, reason: null };
        pdata.games.push(ng); pdata.save(); showGame(ng);
      } });
      swap(v); v.mount();
    }

    function showHistory() {
      setTabs('history'); swap(null);
      const games = pdata.games.filter((g) => g.status === 'done').slice().reverse();
      const resText = (g) => {
        if (!g.result || g.result === '*') return 'Yarım';
        if (g.result === '1/2-1/2') return 'Berabere';
        const userWon = (g.result === '1-0') === (g.userColor === 'w');
        return userWon ? 'Kazandınız' : 'Kaybettiniz';
      };
      clear(body).append(h('div.table-host', games.length ? h('table.games',
        h('thead', h('tr', h('th', 'Tarih'), h('th', 'Rakip'), h('th', 'Taraf'), h('th', 'Sonuç'), h('th', 'Hamle'), h('th', ''))),
        h('tbody', games.map((g) => h('tr',
          h('td', fmtDate(g.t)), h('td', opponentName(g.opp)), h('td', g.userColor === 'w' ? 'Beyaz' : 'Siyah'),
          h('td', h('b', resText(g)), h('div.sub', g.reason || '')), h('td', Math.ceil(g.moves.length / 2)),
          h('td.actions', h('button.btn.small', { onclick: () => showGame(g) }, 'Analiz'),
            h('button.icon-btn', { title: 'Sil', onclick: () => { pdata.games = pdata.games.filter((x) => x !== g); pdata.save(); showHistory(); } }, '🗑'))))))
        : h('div.empty', 'Henüz tamamlanan oyun yok.')));
    }

    const active = pdata.games.find((g) => g.status === 'active');
    if (active) showGame(active); else showSetup();
    return { unmount: () => swap(null) };
  },
};

class GameView {
  constructor(root, game, { onNew, onRematch }) {
    this.root = root; this.g = game; this.onNew = onNew; this.onRematch = onRematch;
    this.live = new LivePanel({ tag: 'play-live' });
    this.view = null; // index into fens while browsing; null = live
    this.thinking = false;
    this.destroyed = false;
  }

  fens() {
    const c = new Chess(this.g.startHistory[this.g.startHistory.length - 1]);
    const out = [c.fen()];
    for (const u of this.g.moves) { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); out.push(c.fen()); }
    return out;
  }

  history() { return [...this.g.startHistory, ...this.fens().slice(1)]; }

  mount() {
    const g = this.g;
    this.boardHost = h('div.board-host');
    this.statusEl = h('div.status-line');
    this.controls = h('div.controls');
    this.movesHost = h('div.movelist');
    this.infoHost = h('div');
    const oppColor = g.userColor === 'w' ? 'b' : 'w';
    const bar = (color, name) => h('div.player-bar.' + (color === 'w' ? 'white' : 'black'), name);
    clear(this.root).append(h('div.gtm-layout',
      h('div.gtm-left', this.infoHost),
      h('div.gtm-center', bar(oppColor, opponentName(g.opp)), this.boardHost, bar(g.userColor, store.profile.name), this.statusEl, this.controls),
      h('div.gtm-right', h('div.panel-title', 'Hamleler'), this.movesHost, this.navRow(), this.live.button, this.live.el)));
    this.board = new Board(this.boardHost, { orientation: g.userColor === 'w' ? 'white' : 'black', onMove: (m) => this.onUserMove(m) });
    this.keyHandler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') this.browse(-1); else if (e.key === 'ArrowRight') this.browse(1);
    };
    window.addEventListener('keydown', this.keyHandler);
    this.refresh();
    if (g.status === 'active') this.checkEnd() || this.maybeEngine();
  }

  navRow() {
    return h('div.nav-row',
      h('button.icon-btn', { title: 'Başa', onclick: () => this.goto(0) }, '⏮'),
      h('button.icon-btn', { title: 'Geri', onclick: () => this.browse(-1) }, '◀'),
      h('button.icon-btn', { title: 'İleri', onclick: () => this.browse(1) }, '▶'),
      h('button.icon-btn', { title: 'Son pozisyon', onclick: () => this.goto(null) }, '⏭'));
  }

  isUserTurn() { const f = this.fens(); return f[f.length - 1].split(' ')[1] === this.g.userColor; }

  refresh() {
    const g = this.g;
    const fens = this.fens();
    const idx = this.view == null ? fens.length - 1 : this.view;
    const live = this.view == null;
    const interactive = live && g.status === 'active' && this.isUserTurn() && !this.thinking;
    this.board.setPosition(fens[idx], { lastMove: idx > 0 ? g.moves[idx - 1] : undefined, interactive, animate: true });
    if (g.status === 'done' || !live) this.live.setPosition(fens[idx]);
    // moves list
    const host = clear(this.movesHost);
    const start = new Chess(fens[0]);
    const first = fens[0].split(' ');
    let num = +first[5];
    let color = first[1];
    g.moves.forEach((u, i) => {
      const c = new Chess(fens[i]);
      const san = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san;
      if (color === 'w') host.append(h('span.mvnum', `${num}.`));
      else if (i === 0) host.append(h('span.mvnum', `${num}...`));
      host.append(h('span.mv' + (idx === i + 1 ? '.cur' : ''), { onclick: () => this.goto(i + 1) }, localSan(san, tr())));
      if (color === 'b') num++;
      color = color === 'w' ? 'b' : 'w';
    });
    void start;
    // info
    clear(this.infoHost).append(h('div.panel',
      h('div.panel-title', 'Oyun'),
      h('table.kv',
        h('tr', h('td', 'Rakip'), h('td', opponentName(g.opp))),
        h('tr', h('td', 'Tarafınız'), h('td', g.userColor === 'w' ? 'Beyaz' : 'Siyah')),
        h('tr', h('td', 'Hamle'), h('td', Math.ceil(g.moves.length / 2))),
        g.status === 'done' ? h('tr', h('td', 'Sonuç'), h('td', h('b', this.resultText()))) : null)),
      g.status === 'done' ? h('p.muted.small', 'Oyun bitti. Hamlelere tıklayarak ya da ◀ ▶ ile gezinebilir, motoru açıp analiz edebilirsiniz.') : h('p.muted.small', 'Oyun sırasında motor analizi kapalıdır.'));
    // controls
    const ctl = clear(this.controls);
    if (g.status === 'active') {
      if (g.takeback) ctl.append(h('button.btn', { onclick: () => this.takeback(), disabled: this.thinking || !g.moves.length }, 'Geri al'));
      ctl.append(h('button.btn', { onclick: () => this.board.flip() }, 'Çevir'));
      ctl.append(h('button.btn.ghost', { onclick: () => this.resign() }, 'Pes et'));
    } else {
      ctl.append(h('button.btn', { onclick: () => this.copyPgn() }, 'PGN kopyala'));
      ctl.append(h('button.btn', { onclick: () => this.onRematch(this.g) }, 'Aynı pozisyonu tekrar oyna'));
      ctl.append(h('button.btn.primary', { onclick: () => this.onNew() }, 'Yeni oyun'));
    }
    this.live.button.style.display = g.status === 'done' ? '' : 'none';
    if (g.status !== 'done') this.live.toggle(false);
    if (!live && g.status === 'active') this.statusEl.textContent = 'Geçmiş bir pozisyona bakıyorsunuz. ⏭ ile oyuna dönün.';
  }

  goto(i) { const n = this.fens().length - 1; this.view = i == null || i >= n ? null : Math.max(0, i); this.refresh(); }
  browse(d) { const n = this.fens().length - 1; const cur = this.view == null ? n : this.view; this.goto(cur + d); }

  setStatus(t) { this.statusEl.textContent = t; }

  onUserMove({ uci }) {
    if (this.g.status !== 'active' || this.view != null) return;
    this.g.moves.push(uci);
    pdataSave();
    this.refresh();
    if (!this.checkEnd()) this.maybeEngine();
  }

  async maybeEngine() {
    if (this.g.status !== 'active' || this.isUserTurn()) { if (this.g.status === 'active') this.setStatus('Sıra sizde.'); return; }
    this.thinking = true;
    this.refresh();
    this.setStatus(`${opponentName(this.g.opp)} düşünüyor…`);
    const t0 = Date.now();
    let uci;
    try { uci = await chooseMove(this.g.opp, this.history()); }
    catch (e) { if (!this.destroyed) { toast('Motor hatası: ' + e.message, 'error'); this.thinking = false; this.refresh(); } return; }
    // a human-like pause so moves are not instant
    const wait = Math.max(0, (this.g.opp.kind === 'maia' ? 500 : 250) - (Date.now() - t0));
    await new Promise((r) => setTimeout(r, wait));
    if (this.destroyed || this.g.status !== 'active') return;
    this.thinking = false;
    this.g.moves.push(uci);
    pdataSave();
    this.view = null;
    this.refresh();
    if (!this.checkEnd()) this.setStatus('Sıra sizde.');
  }

  checkEnd() {
    const fens = this.fens();
    const c = new Chess(fens[fens.length - 1]);
    // threefold repetition needs the move history: count identical positions
    const keys = this.history().map((f) => f.split(' ').slice(0, 4).join(' '));
    const rep = keys.filter((k) => k === keys[keys.length - 1]).length >= 3;
    let result = null, reason = null;
    if (c.isCheckmate()) { result = c.turn() === 'w' ? '0-1' : '1-0'; reason = 'Mat'; }
    else if (c.isStalemate()) { result = '1/2-1/2'; reason = 'Pat'; }
    else if (c.isInsufficientMaterial()) { result = '1/2-1/2'; reason = 'Yetersiz materyal'; }
    else if (rep) { result = '1/2-1/2'; reason = 'Üç kez tekrar'; }
    else if (c.isDraw()) { result = '1/2-1/2'; reason = '50 hamle kuralı'; }
    if (!result) return false;
    this.end(result, reason);
    return true;
  }

  end(result, reason) {
    cancel('play');
    this.g.status = 'done'; this.g.result = result; this.g.reason = reason;
    pdataSave();
    this.thinking = false;
    this.view = null;
    this.refresh();
    this.setStatus(`${this.resultText()} (${reason})`);
    modal({ title: 'Oyun bitti', body: h('div.summary', h('div.big-score', this.resultText()), h('p.muted', { style: { textAlign: 'center' } }, reason)),
      actions: [{ label: 'Analiz et', onClick: () => this.live.toggle(true) }, { label: 'Yeni oyun', primary: true, onClick: () => this.onNew() }] });
  }

  resultText() {
    const r = this.g.result;
    if (r === '1/2-1/2') return 'Berabere';
    if (!r || r === '*') return 'Yarım';
    return (r === '1-0') === (this.g.userColor === 'w') ? 'Kazandınız!' : 'Kaybettiniz';
  }

  takeback() {
    if (this.thinking || !this.g.moves.length) return;
    // undo back to the user's previous turn
    do { this.g.moves.pop(); } while (this.g.moves.length && !this.isUserTurn());
    pdataSave();
    this.view = null;
    this.refresh();
    this.setStatus('Hamle geri alındı. Sıra sizde.');
    if (!this.isUserTurn()) this.maybeEngine();
  }

  resign() {
    modal({ title: 'Pes etmek istiyor musunuz?', body: h('p', 'Oyun kaybedilmiş sayılacak.'),
      actions: [{ label: 'Vazgeç' }, { label: 'Pes et', primary: true, onClick: () => this.end(this.g.userColor === 'w' ? '0-1' : '1-0', 'Pes etme') }] });
  }

  copyPgn() {
    const g = this.g;
    const fens = this.fens();
    const start = fens[0];
    const name = store.profile.name, opp = opponentName(g.opp);
    const hdr = [['Event', 'Köroğlu Satranç'], ['Date', new Date(g.t).toISOString().slice(0, 10).replace(/-/g, '.')],
      ['White', g.userColor === 'w' ? name : opp], ['Black', g.userColor === 'w' ? opp : name], ['Result', g.result || '*']];
    if (start !== START_FEN) hdr.push(['SetUp', '1'], ['FEN', start]);
    const c = new Chess(start);
    for (const u of g.moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    for (const [k, v] of hdr) c.setHeader(k, v);
    navigator.clipboard.writeText(c.pgn()).then(() => toast('PGN panoya kopyalandı', 'ok'), () => toast('Kopyalanamadı', 'error'));
  }

  destroy() {
    this.destroyed = true;
    cancel('play');
    this.live.destroy();
    window.removeEventListener('keydown', this.keyHandler);
    if (this.board) this.board.destroy();
  }
}

function pdataSave() { pdata.save(); }
