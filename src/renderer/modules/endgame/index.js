// Oyunsonu: ready-made lessons against perfect defence (Lichess tablebase), endgame puzzles,
// and the coaches' own positions. Progress: kv 'endgame' { lessons: { id: { stars, done, tries } } }.
import { Chess } from 'chess.js';
import { h, clear, toast } from '../../core/dom.js';
import { Board, localSan } from '../../core/board.js';
import { activity } from '../../core/activity.js';
import { CHAPTERS, LESSONS, GOAL_TEXT, lessonById } from './curriculum.js';
import { probe, gameState, stars as scoreStars, HOLD_MOVES } from './judge.js';

const api = window.api;
export const END_THEMES = ['pawnEndgame', 'rookEndgame', 'queenEndgame', 'bishopEndgame', 'knightEndgame', 'queenRookEndgame', 'endgame'];
const THEME_TR = { pawnEndgame: 'Piyon oyunsonu', rookEndgame: 'Kale oyunsonu', queenEndgame: 'Vezir oyunsonu', bishopEndgame: 'Fil oyunsonu', knightEndgame: 'At oyunsonu', queenRookEndgame: 'Vezir-kale oyunsonu', endgame: 'Karışık oyunsonu' };

export const progress = {
  data: null,
  async load() { if (!this.data) { this.data = await api.read('endgame', {}); this.data.lessons = this.data.lessons || {}; } return this.data; },
  get(id) { return (this.data && this.data.lessons[id]) || null; },
  async record(id, st) {
    await this.load();
    const cur = this.data.lessons[id] || { stars: 0, tries: 0 };
    cur.tries = (cur.tries || 0) + 1;
    if (st > (cur.stars || 0)) cur.stars = st;
    cur.done = cur.done || Date.now();
    cur.last = Date.now();
    this.data.lessons[id] = cur;
    await api.write('endgame', this.data);
  },
};
const starText = (n) => '★'.repeat(n || 0) + '☆'.repeat(3 - (n || 0));

