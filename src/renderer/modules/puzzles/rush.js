// Puzzle Rush and Puzzle Streak.
//   Rush:   3 lives. 3-minute, 5-minute or untimed ("Hayatta kal") runs; puzzles start easy and get harder.
//   Streak: no clock, the first mistake ends the run; one "skip" per run (as on Lichess).
// Ratings are not affected; solved puzzles count towards the daily goal. Records per mode.
import { Chess } from 'chess.js';
import { h, clear, toast, fmtDate } from '../../core/dom.js';
import { Board } from '../../core/board.js';
import { activity } from '../../core/activity.js';
import { pdata, pickFrom } from './data.js';

const api = window.api;

export const MODES = {
  // Difficulty climbs fast at first, then ever more slowly: start + gain * ln(1 + i / 5).
  rush3: { kind: 'rush', label: '3 dakika', minutes: 3, lives: 3, start: 600, gain: 480 },
  rush5: { kind: 'rush', label: '5 dakika', minutes: 5, lives: 3, start: 600, gain: 440 },
  survival: { kind: 'rush', label: 'Hayatta kal', minutes: 0, lives: 3, start: 600, gain: 440 },
  streak: { kind: 'streak', label: 'Streak', minutes: 0, lives: 1, start: 800, gain: 380, skips: 1 },
};
export const RUSH_KEYS = ['rush3', 'rush5', 'survival'];
const MAX_RATING = 2800;

export function rampTarget({ start, gain }, i) {
  return Math.min(MAX_RATING, Math.round(start + gain * Math.log(1 + i / 5)));
}

export function rampPuzzles(db, mode, count = 250, random = Math.random) {
  const seen = new Set(), out = [];
  for (let i = 0; i < count; i++) {
    const p = pickFrom(db, { target: rampTarget(mode, i), seen, random });
    if (!p) break;
    seen.add(p.id); out.push(p);
  }
  return out;
}

// Clock, lives and score of one run, independent of the UI.
export class SeqRun {
  constructor(mode, now = Date.now()) {
    const m = MODES[mode];
    this.mode = mode; this.cfg = m;
    this.left = m.minutes ? m.minutes * 60000 : Infinity;
    this.last = now;
    this.lives = m.lives; this.skips = m.skips || 0;
    this.score = 0; this.errors = 0; this.maxRating = 0; this.combo = 0; this.bestCombo = 0;
    this.results = [];
    this.over = false;
  }
  tick(now = Date.now()) {
    if (this.over || this.left === Infinity) return this.left;
    this.left -= now - this.last; this.last = now;
    if (this.left <= 0) { this.left = 0; this.over = true; }
    return this.left;
  }
  solved(p, now = Date.now()) {
    this.tick(now);
    this.score++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.maxRating = Math.max(this.maxRating, p.rating || 0);
    this.results.push({ id: p.id, rating: p.rating, ok: true });
  }
  wrong(p, now = Date.now()) {
    this.tick(now);
    this.errors++; this.combo = 0; this.lives--;
    this.results.push({ id: p.id, rating: p.rating, ok: false });
    if (this.lives <= 0) this.over = true;
  }
  skip(p) {
    if (this.skips <= 0) return false;
    this.skips--;
    this.results.push({ id: p.id, rating: p.rating, ok: null });
    return true;
  }
  summary() {
    return { mode: this.mode, score: this.score, errors: this.errors, bestCombo: this.bestCombo, maxRating: this.maxRating, results: this.results };
  }
}

export const rushStore = {
  async load() { const s = await api.read('puzzles/rush', {}); return { best: s.best || {}, runs: s.runs || [] }; },
  async addRun(sum) {
    const s = await this.load();
    const prev = s.best[sum.mode];
    const record = !prev || sum.score > prev.score;
    if (record) s.best[sum.mode] = { score: sum.score, at: Date.now() };
    s.runs.unshift({ t: Date.now(), mode: sum.mode, score: sum.score, errors: sum.errors, maxRating: sum.maxRating });
    s.runs = s.runs.slice(0, 60);
    await api.write('puzzles/rush', s);
    return { record, prev: prev ? prev.score : 0 };
  },
};

