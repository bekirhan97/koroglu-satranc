// "Oyunlarım": the student's own Lichess games are analysed locally with Stockfish; positions where
// the student's move lost a lot become personal puzzles ("find the better move"). The answer is
// checked by the engine, so any move about as good as the best one counts.
import { Chess } from 'chess.js';
import { h, clear, toast, fmtDate } from '../../core/dom.js';
import { Board, localSan } from '../../core/board.js';
import { store } from '../../core/store.js';
import { activity } from '../../core/activity.js';
import { analyse, cancel, PRIORITY } from '../../core/engine.js';
import { winPct } from '../gtm/scoring.js';

const api = window.api;
export const DEPTH = 12;
export const MISTAKE = 15;      // win-% points lost by the student's move to count as a mistake
export const BLUNDER = 30;
export const MIN_BEFORE = 35;   // positions already lost are not interesting
export const SKIP_PLIES = 8;
export const PER_GAME = 5;
export const ACCEPT_LOSS = 4;   // an answer this close to the best move counts as correct

// ---------- Lichess export (ndjson) ----------
export function parseLichessNdjson(text, user) {
  const me = String(user).toLowerCase();
  const out = [];
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    let g; try { g = JSON.parse(line); } catch { continue; }
    if (!g || !g.id || g.variant !== 'standard' || !g.moves) continue;
    const w = g.players && g.players.white, b = g.players && g.players.black;
    const wn = (w && w.user && w.user.name) || (w && w.aiLevel ? `Stockfish ${w.aiLevel}` : '?');
    const bn = (b && b.user && b.user.name) || (b && b.aiLevel ? `Stockfish ${b.aiLevel}` : '?');
    const color = wn.toLowerCase() === me ? 'w' : bn.toLowerCase() === me ? 'b' : null;
    if (!color) continue;
    const c = new Chess();
    const ucis = [];
    let ok = true;
    for (const san of g.moves.split(' ')) { try { const m = c.move(san); ucis.push(m.from + m.to + (m.promotion || '')); } catch { ok = false; break; } }
    if (!ok || ucis.length < 12) continue;
    out.push({ id: g.id, color, white: wn, black: bn, whiteElo: w && w.rating, blackElo: b && b.rating, speed: g.speed || '', createdAt: g.createdAt || Date.now(),
      result: g.winner ? (g.winner === 'white' ? '1-0' : '0-1') : g.status === 'draw' || g.status === 'stalemate' ? '1/2-1/2' : '*', ucis });
  }
  return out;
}

// cps[i] = evaluation (centipawns, side to move at position i) of the position before ply i.
// Returns the student's worst moves as puzzle candidates.
export function findMistakes(game, cps, best) {
  const found = [];
  for (let i = SKIP_PLIES; i < game.ucis.length; i++) {
    const mover = i % 2 === 0 ? 'w' : 'b';
    if (mover !== game.color || cps[i] == null || cps[i + 1] == null) continue;
    if (best[i] && best[i].uci === game.ucis[i]) continue;
    const before = winPct(cps[i]);
    const after = winPct(-cps[i + 1]);
    const loss = before - after;
    if (loss >= MISTAKE && before >= MIN_BEFORE) found.push({ ply: i, loss, before, after });
  }
  return found.sort((a, b) => b.loss - a.loss).slice(0, PER_GAME).sort((a, b) => a.ply - b.ply);
}

const fensOf = (ucis) => { const c = new Chess(); const f = [c.fen()]; for (const u of ucis) { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); f.push(c.fen()); } return f; };

// ---------- storage ----------
export const mine = {
  data: null,
  async load() { this.data = await api.read('mygames/data', { user: '', games: {}, puzzles: {} }); return this.data; },
  save() { return api.write('mygames/data', this.data); },
};

// Analyse one game (every position once, depth DEPTH), turn mistakes into puzzles.
async function analyseGame(g, stop) {
  const fens = fensOf(g.ucis);
  const cps = [], best = [];
  for (let i = 0; i <= g.ucis.length; i++) {
    if (stop()) return null;
    const c = new Chess(fens[i]);
    if (c.isGameOver()) { cps[i] = c.isCheckmate() ? -100000 : 0; continue; }
    const r = await analyse({ fen: fens[i], depth: DEPTH, multipv: 1, tag: 'mygames' }, PRIORITY.BACKGROUND);
    const l = r.lines[0];
    cps[i] = l ? l.cp : 0;
    best[i] = l ? { uci: l.uci, pv: l.pv } : null;
  }
  return findMistakes(g, cps, best).map((m) => ({
    id: `${g.id}-${m.ply}`, gameId: g.id, ply: m.ply, fen: fens[m.ply], played: g.ucis[m.ply], lastMove: g.ucis[m.ply - 1],
    best: best[m.ply].uci, pv: best[m.ply].pv, bestCp: cps[m.ply], loss: Math.round(m.loss), kind: m.loss >= BLUNDER ? 'Büyük hata' : 'Hata',
    color: g.color, opponent: g.color === 'w' ? g.black : g.white, date: g.createdAt, status: null,
  }));
}

