// Puzzle Storm: as many puzzles as possible in 3 or 5 minutes. Puzzles start easy and get harder;
// a wrong move costs 10 seconds and skips the puzzle; streaks of correct puzzles ("combo") add time.
// Ratings are not affected; solved puzzles count towards the daily goal. Records per duration.
import { Chess } from 'chess.js';
import { h, clear, toast, fmtDate } from '../../core/dom.js';
import { Board } from '../../core/board.js';
import { activity } from '../../core/activity.js';
import { pdata, pickFrom } from './data.js';

const api = window.api;
export const DURATIONS = [3, 5];
export const WRONG_PENALTY = 10000;
// combo → bonus seconds when the combo reaches that length (as on Lichess)
export const COMBO_BONUS = [[5, 3], [12, 5], [20, 7], [30, 10]];
// Difficulty climbs fast at first, then ever more slowly (same curve as Rush/Streak).
const START_RATING = 700, GAIN = 520, MAX_RATING = 2700;
export const stormTarget = (i) => Math.min(MAX_RATING, Math.round(START_RATING + GAIN * Math.log(1 + i / 5)));

// Ramp of puzzles from easy to hard. Pure apart from the random source.
export function stormPuzzles(db, count = 140, random = Math.random) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = pickFrom(db, { target: stormTarget(i), seen, random });
    if (!p) break;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

// The clock and score of one run, independent of the UI.
export class StormRun {
  constructor(minutes, now = Date.now()) {
    this.minutes = minutes;
    this.left = minutes * 60000;
    this.last = now;
    this.score = 0; this.errors = 0; this.moves = 0; this.goodMoves = 0;
    this.combo = 0; this.bestCombo = 0; this.maxRating = 0;
    this.results = []; // { id, rating, ok }
    this.over = false;
  }
  tick(now = Date.now()) {
    if (this.over) return 0;
    this.left -= now - this.last; this.last = now;
    if (this.left <= 0) { this.left = 0; this.over = true; }
    return this.left;
  }
  goodMove() { this.moves++; this.goodMoves++; }
  // A puzzle finished correctly: score, combo and maybe bonus seconds. Returns the bonus (ms).
  solved(p, now = Date.now()) {
    this.tick(now);
    this.score++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.maxRating = Math.max(this.maxRating, p.rating || 0);
    this.results.push({ id: p.id, rating: p.rating, ok: true });
    const b = COMBO_BONUS.find(([c]) => c === this.combo);
    const bonus = b ? b[1] * 1000 : 0;
    this.left += bonus;
    return bonus;
  }
  wrong(p, now = Date.now()) {
    this.tick(now);
    this.moves++; this.errors++; this.combo = 0;
    this.results.push({ id: p.id, rating: p.rating, ok: false });
    this.left = Math.max(0, this.left - WRONG_PENALTY);
    if (this.left === 0) this.over = true;
  }
  summary() {
    return { minutes: this.minutes, score: this.score, errors: this.errors, bestCombo: this.bestCombo, maxRating: this.maxRating,
      accuracy: this.moves ? Math.round((100 * this.goodMoves) / this.moves) : 0, results: this.results };
  }
}

export const stormStore = {
  async load() { const s = await api.read('puzzles/storm', {}); return { best: s.best || {}, runs: s.runs || [] }; },
  async addRun(sum) {
    const s = await this.load();
    const key = String(sum.minutes);
    const prev = s.best[key];
    const record = !prev || sum.score > prev.score;
    if (record) s.best[key] = { score: sum.score, at: Date.now() };
    s.runs.unshift({ t: Date.now(), minutes: sum.minutes, score: sum.score, errors: sum.errors, bestCombo: sum.bestCombo, maxRating: sum.maxRating });
    s.runs = s.runs.slice(0, 50);
    await api.write('puzzles/storm', s);
    return { record, prev: prev ? prev.score : 0 };
  },
};