// ---------- the player ----------
// lesson: { id, title, fen, goal, text, oppFirst }
export function playLesson(root, lesson, { onBack, onNext, backLabel = 'Derslere dön' } = {}) {
  const startFen = lesson.fen;
  const student = lesson.oppFirst ? (startFen.split(' ')[1] === 'w' ? 'b' : 'w') : startFen.split(' ')[1];
  const engine = api.analyse ? (req, pr) => api.analyse(req, pr) : null;
  const st = { fen: startFen, history: [], mistakes: 0, hints: 0, moves: 0, par: null, busy: false, over: false };
  const status = h('div.eg-status');
  const info = h('div.eg-info.muted.small');
  const movesEl = h('div.eg-moves.muted.small');
  const boardHost = h('div.eg-board');
  const btn = (label, fn, cls = '') => h('button.btn.small' + cls, { onclick: fn }, label);
  const undoBtn = btn('↶ Geri al', () => undo());
  const hintBtn = btn('💡 İpucu', () => hint());
  const resetBtn = btn('↺ Baştan', () => restart());
  const side = h('div.eg-side',
    h('div.eg-goal', h('span.chip', GOAL_TEXT[lesson.goal]), ' ', h('b', student === 'w' ? 'Beyazsın' : 'Siyahsın')),
    lesson.text ? h('p.eg-text', lesson.text) : null,
    status, info, movesEl,
    h('div.row-btns', undoBtn, hintBtn, resetBtn),
    h('div.row-btns', onBack ? btn('◂ ' + backLabel, () => { destroy(); onBack(); }, '.ghost') : null));
  clear(root).append(h('div.eg-play', h('div.eg-head', h('h3', lesson.title)), h('div.eg-layout', boardHost, side)));
  const board = new Board(boardHost, { orientation: student === 'w' ? 'white' : 'black', onMove: (m) => onStudentMove(m) });
  setTimeout(() => board.refresh(), 60);
  const say = (text, kind = '') => { status.className = 'eg-status' + (kind ? ' ' + kind : ''); status.textContent = text; };
  const san = [];
  const showMoves = () => { movesEl.textContent = san.length ? san.join(' ') : ''; };

  async function begin() {
    st.fen = startFen; st.history = []; st.mistakes = 0; st.hints = 0; st.moves = 0; st.over = false; san.length = 0; showMoves();
    board.setArrows([]);
    board.setPosition(startFen, { interactive: false });
    say('Konum hazırlanıyor…');
    const p0 = await probe(startFen, { engine });
    if (p0 && lesson.goal === 'mate' && p0.dtm && !lesson.oppFirst) st.par = Math.ceil(p0.dtm * 1.3) + 2;
    info.textContent = p0 ? (p0.source === 'tablebase' ? 'Rakip kusursuz savunuyor (oyunsonu tablosu).' : 'Rakip: Stockfish.') : 'İnternet bağlantısı yok: değerlendirme yapılamıyor.';
    if (lesson.oppFirst) await opponentMove();
    else yourTurn();
  }
  function yourTurn() {
    board.setPosition(st.fen, { interactive: true, lastMove: st.lastMove });
    say(st.moves ? 'Sıra sende.' : (lesson.goal === 'draw' ? `Sıra sende. ${HOLD_MOVES} hamle dayan ya da beraberliği garantile.` : 'Sıra sende.'));
  }

  async function onStudentMove(m) {
    if (st.over) return;
    board.setArrows([]);
    st.history.push({ fen: st.fen, san: san.length, lastMove: st.lastMove });
    st.fen = m.fenAfter; st.lastMove = m.uci; st.moves++;
    san.push(localSan(m.san)); showMoves();
    const gs = gameState(st.fen);
    if (gs === 'mate') return finish(true, 'Mat! 🎉');
    if (gs === 'stalemate') return lesson.goal === 'draw' ? finish(true, 'Pat: beraberlik!') : mistake('Pat oldu! Rakibin hiç hamlesi kalmadı, oyun berabere bitti.');
    if (gs === 'insufficient') return lesson.goal === 'draw' ? finish(true, 'Mat edecek taş kalmadı: beraberlik!') : mistake('Mat edecek taş kalmadı.');
    say('Rakip düşünüyor…');
    const p = await probe(st.fen, { engine });
    if (p) {
      const mine = p.result === 'loss' ? 'win' : p.result === 'win' ? 'loss' : 'draw';
      if ((lesson.goal === 'mate' || lesson.goal === 'win') && mine !== 'win') return mistake(mine === 'draw' ? 'Bu hamleyle kazanç kaçtı: konum artık berabere.' : 'Bu hamleyle konum kaybedildi.');
      if (lesson.goal === 'draw' && mine === 'loss') return mistake('Bu hamleyle konum kaybedildi.');
      const promoted = m.uci.length === 5;
      if (lesson.goal === 'win' && promoted && mine === 'win') return finish(true, 'Piyon terfi etti, kazanç garanti! 🎉');
      if (lesson.goal === 'draw' && st.moves >= HOLD_MOVES) return finish(true, `${HOLD_MOVES} hamle dayandın: beraberlik! 🎉`);
    }
    await opponentMove(p);
  }

  async function opponentMove(pre) {
    const p = pre || (await probe(st.fen, { engine }));
    if (!p || !p.best.length) { say('Rakibin hamlesi bulunamadı (bağlantı?).', 'bad'); board.setPosition(st.fen, { interactive: false }); return; }
    await new Promise((r) => setTimeout(r, 350));
    const mv = p.best[0];
    const c = new Chess(st.fen);
    const res = c.move({ from: mv.uci.slice(0, 2), to: mv.uci.slice(2, 4), promotion: mv.uci[4] || undefined });
    st.fen = c.fen(); st.lastMove = mv.uci; san.push(localSan(res.san)); showMoves();
    board.setPosition(st.fen, { lastMove: mv.uci });
    const gs = gameState(st.fen);
    if (gs === 'mate') return finish(false, 'Mat oldun. Baştan dene.');
    if (gs === 'stalemate' || gs === 'insufficient') return lesson.goal === 'draw' ? finish(true, 'Beraberlik! 🎉') : finish(false, 'Oyun berabere bitti. Baştan dene.');
    // the opponent promoted / the position changed hands: judge from the student's side
    yourTurn();
  }

  function mistake(text) {
    st.mistakes++;
    say(text + ' Hamlen geri alındı, tekrar dene.', 'bad');
    board.setPosition(st.fen, { interactive: false, lastMove: st.lastMove });
    setTimeout(() => { if (!st.over) { undo(true); say(text + ' Tekrar dene.', 'bad'); } }, 1400);
  }

  function undo(silent) {
    if (st.busy || !st.history.length) return;
    const prev = st.history.pop();
    st.fen = prev.fen; st.lastMove = prev.lastMove; san.length = prev.san; showMoves();
    st.over = false;
    board.setArrows([]);
    board.setPosition(st.fen, { interactive: true, lastMove: st.lastMove });
    if (!silent) say('Geri alındı. Sıra sende.');
  }

  async function hint() {
    if (st.over) return;
    const p = await probe(st.fen, { engine });
    if (!p || !p.best.length) { toast('İpucu şu an alınamadı', 'error'); return; }
    st.hints++;
    const u = p.best[0].uci;
    board.setArrows([{ orig: u.slice(0, 2), dest: u.slice(2, 4), brush: 'green' }]);
    say('Yeşil ok en iyi hamleyi gösteriyor.');
  }

  function restart() { begin(); }

  async function finish(ok, text) {
    st.over = true;
    board.setInteractive(false);
    if (!ok) { say(text, 'bad'); return; }
    const s = scoreStars({ mistakes: st.mistakes, hints: st.hints, moves: st.moves, par: st.par });
    await progress.record(lesson.id, s);
    activity.add('endgames');
    say(`${text}  ${starText(s)}`, 'ok');
    const why = s === 3 ? 'Kusursuz!' : st.mistakes || st.hints ? `${st.mistakes} hata, ${st.hints} ipucu.` : `${st.moves} hamlede bitirdin; ${st.par} hamle ya da daha azı 3 yıldız.`;
    info.textContent = why;
    side.querySelector('.row-btns').append(...[onNext ? btn('Sonraki ▸', () => { destroy(); onNext(); }, '.primary') : null].filter(Boolean));
  }

  function destroy() { board.destroy(); }
  begin();
  return { destroy };
}