const san = (fen, uci) => { try { const c = new Chess(fen); const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' }); return localSan(m.san, store.settings.turkishNotation !== false); } catch { return uci; } };
const pvText = (fen, pv) => { const c = new Chess(fen); const out = []; for (const u of (pv || []).slice(0, 6)) { try { const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }); out.push(localSan(m.san, store.settings.turkishNotation !== false)); } catch { break; } } return out.join(' '); };

// ---------- UI ----------
let job = null; // background analysis shared across visits: { running, done, total, stop }

export async function showMyGames(body, { setActive }) {
  const d = await mine.load();
  if (!d.user) { const l = await api.read('lichess', null); if (l && l.username) d.user = l.username; } // web: linked Lichess account
  let view = null;
  setActive(() => { if (view && view.destroy) view.destroy(); });

  const draw = () => {
    const puzzles = Object.values(d.puzzles).sort((a, b) => (a.status === 'ok') - (b.status === 'ok') || b.date - a.date || a.ply - b.ply);
    const games = Object.values(d.games);
    const solved = puzzles.filter((p) => p.status === 'ok').length;
    const userIn = h('input.search', { placeholder: 'Lichess kullanıcı adınız', value: d.user, style: { maxWidth: '240px' } });
    const progress = h('span.muted');
    const tick = () => { if (!progress.isConnected) return; progress.textContent = job && job.running ? `Analiz ediliyor: ${job.done}/${job.total} oyun…` : ''; if (job && job.running) setTimeout(tick, 500); };
    clear(body).append(h('div.sets-page',
      h('div.toolbar', userIn,
        h('button.btn.primary', { onclick: () => fetchGames(userIn.value.trim()) }, games.length ? 'Yeni oyunları getir' : 'Oyunlarımı getir'),
        job && job.running ? h('button.btn.small', { onclick: () => { job.stop = true; cancel('mygames'); } }, 'Durdur') : null,
        progress, h('span.spacer'),
        games.length ? h('span.muted', `${games.length} oyun · ${puzzles.length} hata bulundu · ${solved} çözüldü`) : null),
      puzzles.length
        ? h('div.mg-grid', puzzles.map((p) => h('button.mg-card' + (p.status ? '.' + p.status : ''), { onclick: () => solve(p) },
          h('div.mg-kind' + (p.kind === 'Büyük hata' ? '.big' : ''), p.kind), h('div', h('b', `vs ${p.opponent}`)),
          h('div.muted.small', `${fmtDate(p.date)} · ${Math.floor(p.ply / 2) + 1}. hamle · ${p.color === 'w' ? 'Beyaz' : 'Siyah'}`),
          h('div.mg-status', p.status === 'ok' ? '✓ çözüldü' : p.status === 'fail' ? '✗ tekrar dene' : 'çözülmedi'))))
        : h('div.empty', h('div.big-icon', '🔎'), h('h3', 'Kendi oyunlarından öğren'),
          h('p', 'Lichess kullanıcı adınızı yazın. Son 30 oyununuz bu bilgisayardaki Stockfish ile incelenir; avantajı kaçırdığınız ya da kaybettiğiniz hamleler size özel bulmacaya dönüşür.'),
          h('p.muted', 'İnceleme oyun başına yaklaşık 5–15 saniye sürer. Bu sırada uygulamayı kullanmaya devam edebilirsiniz.'))));
    tick();
  };

  async function fetchGames(user) {
    if (!/^[\w-]{2,30}$/.test(user)) { toast('Geçerli bir Lichess kullanıcı adı yazın', 'error'); return; }
    if (job && job.running) { toast('İnceleme sürüyor'); return; }
    // another Lichess account: forget its games, but keep the tournament-game puzzles ("tg-…", from Turnuva Maçları)
    if (d.user && d.user.toLowerCase() !== user.toLowerCase()) {
      const keep = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k.startsWith('tg-')));
      d.games = keep(d.games); d.puzzles = keep(d.puzzles);
    }
    d.user = user;
    toast('Oyunlar Lichess\'ten alınıyor…');
    const r = await api.lichessGames(user, 30);
    if (r.error) { toast(r.error, 'error'); return; }
    const games = parseLichessNdjson(r.text, user).filter((g) => !d.games[g.id]);
    if (!games.length) { toast('Yeni oyun yok'); await mine.save(); draw(); return; }
    job = { running: true, done: 0, total: games.length, stop: false };
    draw();
    for (const g of games) {
      const ps = await analyseGame(g, () => job.stop).catch((e) => { console.warn(e); return null; });
      if (job.stop) break;
      d.games[g.id] = { id: g.id, white: g.white, black: g.black, color: g.color, createdAt: g.createdAt, result: g.result, speed: g.speed, mistakes: (ps || []).length };
      for (const p of ps || []) d.puzzles[p.id] = p;
      job.done++;
      await mine.save();
      if (body.isConnected && !view) draw();
    }
    job.running = false;
    if (body.isConnected && !view) draw();
    toast(`${job.done} oyun incelendi`, 'ok');
  }

  function solve(p) {
    const host = h('div.pz-host');
    clear(body).append(host);
    const status = h('div.pz-status');
    const info = h('div.panel.pz-info');
    const btns = h('div.controls');
    const boardHost = h('div.board-host');
    clear(host).append(h('div.pz-layout', h('div.gtm-center', boardHost, btns), h('div.pz-side', status, info)));
    const board = new Board(boardHost, { orientation: p.color === 'w' ? 'white' : 'black', onMove: (m) => check(m) });
    view = { destroy: () => { board.destroy(); cancel('mygames-check'); } };
    const box = (kind, t, s) => clear(status).append(h('div.pz-box.' + kind, h('div.pz-title', t), s ? h('div.pz-sub', s) : null));
    clear(info).append(h('div', h('b', `vs ${p.opponent}`), h('span.muted', ` · ${fmtDate(p.date)} · ${Math.floor(p.ply / 2) + 1}. hamle`)),
      h('div.muted', `Oyunda burada ${san(p.fen, p.played)} oynadınız (${p.kind.toLowerCase()}: kazanma şansınız ${p.loss} puan düştü).`),
      h('button.btn.small.ghost', { onclick: () => api.openExternal(`https://lichess.org/${p.gameId}#${p.ply}`) }, "Oyunu Lichess'te aç ↗"));
    board.setPosition(p.fen, { lastMove: p.lastMove, interactive: true, animate: false });
    box('turn', 'Daha iyisini bulun', `${p.color === 'w' ? 'Beyaz' : 'Siyah'} oynuyor.`);
    const back = () => { view.destroy(); view = null; draw(); };
    clear(btns).append(h('button.btn', { onclick: back }, '◂ Listeye dön'), h('button.btn', { onclick: () => finish(false, null) }, 'Çözümü göster'));
    let busy = false;
    async function check({ uci, fenAfter }) {
      if (busy) return;
      busy = true;
      board.setInteractive(false);
      let ok = uci === p.best;
      if (!ok && uci !== p.played) {
        box('wait', 'Hamleniz inceleniyor…');
        try {
          const r = await analyse({ fen: fenAfter, depth: DEPTH, multipv: 1, tag: 'mygames-check' }, PRIORITY.URGENT);
          const cp = r.lines[0] ? -r.lines[0].cp : -100000;
          ok = winPct(p.bestCp) - winPct(cp) <= ACCEPT_LOSS;
        } catch { ok = false; }
      }
      finish(ok, uci);
    }
    async function finish(ok, uci) {
      board.setInteractive(false);
      const prev = p.status;
      p.status = ok ? 'ok' : 'fail';
      p.tries = (p.tries || 0) + 1;
      d.puzzles[p.id] = p;
      await mine.save();
      if (uci && prev !== 'ok') activity.add('puzzles');
      board.setArrows([{ orig: p.best.slice(0, 2), dest: p.best.slice(2, 4), brush: 'green' }, { orig: p.played.slice(0, 2), dest: p.played.slice(2, 4), brush: 'red' }]);
      if (ok) box('good', '✓ Doğru!', uci === p.best ? 'Motorun en iyi hamlesini buldunuz.' : 'Bu hamle de en iyisi kadar iyi.');
      else box('bad', uci ? (uci === p.played ? '✗ Oyunda da bunu oynamıştınız' : '✗ Daha iyisi vardı') : 'Çözüm', '');
      info.append(h('div.mg-solution', h('div', 'En iyi hamle: ', h('b', san(p.fen, p.best))), p.pv && p.pv.length > 1 ? h('div.muted', 'Devamı: ', pvText(p.fen, p.pv)) : null));
      const nx = Object.values(d.puzzles).find((x) => x.status !== 'ok' && x.id !== p.id);
      clear(btns).append(...[h('button.btn', { onclick: back }, '◂ Listeye dön'),
        h('button.btn', { onclick: () => { view.destroy(); solve(p); } }, 'Tekrar dene'),
        nx ? h('button.btn.primary', { onclick: () => { view.destroy(); solve(nx); } }, 'Sonraki ▸') : null].filter(Boolean));
    }
  }

  draw();
}