const fmtLeft = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------- UI ----------
export async function showStorm(body, { setActive }) {
  const st = await stormStore.load();
  let minutes = st.runs[0] ? st.runs[0].minutes : 3;
  const draw = () => {
    clear(body).append(h('div.storm-start',
      h('div.storm-hero', h('div.storm-bolt', '⚡'), h('h2', 'Puzzle Storm'),
        h('p.muted', 'Süre bitene kadar olabildiğince çok bulmaca çözün. Bulmacalar kolaydan başlar, gittikçe zorlaşır. Yanlış hamle 10 saniye götürür ve sonraki bulmacaya geçilir. Art arda doğrular ek süre kazandırır. Puanınız değişmez.')),
      h('div.seg.storm-seg', DURATIONS.map((m) => h('button' + (m === minutes ? '.active' : ''), { onclick: () => { minutes = m; draw(); } }, `${m} dakika`))),
      h('button.btn.primary.big.storm-go', { onclick: () => run(body, minutes, setActive) }, 'Başla'),
      h('div.storm-records', DURATIONS.map((m) => h('div.card', h('div.card-k', `${m} dakika rekoru`), h('div.card-v', st.best[m] ? st.best[m].score : '–'),
        h('div.muted', st.best[m] ? fmtDate(st.best[m].at) : 'henüz yok')))),
      st.runs.length ? h('div.panel', h('div.panel-title', 'Son denemeler'),
        h('table.kv', st.runs.slice(0, 8).map((r) => h('tr', h('td', fmtDate(r.t)), h('td', `${r.minutes} dk`), h('td', h('b', r.score), ' bulmaca'),
          h('td.muted', `${r.errors} hata · en uzun seri ${r.bestCombo} · en zor ${r.maxRating || '–'}`))))) : null));
  };
  draw();
}