// ---------- the module ----------
export default {
  id: 'oyunsonu',
  title: 'Oyunsonu',
  icon: '♔',
  description: 'Temel matlardan Lucena ve Philidor\'a: kusursuz savunan bilgisayara karşı oyunsonu dersleri.',
  ready: true,
  mount(root, opts = {}) {
    let current = null;
    const tabsHost = h('div.tabs');
    const body = h('div.module-body');
    clear(root).append(h('div.module', h('div.module-head', h('h2', 'Oyunsonu'), tabsHost), body));
    const swap = (v) => { if (current && current.destroy) current.destroy(); current = v; };
    const custom = window.endgameHooks || null; // web: coaches' positions
    const setTabs = (active) => clear(tabsHost).append(...[
      ['lessons', 'Dersler', showLessons], ['puzzles', 'Bulmacalar', showPuzzles], custom ? ['custom', 'Hocanın konumları', showCustom] : null,
    ].filter(Boolean).map(([k, l, f]) => h('button.tab' + (active === k ? '.active' : ''), { onclick: () => { swap(null); f(); } }, l)));

    async function showLessons(scrollTo) {
      setTabs('lessons');
      await progress.load();
      const total = LESSONS.length, done = LESSONS.filter((l) => progress.get(l.id)).length;
      const starsAll = LESSONS.reduce((a, l) => a + ((progress.get(l.id) || {}).stars || 0), 0);
      clear(body).append(h('div.eg-page',
        h('div.panel.eg-summary', h('b', `${done}/${total} ders`), h('span.muted', ` · ${starsAll}/${total * 3} yıldız`)),
        CHAPTERS.map(([ch, name, desc]) => {
          const ls = LESSONS.filter((l) => l.ch === ch);
          const d = ls.filter((l) => progress.get(l.id)).length;
          return h('div.eg-chapter', { id: 'eg-' + ch },
            h('div.eg-ch-head', h('h3', name), h('span.muted.small', `${d}/${ls.length}`)), h('p.muted.small', desc),
            h('div.eg-grid', ls.map((l) => {
              const p = progress.get(l.id);
              return h('button.eg-card' + (p ? '.done' : ''), { onclick: () => open(l) },
                h('div.eg-card-title', l.title), h('div.muted.small', GOAL_TEXT[l.goal].split(' (')[0]), h('div.eg-stars', starText(p ? p.stars : 0)));
            })));
        })));
      if (scrollTo) { const el = document.getElementById('eg-' + scrollTo); if (el) el.scrollIntoView({ block: 'start' }); }
    }
    function open(l, list = LESSONS, back = () => showLessons(l.ch), backLabel) {
      const i = list.findIndex((x) => x.id === l.id);
      const nxt = list[i + 1];
      swap(playLesson(body, l, { onBack: back, backLabel, onNext: nxt ? () => open(nxt, list, back, backLabel) : null }));
    }

    async function showPuzzles() {
      setTabs('puzzles');
      clear(body).append(h('div.eg-page', h('p.muted', 'Bulmaca havuzundaki oyunsonu bulmacaları. Bir türe dokun, puanlı antrenman o türle başlasın.'),
        h('div.theme-grid', END_THEMES.map((t) => h('button.theme-card', { onclick: () => (window.goTo ? window.goTo('puzzles:theme:' + t) : null) }, h('div.tc-name', THEME_TR[t]))))));
    }

    async function showCustom() {
      setTabs('custom');
      clear(body).append(h('div.empty', 'Yükleniyor…'));
      let list = [];
      try { list = await custom.list(); } catch (e) { clear(body).append(h('div.empty', 'Konumlar alınamadı: ' + e.message)); return; }
      await progress.load();
      const lessons = list.map((x) => ({ id: 'c-' + x.id, title: x.title, fen: x.fen, goal: x.goal, text: x.note || '', custom: x }));
      clear(body).append(h('div.eg-page',
        custom.isCoach ? h('div.row-btns', h('button.btn.primary', { onclick: () => custom.editDialog(null, showCustom) }, '+ Konum ekle')) : null,
        lessons.length ? h('div.eg-grid', lessons.map((l) => {
          const p = progress.get(l.id);
          return h('div.eg-card' + (p ? '.done' : ''),
            h('button.eg-card-open', { onclick: () => open(l, lessons, showCustom, 'Konumlara dön') }, h('div.eg-card-title', l.title), h('div.muted.small', GOAL_TEXT[l.goal].split(' (')[0]), h('div.eg-stars', starText(p ? p.stars : 0))),
            custom.isCoach ? h('div.row-btns', h('button.btn.small.ghost', { onclick: () => custom.editDialog(l.custom, showCustom) }, 'Düzenle')) : null);
        })) : h('div.empty', custom.isCoach ? 'Henüz konum yok. "+ Konum ekle" ile kendi oyunsonu konumlarını ekle; öğrenciler burada görür, ödeve de ekleyebilirsin.' : 'Hocan henüz konum eklemedi.')));
    }

    // opened from an assignment: just its endgames
    if (opts.lessons && opts.lessons.length) {
      progress.load().then(() => {
        setTabs('lessons');
        const ls = opts.lessons;
        const first = ls.find((l) => !progress.get(l.id)) || ls[0];
        open(first, ls, opts.onDone || (() => showLessons()), opts.onDone ? 'Ödevlere dön' : 'Derslere dön');
      });
    } else showLessons();
    return { unmount() { swap(null); } };
  },
};

export { LESSONS, lessonById };
