// "Lichess'te Oyna": real Lichess games played on our board through Lichess's official Board API.
// The game is an ordinary Lichess game (rated if chosen) on the student's own account.
// Lichess rules for the Board API: rapid / classical / correspondence; blitz only for direct challenges.
// Fair play: while a game is running, engine help is switched off everywhere in the site.
import { Chess } from 'chess.js';
import { supa } from './supa.js';
import { LICHESS, playToken, startLink, getLink, forgetPlay } from './lichess.js';
import { h, clear, modal, toast } from '../../src/renderer/core/dom.js';
import { Board } from '../../src/renderer/core/board.js';

const SEEKS = [[10, 0, '10+0'], [10, 5, '10+5'], [15, 10, '15+10'], [30, 0, '30+0']]; // rapid/classical: allowed for seeks
const CHALLENGE_TCS = [[3, 2, '3+2'], [5, 3, '5+3'], [10, 0, '10+0'], [10, 5, '10+5'], [15, 10, '15+10']];

// ---------- low-level API ----------
async function call(path, { method = 'GET', form, signal } = {}) {
  const t = playToken();
  if (!t) throw new Error('Lichess oyun izni yok');
  const r = await fetch(LICHESS + path, { method, signal, headers: { Authorization: `Bearer ${t.token}`, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body: form ? new URLSearchParams(form) : undefined });
  if (r.status === 401) { forgetPlay(); throw new Error('Lichess oyun izninin süresi dolmuş. Yeniden bağlanın.'); }
  if (!r.ok) { let msg = `Lichess hatası (${r.status})`; try { const j = await r.json(); msg = j.error || msg; } catch (e) { /* ignore */ } throw new Error(trError(msg)); }
  return r;
}
// Streams newline-delimited JSON until the connection ends or the signal aborts.
async function streamNd(path, onObj, signal, opts = {}) {
  const r = await call(path, { signal, ...opts });
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line) { try { onObj(JSON.parse(line)); } catch (e) { console.error(e); } }
    }
  }
}
function trError(m) {
  if (/cannot be played with the Board API|board api/i.test(m)) return 'Bu süre Lichess Board API ile oynanamıyor (rapid ya da daha uzun seçin; blitz yalnızca davetlerde).';
  if (/rate.?limit|too many/i.test(m)) return 'Lichess çok sık istek aldı, biraz bekleyin.';
  return m;
}

// ---------- global event stream (incoming challenges, game starts) ----------
export const live = {
  _game: null,           // id of the game being played on this page (engine help is off while set)
  get game() { return this._game; },
  set game(v) { this._game = v; window.__lichessGame = v; },
  expecting: false,      // we just sought / challenged / accepted: open the game when it starts
  challenges: new Map(), // incoming
  outgoing: new Map(),
  listeners: new Set(),
  ctl: null,
  emit(ev) { for (const f of this.listeners) f(ev); },
  async start() {
    if (this.ctl || !playToken()) return;
    this.ctl = new AbortController();
    const run = async () => {
      try {
        await streamNd('/api/stream/event', (e) => this.onEvent(e), this.ctl.signal);
      } catch (e) { if (e.name === 'AbortError') return; console.warn('Lichess olay akışı:', e.message); }
      if (this.ctl && !this.ctl.signal.aborted && playToken()) setTimeout(run, 5000); // reconnect
    };
    run();
  },
  stop() { if (this.ctl) this.ctl.abort(); this.ctl = null; },
  onEvent(e) {
    const me = (playToken() || {}).id;
    if (e.type === 'challenge') {
      const c = e.challenge;
      if (c.challenger && c.challenger.id === me) this.outgoing.set(c.id, c);
      else {
        const fresh = !this.challenges.has(c.id);
        this.challenges.set(c.id, c);
        if (fresh) toast(`♞ ${c.challenger ? c.challenger.name : 'Biri'} seni maça davet ediyor (${tcText(c)})`, 'ok');
      }
    } else if (e.type === 'challengeCanceled' || e.type === 'challengeDeclined') {
      const c = e.challenge;
      this.challenges.delete(c.id);
      if (this.outgoing.delete(c.id) && e.type === 'challengeDeclined') toast(`${c.destUser ? c.destUser.name : 'Rakip'} daveti reddetti`);
    } else if (e.type === 'gameStart') {
      this.challenges.delete(e.game.id); this.outgoing.delete(e.game.id);
      const gid = e.game.gameId || e.game.id;
      if (this.expecting) { this.expecting = false; if (window.goTo) window.goTo('lichess:' + gid); }
      else if (!this.game && e.game.isMyTurn) toast(`♞ Lichess'te süren bir oyunun var (${e.game.opponent ? e.game.opponent.username : 'rakip'}). Lichess'te Oyna → Devam et`);
    }
    this.emit(e);
  },
};
export const tcText = (c) => c.timeControl && c.timeControl.type === 'clock' ? `${c.timeControl.limit / 60}+${c.timeControl.increment}` : c.timeControl && c.timeControl.type === 'correspondence' ? `${c.timeControl.daysPerTurn} gün/hamle` : 'süresiz';