const fmtLeft = (ms) => { if (ms === Infinity) return '∞'; const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const hearts = (n, max) => '❤'.repeat(Math.max(0, n)) + '♡'.repeat(Math.max(0, max - n));

// ---------- start screens ----------
export async function showRush(body, { setActive }) {
  const st = await rushStore.load();
  const lastRush = st.runs.find((r) => RUSH_KEYS.includes(r.mode));
  let mode = lastRush ? lastRush.mode : 'rush3';
  const draw = () => {
    clear(body).append(h('div.storm-start',
      h('div.storm-hero', h('div.storm-bolt', '🏃'), h('h2', 'Puzzle Rush'),
        h('p.muted', '3 canınız var. Bulmacalar kolaydan başlar ve gittikçe zorlaşır. Her yanlış bir can götürür; canlar bitince ya da süre dolunca oyun biter. "Hayatta kal" modunda süre yoktur. Puanınız değişmez.')),
      h('div.seg.storm-seg', RUSH_KEYS.map((k) => h('button' + (k === mode ? '.active' : ''), { onclick: () => { mode = k; draw(); } }, MODES[k].label))),
      h('button.btn.primary.big.storm-go', { onclick: () => runSeq(body, mode, { setActive, back: () => showRush(body, { setActive }) }) }, 'Başla'),
      h('div.storm-records', RUSH_KEYS.map((k) => h('div.card', h('div.card-k', `${MODES[k].label} rekoru`), h('div.card-v', st.best[k] ? st.best[k].score : '–'),
        h('div.muted', st.best[k] ? fmtDate(st.best[k].at) : 'henüz yok')))),
      recentRuns(st.runs.filter((r) => RUSH_KEYS.includes(r.mode)))));
  };
  draw();
}

export async function showStreak(body, { setActive }) {
  const st = await rushStore.load();
  const b = st.best.streak;
  clear(body).append(h('div.storm-start',
    h('div.storm-hero', h('div.storm-bolt', '🔥'), h('h2', 'Puzzle Streak'),
      h('p.muted', 'Süre yok, acele etmeyin. Her doğru bulmacadan sonra bir sonraki biraz daha zor. İlk yanlışta seri biter. Bir kez "Atla" hakkınız var. Puanınız değişmez.')),
    h('button.btn.primary.big.storm-go', { onclick: () => runSeq(body, 'streak', { setActive, back: () => showStreak(body, { setActive }) }) }, 'Başla'),
    h('div.storm-records', h('div.card', h('div.card-k', 'En uzun seri'), h('div.card-v', b ? b.score : '–'), h('div.muted', b ? fmtDate(b.at) : 'henüz yok'))),
    recentRuns(st.runs.filter((r) => r.mode === 'streak'))));
}

function recentRuns(runs) {
  if (!runs.length) return null;
  return h('div.panel', h('div.panel-title', 'Son denemeler'),
    h('table.kv', runs.slice(0, 8).map((r) => h('tr', h('td', fmtDate(r.t)), h('td', MODES[r.mode] ? MODES[r.mode].label : r.mode), h('td', h('b', r.score), ' bulmaca'),
      h('td.muted', `${r.errors} hata · en zor ${r.maxRating || '–'}`)))));
}

// ---------- a run ----------
async function runSeq(body, mode, { setActive, back }) {
  const cfg = MODES[mode];
  let db;
  if (!pdata.db) clear(body).append(h('div.empty', 'Bulmacalar yükleniyor…'));
  try { db = await pdata.loadDb(); } catch (e) { clear(body).append(h('div.empty', (e.message || 'Bulmacalar yüklenemedi.') + ' Sekmeye tekrar dokunup yeniden dene.')); return; }
  const list = rampPuzzles(db, cfg);
  const R = new SeqRun(mode);
  const boardHost = h('div.board-host');
  const clock = h('div.storm-clock', fmtLeft(R.left));
  const score = h('div.storm-score', '0');
  const lives = h('div.rush-lives', cfg.kind === 'rush' ? hearts(R.lives, cfg.lives) : '');
  const flash = h('div.storm-flash');
  const hist = h('div.storm-hist');
  const skipBtn = cfg.skips ? h('button.btn', { onclick: () => skip() }, 'Atla (1)') : null;
  clear(body).append(h('div.storm-layout',
    h('div.gtm-center', boardHost),
    h('div.storm-side', cfg.minutes ? clock : null, lives, h('div.storm-label', cfg.kind === 'streak' ? 'seri' : 'çözülen'), score, flash, hist,
      h('div.btn-row', skipBtn, h('button.btn.ghost', { onclick: () => end() }, 'Bitir')))));
  let idx = -1, p = null, step = 0, fens = [], ended = false, solverColor = 'w';
  const board = new Board(boardHost, { onMove: (m) => onMove(m) });
  const timer = cfg.minutes ? setInterval(() => {
    if (!body.isConnected) { clearInterval(timer); return; }
    R.tick();
    clock.textContent = fmtLeft(R.left);
    clock.classList.toggle('low', R.left < 20000);
    if (R.over) end();
  }, 100) : null;
  setActive(() => { if (timer) clearInterval(timer); ended = true; });
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
    setTimeout(() => { if (!ended) { board.setPosition(fens[1], { lastMove: p.moves[0] }); step = 1; yourTurn(); } }, 300);
  }
  function yourTurn() { window.__storm = { moves: p.moves, step, color: solverColor }; board.setPosition(fens[step], { lastMove: p.moves[step - 1], interactive: true, animate: false }); }
  function onMove({ uci, fenAfter }) {
    if (ended || !p) return;
    const isLast = step === p.moves.length - 1;
    if (uci === p.moves[step] || (isLast && new Chess(fenAfter).isCheckmate())) {
      step++;
      if (step >= p.moves.length) {
        R.solved(p);
        activity.add('puzzles');
        score.textContent = R.score;
        hist.prepend(h('span.ok', { title: `${p.rating}` }, '✓'));
        say('✓', 'good');
        return nextPuzzle();
      }
      board.setPosition(fenAfter, { lastMove: uci });
      setTimeout(() => { if (ended) return; board.setPosition(fens[step + 1], { lastMove: p.moves[step] }); step++; yourTurn(); }, 200);
    } else {
      R.wrong(p);
      hist.prepend(h('span.bad', { title: `${p.rating}` }, '✗'));
      if (cfg.kind === 'rush') lives.textContent = hearts(R.lives, cfg.lives);
      say(R.over ? 'Bitti' : cfg.kind === 'rush' ? '−1 can' : '✗', 'bad');
      if (R.over) return showSolutionThenEnd();
      nextPuzzle();
    }
  }
  // Streak/Rush end on a mistake: show the correct move briefly so the student sees what was missed.
  function showSolutionThenEnd() {
    board.setInteractive(false);
    const u = p.moves[step];
    board.setPosition(fens[step + 1], { lastMove: u });
    setTimeout(end, 1400);
  }
  function skip() {
    if (ended || !p || !R.skip(p)) return;
    hist.prepend(h('span', { title: `${p.rating}` }, '↷'));
    if (skipBtn) { skipBtn.disabled = true; skipBtn.textContent = 'Atla (0)'; }
    say('Atlandı', '');
    nextPuzzle();
  }

  async function end() {
    if (ended) return;
    ended = true;
    if (timer) clearInterval(timer);
    board.setInteractive(false);
    const sum = R.summary();
    const rec = await rushStore.addRun(sum);
    if (api.scoreRun && sum.score > 0) api.scoreRun(mode, sum.score);
    if (rec.record && sum.score > 0) toast(`Yeni rekor: ${sum.score}!`, 'ok');
    const title = cfg.kind === 'streak' ? `${sum.score} bulmacalık seri` : `${sum.score} bulmaca`;
    clear(body).append(h('div.storm-end',
      h('div.storm-hero', h('div.storm-bolt', rec.record && sum.score ? '🏆' : cfg.kind === 'streak' ? '🔥' : '🏃'), h('h2', title),
        h('p.muted', rec.record && sum.score ? `Yeni ${cfg.label} rekoru! (önceki: ${rec.prev})` : `${cfg.label} rekorunuz: ${Math.max(rec.prev, sum.score)}`)),
      h('div.cards',
        h('div.card', h('div.card-k', 'Çözülen'), h('div.card-v', sum.score)),
        h('div.card', h('div.card-k', 'Hata'), h('div.card-v', sum.errors)),
        h('div.card', h('div.card-k', 'En zor çözülen'), h('div.card-v', sum.maxRating || '–'))),
      h('div.panel', h('div.panel-title', 'Bulmacalar'), h('div.storm-results', sum.results.map((r) =>
        h('button.storm-res.' + (r.ok ? 'ok' : r.ok === null ? 'skip' : 'bad'), { title: "Lichess'te aç", onclick: () => api.openExternal(`https://lichess.org/training/${r.id}`) },
          r.ok ? '✓ ' : r.ok === null ? '↷ ' : '✗ ', r.rating)))),
      h('div.btn-row', h('button.btn.primary.big', { onclick: () => runSeq(body, mode, { setActive, back }) }, 'Tekrar oyna'),
        h('button.btn.big', { onclick: back }, 'Ana ekran'))));
  }

  nextPuzzle();
}