async function run(body, minutes, setActive) {
  let db;
  if (!pdata.db) clear(body).append(h('div.empty', 'Bulmacalar yükleniyor…'));
  try { db = await pdata.loadDb(); } catch (e) { clear(body).append(h('div.empty', (e.message || 'Bulmacalar yüklenemedi.') + ' Sekmeye tekrar dokunup yeniden dene.')); return; }
  const list = stormPuzzles(db);
  const runState = new StormRun(minutes);
  const boardHost = h('div.board-host');
  const clock = h('div.storm-clock', fmtLeft(runState.left));
  const score = h('div.storm-score', '0');
  const combo = h('div.storm-combo');
  const flash = h('div.storm-flash');
  const hist = h('div.storm-hist');
  clear(body).append(h('div.storm-layout',
    h('div.gtm-center', boardHost),
    h('div.storm-side', clock, h('div.storm-label', 'çözülen'), score, combo, flash, hist,
      h('button.btn.ghost', { onclick: () => end() }, 'Bitir'))));
  let idx = -1, p = null, step = 0, fens = [], ended = false, solverColor = 'w';
  const board = new Board(boardHost, { onMove: (m) => onMove(m), premove: true });
  const timer = setInterval(() => {
    if (!body.isConnected) { clearInterval(timer); return; }
    runState.tick();
    clock.textContent = fmtLeft(runState.left);
    clock.classList.toggle('low', runState.left < 20000);
    if (runState.over) end();
  }, 100);
  setActive(() => { clearInterval(timer); ended = true; });

  const drawCombo = () => {
    const next = COMBO_BONUS.find(([c]) => c > runState.combo);
    clear(combo).append(h('div.storm-combo-n', `Seri ${runState.combo}`),
      next ? h('div.storm-combo-bar', h('span', { style: { width: `${(100 * runState.combo) / next[0]}%` } })) : null,
      next ? h('div.muted.small', `${next[0]}'de +${next[1]} sn`) : h('div.muted.small', 'En yüksek seri!'));
  };
  const say = (text, kind) => { flash.textContent = text; flash.className = 'storm-flash ' + (kind || ''); };

  function nextPuzzle() {
    if (ended) return;
    idx++;
    p = list[idx];
    if (!p) return end();
    fens = [p.fen];
    const c = new Chess(p.fen);
    for (const u of p.moves) { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); fens.push(c.fen()); }
    solverColor = p.fen.split(' ')[1] === 'w' ? 'b' : 'w';
    board.setOrientation(solverColor === 'w' ? 'white' : 'black');
    board.setPosition(p.fen, { animate: false });
    step = 0;
    setTimeout(() => { if (!ended) { board.setPosition(fens[1], { lastMove: p.moves[0] }); step = 1; yourTurn(); } }, 250);
  }
  function yourTurn() { window.__storm = { moves: p.moves, step, color: solverColor }; board.setPosition(fens[step], { lastMove: p.moves[step - 1], interactive: true, animate: false }); }
  function onMove({ uci, fenAfter }) {
    if (ended || !p) return;
    const isLast = step === p.moves.length - 1;
    if (uci === p.moves[step] || (isLast && new Chess(fenAfter).isCheckmate())) {
      runState.goodMove();
      step++;
      if (step >= p.moves.length) {
        const bonus = runState.solved(p);
        activity.add('puzzles');
        score.textContent = runState.score;
        hist.prepend(h('span.ok', { title: `${p.rating}` }, '✓'));
        say(bonus ? `+${bonus / 1000} sn!` : '✓', 'good');
        drawCombo();
        return nextPuzzle();
      }
      board.setPosition(fenAfter, { lastMove: uci, premove: true });
      setTimeout(() => { if (ended) return; board.setPosition(fens[step + 1], { lastMove: p.moves[step] }); step++; yourTurn(); }, 150);
    } else {
      runState.wrong(p);
      hist.prepend(h('span.bad', { title: `${p.rating}` }, '✗'));
      say('−10 sn', 'bad');
      drawCombo();
      if (runState.over) return end();
      nextPuzzle();
    }
  }

  async function end() {
    if (ended) return;
    ended = true;
    clearInterval(timer);
    board.setInteractive(false);
    const sum = runState.summary();
    const rec = await stormStore.addRun(sum);
    if (window.api.scoreRun && sum.score > 0) window.api.scoreRun(`storm${minutes}`, sum.score);
    if (rec.record && sum.score > 0) toast(`Yeni rekor: ${sum.score}!`, 'ok');
    clear(body).append(h('div.storm-end',
      h('div.storm-hero', h('div.storm-bolt', rec.record && sum.score ? '🏆' : '⚡'), h('h2', `${sum.score} bulmaca`),
        h('p.muted', rec.record && sum.score ? `Yeni ${minutes} dakika rekoru! (önceki: ${rec.prev})` : `${minutes} dakika rekorunuz: ${Math.max(rec.prev, sum.score)}`)),
      h('div.cards',
        h('div.card', h('div.card-k', 'Doğruluk'), h('div.card-v', `%${sum.accuracy}`)),
        h('div.card', h('div.card-k', 'Hata'), h('div.card-v', sum.errors)),
        h('div.card', h('div.card-k', 'En uzun seri'), h('div.card-v', sum.bestCombo)),
        h('div.card', h('div.card-k', 'En zor çözülen'), h('div.card-v', sum.maxRating || '–'))),
      h('div.panel', h('div.panel-title', 'Bulmacalar'), h('div.storm-results', sum.results.map((r) =>
        h('button.storm-res.' + (r.ok ? 'ok' : 'bad'), { title: "Lichess'te aç", onclick: () => api.openExternal(`https://lichess.org/training/${r.id}`) }, r.ok ? '✓ ' : '✗ ', r.rating)))),
      h('div.btn-row', h('button.btn.primary.big', { onclick: () => run(body, minutes, setActive) }, 'Tekrar oyna'),
        h('button.btn.big', { onclick: () => showStorm(body, { setActive }) }, 'Storm ana ekranı'))));
  }

  drawCombo();
  nextPuzzle();
}