const fmtClock = (ms) => {
  if (ms == null) return '–';
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const STATUS = { mate: 'Mat', resign: 'Teslim', stalemate: 'Pat', timeout: 'Süre bitti', draw: 'Berabere', outoftime: 'Süre bitti', cheat: 'Hile tespiti', noStart: 'Oyun başlamadı', aborted: 'İptal edildi', variantEnd: 'Bitti' };

// ---------- module ----------
export default {
  id: 'lichess',
  title: "Lichess'te Oyna",
  icon: '♞',
  description: 'Kendi Lichess hesabınla sitenin içinde gerçek maç: arkadaşlarına meydan oku ya da rakip bul.',
  ready: true,
  homeInfo: async () => (playToken() ? `@${playToken().username}` + (live.challenges.size ? ` · ${live.challenges.size} davet` : '') : 'Bağlı değil'),

  async mount(root, { gameId } = {}) {
    const body = h('div.module-body');
    clear(root).append(h('div.module', h('div.module-head', h('h2', this.title)), body));
    let cleanup = [];
    const off = () => { for (const f of cleanup) f(); cleanup = []; };

    async function showLobby() {
      off();
      const t = playToken();
      if (!t) {
        const l = await getLink();
        clear(body).append(h('div.empty', h('div.big-icon', '♞'), h('h3', 'Lichess hesabınla burada maç yap'),
          h('p', 'Maçlar senin Lichess hesabında oynanır ve Lichess puanını etkiler. Bunun için Lichess\'e bir kez "oyun oynama" izni vermen gerekiyor. Şifren bize gelmez; izin sadece bu cihazda saklanır.'),
          l ? h('p.muted.small', `Bağlı hesap: @${l.username}`) : null,
          h('button.btn.primary.big', { onclick: () => startLink({ play: true }) }, 'Lichess ile bağlan ve oyun izni ver')));
        return;
      }
      live.start();
      const incomingHost = h('div'), outgoingHost = h('div'), playingHost = h('div'), friendsHost = h('div');
      const seekState = { ctl: null };
      const seekBox = h('div');
      let rated = true;
      const drawSeek = () => clear(seekBox).append(seekState.ctl
        ? h('div.seek-wait', h('div.spinner'), h('span', 'Rakip aranıyor…'), h('button.btn.small', { onclick: () => { seekState.ctl.abort(); seekState.ctl = null; drawSeek(); } }, 'İptal'))
        : h('div.btn-row.tc-row', SEEKS.map(([m, inc, label]) => h('button.btn.tc', { onclick: () => seek(m, inc) }, h('b', label), h('span.muted.small', m >= 30 ? 'Klasik' : 'Rapid')))));
      async function seek(minutes, inc) {
        seekState.ctl = new AbortController(); drawSeek(); live.expecting = true;
        try { await call('/api/board/seek', { method: 'POST', form: { rated: String(rated), time: String(minutes), increment: String(inc), variant: 'standard', color: 'random' }, signal: seekState.ctl.signal }).then((r) => r.text()); }
        catch (e) { if (e.name !== 'AbortError') toast(e.message, 'error'); }
        seekState.ctl = null; if (seekBox.isConnected) drawSeek();
      }
      cleanup.push(() => { if (seekState.ctl) seekState.ctl.abort(); });

      const drawIncoming = () => clear(incomingHost).append(live.challenges.size ? h('div.panel.challenge-panel', h('div.panel-title', 'Sana gelen davetler'),
        [...live.challenges.values()].map((c) => h('div.challenge-row', h('b', c.challenger ? c.challenger.name : '?'), c.challenger && c.challenger.rating ? h('span.muted', ` (${c.challenger.rating})`) : null,
          h('span.chip', tcText(c)), h('span.chip', c.rated ? 'Puanlı' : 'Dostluk'), h('span.spacer'),
          h('button.btn.small.primary', { onclick: async () => { try { live.expecting = true; await call(`/api/challenge/${c.id}/accept`, { method: 'POST' }); live.challenges.delete(c.id); } catch (e) { toast(e.message, 'error'); } } }, 'Kabul et'),
          h('button.btn.small.ghost', { onclick: async () => { try { await call(`/api/challenge/${c.id}/decline`, { method: 'POST', form: { reason: 'later' } }); } catch (e) { /* ignore */ } live.challenges.delete(c.id); drawIncoming(); } }, 'Reddet')))) : '');
      const drawOutgoing = () => clear(outgoingHost).append(live.outgoing.size ? h('div.panel', h('div.panel-title', 'Gönderdiğin davetler'),
        [...live.outgoing.values()].map((c) => h('div.challenge-row', h('span', `${c.destUser ? c.destUser.name : 'Açık davet'} · ${tcText(c)}`), h('span.muted.small', ' kabul etmesi bekleniyor…'), h('span.spacer'),
          h('button.btn.small.ghost', { onclick: async () => { try { await call(`/api/challenge/${c.id}/cancel`, { method: 'POST' }); } catch (e) { /* ignore */ } live.outgoing.delete(c.id); drawOutgoing(); } }, 'Geri al')))) : '');
      const onEv = () => { if (incomingHost.isConnected) { drawIncoming(); drawOutgoing(); } };
      live.listeners.add(onEv); cleanup.push(() => live.listeners.delete(onEv));

      // ongoing games (e.g. after closing the tab)
      call('/api/account/playing').then((r) => r.json()).then((j) => {
        const g = (j.nowPlaying || []);
        clear(playingHost).append(g.length ? h('div.panel', h('div.panel-title', 'Süren oyunların'),
          g.map((x) => h('div.challenge-row', h('b', x.opponent ? x.opponent.username : '?'), h('span.muted', x.isMyTurn ? ' · sıra sende' : ' · rakipte'), h('span.spacer'),
            h('button.btn.small.primary', { onclick: () => showGame(x.gameId) }, 'Devam et')))) : '');
      }).catch(() => {});

      // classmates + coach with linked Lichess accounts
      const { data: friends } = await supa.from('lichess_accounts').select('user_id, display_name, username').order('display_name');
      const others = (friends || []).filter((f) => f.username.toLowerCase() !== t.id);
      let tc = [10, 0];
      let chRated = false;
      const tcSel = h('div.seg', CHALLENGE_TCS.map(([m, inc, label]) => h('button' + (tc[0] === m && tc[1] === inc ? '.active' : ''), { onclick: (e) => { tc = [m, inc]; [...e.target.parentNode.children].forEach((b) => b.classList.remove('active')); e.target.classList.add('active'); } }, label)));
      async function challenge(username) {
        try {
          live.expecting = true;
          const r = await call(`/api/challenge/${encodeURIComponent(username)}`, { method: 'POST', form: { 'clock.limit': String(tc[0] * 60), 'clock.increment': String(tc[1]), rated: String(chRated), color: 'random', variant: 'standard' } });
          const j = await r.json();
          const c = j.challenge || j;
          if (c && c.id) live.outgoing.set(c.id, c);
          drawOutgoing();
          toast(`${username} davet edildi. Kabul edince maç burada başlar.`, 'ok');
        } catch (e) { toast(e.message, 'error'); }
      }
      const anyIn = h('input.search', { placeholder: 'Lichess kullanıcı adı', style: { maxWidth: '220px' } });
      clear(friendsHost).append(h('div.panel', h('div.panel-title', 'Meydan oku'),
        h('div.form-l', 'Süre'), tcSel,
        h('label.chk', h('input', { type: 'checkbox', onchange: (e) => { chRated = e.target.checked; } }), ' Puanlı (Lichess puanını etkiler)'),
        others.length ? h('div.friend-list', others.map((f) => h('div.challenge-row', h('b', f.display_name), h('span.muted.small', ` @${f.username}`), h('span.spacer'),
          h('button.btn.small.primary', { onclick: () => challenge(f.username) }, 'Davet et'))))
          : h('p.muted.small', 'Lichess hesabını bağlayan arkadaşların burada listelenir.'),
        h('div.btn-row', anyIn, h('button.btn.small', { onclick: () => { const u = anyIn.value.trim(); if (/^[\w-]{2,30}$/.test(u)) challenge(u); else toast('Geçerli bir Lichess kullanıcı adı yazın', 'error'); } }, 'Davet et'))));

      clear(body).append(h('div.lichess-lobby',
        h('div.toolbar', h('span', 'Hesap: ', h('b', '@' + t.username)), h('span.spacer'),
          h('button.btn.small.ghost', { onclick: () => window.api.openExternal(`${LICHESS}/@/${t.username}`) }, 'Profil ↗'),
          h('button.btn.small.ghost', { onclick: () => { forgetPlay(); live.stop(); toast('Bu cihazdaki oyun izni kaldırıldı'); showLobby(); } }, 'Oyun iznini kaldır')),
        incomingHost, outgoingHost, playingHost,
        h('div.two-col',
          friendsHost,
          h('div.panel', h('div.panel-title', 'Rakip bul (Lichess\'teki herkes)'),
            h('p.muted.small', 'Lichess benzer puanlı bir rakip bulur. Lichess kuralı: bu yolla yalnızca rapid ve klasik süreler oynanabilir.'),
            h('label.chk', h('input', { type: 'checkbox', checked: true, onchange: (e) => { rated = e.target.checked; } }), ' Puanlı'),
            seekBox)),
        h('p.muted.small', 'Kurallar: maç sırasında sitedeki motor, analiz ve bulmaca ipuçları kapalıdır. Dışarıdan yardım almak Lichess\'te yasaktır ve hesabın kapatılmasına yol açar.')));
      drawSeek(); drawIncoming(); drawOutgoing();
    }

    // ---------- a game ----------
    async function showGame(id) {
      off();
      const t = playToken();
      if (!t) return showLobby();
      const ctl = new AbortController();
      cleanup.push(() => { ctl.abort(); if (live.game === id) live.game = null; });
      live.game = id;
      const boardHost = h('div.board-host');
      const topBar = h('div.lp-player', h('span', '…')), botBar = h('div.lp-player', h('span', '…'));
      const status = h('div.lp-status', 'Bağlanıyor…');
      const actions = h('div.btn-row');
      const moveList = h('div.lp-moves');
      clear(body).append(h('div.storm-layout.lp-layout',
        h('div.gtm-center', topBar, boardHost, botBar),
        h('div.storm-side', status, actions, moveList,
          h('button.btn.small.ghost.lp-leave', { onclick: showLobby, title: 'Oyun Lichess\'te sürer; süren oyunlardan geri dönebilirsin' }, '◂ Lobiye dön'))));
      let myColor = 'white', initialFen = new Chess().fen(), full = null, state = null, lastTick = Date.now(), over = false;
      const board = new Board(boardHost, { onMove: (m) => sendMove(m.uci) });
      const clockEl = { white: h('span.lp-clock'), black: h('span.lp-clock') };
      const timer = setInterval(() => drawClocks(), 200);
      cleanup.push(() => { clearInterval(timer); board.destroy(); });

      const player = (p) => p ? (p.name || p.id || 'Anonim') + (p.rating ? ` (${p.rating}${p.provisional ? '?' : ''})` : '') : (full && full.black && full.black.aiLevel ? `Lichess yapay zekâ ${full.black.aiLevel}` : '?');
      function drawPlayers() {
        const opp = myColor === 'white' ? 'black' : 'white';
        clear(topBar).append(h('span', player(full[opp])), clockEl[opp]);
        clear(botBar).append(h('span', player(full[myColor])), clockEl[myColor]);
        requestAnimationFrame(() => board.refresh());
      }
      function drawClocks() {
        if (!state || state.wtime == null) return;
        const c = new Chess(initialFen); const n = state.moves ? state.moves.split(' ').filter(Boolean).length : 0;
        const turn = ((c.turn() === 'w') === (n % 2 === 0)) ? 'white' : 'black';
        const running = !over && n >= 2;
        const el = Date.now() - lastTick;
        clockEl.white.textContent = fmtClock(state.wtime - (running && turn === 'white' ? el : 0));
        clockEl.black.textContent = fmtClock(state.btime - (running && turn === 'black' ? el : 0));
        clockEl.white.classList.toggle('run', running && turn === 'white');
        clockEl.black.classList.toggle('run', running && turn === 'black');
      }
      function apply(st) {
        state = st; lastTick = Date.now();
        const c = new Chess(initialFen);
        const mv = (st.moves || '').split(' ').filter(Boolean);
        let last = null;
        const sans = [];
        for (const u of mv) { const r = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); sans.push(r ? r.san : u); last = u; }
        const myTurn = (c.turn() === 'w') === (myColor === 'white');
        over = st.status && !['started', 'created'].includes(st.status);
        board.setPosition(c.fen(), { lastMove: last, interactive: !over && myTurn, animate: true });
        clear(moveList).append(...sans.map((s, i) => h('span.mv', (i % 2 === 0 ? `${i / 2 + 1}. ` : '') + s)));
        moveList.scrollTop = moveList.scrollHeight;
        if (over) {
          live.game = null;
          const won = st.winner ? st.winner === myColor : null;
          status.className = 'lp-status ' + (won === true ? 'win' : won === false ? 'loss' : '');
          status.textContent = `${won === true ? 'Kazandın! 🎉' : won === false ? 'Kaybettin' : 'Oyun bitti'} · ${STATUS[st.status] || st.status}`;
          clear(actions).append(
            h('button.btn.primary', { onclick: () => window.api.openExternal(`${LICHESS}/${id}`) }, 'Lichess\'te analiz et ↗'),
            h('button.btn', { onclick: showLobby }, 'Lobiye dön'));
        } else {
          status.className = 'lp-status';
          status.textContent = myTurn ? 'Sıra sende' : 'Rakip düşünüyor…';
          if (st.wdraw || st.bdraw) { const fromOpp = (myColor === 'white' ? st.bdraw : st.wdraw); if (fromOpp) status.textContent += ' · Rakip beraberlik teklif etti'; }
          clear(actions).append(...[
            mv.length < 2 ? h('button.btn.small', { onclick: () => act('abort') }, 'Oyunu iptal et') : null,
            h('button.btn.small', { onclick: () => act('draw/yes') }, (myColor === 'white' ? st.bdraw : st.wdraw) ? 'Beraberliği kabul et' : 'Beraberlik teklif et'),
            h('button.btn.small.ghost', { onclick: () => modal({ title: 'Teslim olunsun mu?', body: h('p', 'Oyunu kaybetmiş sayılırsın.'), actions: [{ label: 'Vazgeç' }, { label: 'Teslim ol', primary: true, onClick: () => { act('resign'); } }] }) }, 'Teslim ol')].filter(Boolean));
        }
        drawClocks();
      }
      async function sendMove(uci) {
        try { await call(`/api/board/game/${id}/move/${uci}`, { method: 'POST' }); }
        catch (e) { toast(e.message, 'error'); apply(state); }
      }
      async function act(what) { try { await call(`/api/board/game/${id}/${what}`, { method: 'POST' }); } catch (e) { toast(e.message, 'error'); } }

      let tries = 0;
      for (;;) {
      try {
        await streamNd(`/api/board/game/stream/${id}`, (e) => {
          if (e.type === 'gameFull') {
            full = e;
            myColor = e.white && e.white.id === t.id ? 'white' : 'black';
            initialFen = e.initialFen && e.initialFen !== 'startpos' ? e.initialFen : new Chess().fen();
            board.setOrientation(myColor);
            drawPlayers();
            apply(e.state);
          } else if (e.type === 'gameState') apply(e);
          else if (e.type === 'opponentGone' && e.gone && !over) status.textContent = 'Rakip oyundan ayrıldı' + (e.claimWinInSeconds ? ` · ${e.claimWinInSeconds} sn sonra galibiyet isteyebilirsin` : '');
        }, ctl.signal);
      } catch (e) {
        if (e.name === 'AbortError') return;
        status.textContent = e.message;
      }
      // The stream ends when the game ends; if it dropped mid-game, reconnect a few times.
      if (over || ctl.signal.aborted || ++tries > 5) break;
      status.textContent = 'Bağlantı koptu, yeniden bağlanılıyor…';
      await new Promise((r) => setTimeout(r, 2000 * tries));
      if (ctl.signal.aborted) return;
      }
      if (!over && !ctl.signal.aborted) { live.game = null; status.textContent = 'Lichess\'e bağlanılamıyor. Oyun Lichess\'te sürüyor olabilir.'; clear(actions).append(h('button.btn', { onclick: () => window.api.openExternal(`${LICHESS}/${id}`) }, 'Lichess\'te aç ↗'), h('button.btn', { onclick: showLobby }, 'Lobiye dön')); }
    }

    if (gameId) showGame(gameId); else showLobby();
    return { unmount: off };
  },
};
