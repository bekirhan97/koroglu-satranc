// Oyunsonu: theory (≤ 7 pieces, perfect defence from the Lichess tablebase) and practical positions
// (Stockfish), from the coach's endgame books; endgame puzzles; the coaches' own positions.
// Progress: kv 'endgame' { lessons: { id: { stars, tries, done, last } } }.
import { Chess } from 'chess.js';
import { h, clear, toast } from '../../core/dom.js';
import { Board, localSan } from '../../core/board.js';
import { activity } from '../../core/activity.js';
import { fenSvg } from '../../core/fensvg.js';
import { loadCurriculum, GOAL_TEXT, GOAL_LONG, LEVELS, levelName } from './curriculum.js';
import { probe, gameState, stars as scoreStars, HOLD_MOVES, PRACTICAL_HOLD, PRACTICAL_WIN_CP, pieceCount } from './judge.js';

const api = window.api;
export const END_THEMES = ['pawnEndgame', 'rookEndgame', 'queenEndgame', 'bishopEndgame', 'knightEndgame', 'queenRookEndgame', 'endgame'];
const THEME_TR = { pawnEndgame: ['Piyon oyunsonu', '♟'], rookEndgame: ['Kale oyunsonu', '♜'], queenEndgame: ['Vezir oyunsonu', '♛'], bishopEndgame: ['Fil oyunsonu', '♝'], knightEndgame: ['At oyunsonu', '♞'], queenRookEndgame: ['Vezir-kale oyunsonu', '♛'], endgame: ['Karışık oyunsonu', '♚'] };

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
const starRow = (n, cls = '') => h('span.eg-stars' + cls, [0, 1, 2].map((i) => h('i' + (i < (n || 0) ? '.on' : ''), '★')));
const thumb = (fen, size, flipIt) => h('div.eg-thumb', { html: fenSvg(fen, size, flipIt) });
export const studentSide = (l) => (l.oppFirst ? (l.fen.split(' ')[1] === 'w' ? 'b' : 'w') : l.fen.split(' ')[1]);

// ---------- the player ----------
// lesson: { id, title, fen, goal, text, oppFirst, topic, level }; nav: { list, index, crumb, onBack, onGo }
export function playLesson(root, lesson, nav = {}) {
  const startFen = lesson.fen;
  const student = studentSide(lesson);
  const engine = api.analyse ? (req, pr) => api.analyse(req, pr) : null;
  const st = { fen: startFen, history: [], mistakes: 0, hints: 0, moves: 0, par: null, over: false, startCp: null, practical: false };
  const san = [];
  const status = h('div.egp-status');
  const meta = h('div.egp-meta');
  const movesEl = h('div.egp-moves');
  const boardHost = h('div.egp-board');
  const iconBtn = (icon, label, fn) => h('button.egp-act', { onclick: fn, title: label }, h('span.ic', icon), h('span', label));
  const actions = h('div.egp-actions', iconBtn('↶', 'Geri al', () => undo()), iconBtn('💡', 'İpucu', () => hint()), iconBtn('↺', 'Baştan', () => begin()));
  const doneBox = h('div.egp-done');
  const i = nav.list ? nav.index : -1;
  const navRow = nav.list ? h('div.egp-nav',
    h('button.btn.small.ghost', { disabled: i <= 0, onclick: () => go(i - 1) }, '◂ Önceki'),
    h('span.muted.small', `${i + 1} / ${nav.list.length}`),
    h('button.btn.small.ghost', { disabled: i >= nav.list.length - 1, onclick: () => go(i + 1) }, 'Sonraki ▸')) : null;
  const panel = h('aside.egp-panel',
    h('div.egp-top',
      nav.onBack ? h('button.egp-back', { onclick: () => { destroy(); nav.onBack(); } }, '◂ ', nav.crumb || 'Geri') : null,
      lesson.level ? h('span.egp-level', levelName(lesson.level)) : null),
    h('h3.egp-title', lesson.title),
    h('div.egp-goal.' + lesson.goal, h('span.egp-goal-k', '🎯 ' + GOAL_LONG[lesson.goal]),
      h('span.egp-side', h('i.dot.' + (student === 'w' ? 'white' : 'black')), student === 'w' ? 'Beyazsın' : 'Siyahsın')),
    lesson.text ? h('p.egp-text', lesson.text) : null,
    status, doneBox, actions, movesEl, meta, navRow);
  clear(root).append(h('div.egp', boardHost, panel));
  const board = new Board(boardHost, { orientation: student === 'w' ? 'white' : 'black', onMove: (m) => onStudentMove(m) });
  setTimeout(() => board.refresh(), 60);
  const say = (text, kind = '') => { status.className = 'egp-status' + (kind ? ' ' + kind : ''); status.textContent = text; };
  const showMoves = () => {
    clear(movesEl).append(...san.map((m, k) => h('span.mv' + (k === san.length - 1 ? '.last' : ''), m)));
  };
  function go(k) { destroy(); nav.onGo(k); }

  async function begin() {
    st.fen = startFen; st.history = []; st.mistakes = 0; st.hints = 0; st.moves = 0; st.over = false; st.lastMove = null; san.length = 0; showMoves();
    clear(doneBox); actions.style.display = '';
    board.setArrows([]);
    board.setPosition(startFen, { interactive: false });
    say('Konum hazırlanıyor…');
    const p0 = await probe(startFen, { engine });
    st.practical = !p0 || p0.source !== 'tablebase';
    if (p0 && p0.source === 'tablebase' && lesson.goal === 'mate' && p0.dtm && !lesson.oppFirst) st.par = Math.ceil(p0.dtm * 1.3) + 2;
    if (p0 && p0.source === 'engine') st.startCp = lesson.oppFirst ? -p0.cp : p0.cp;
    clear(meta).append(...[
      h('span', st.practical ? '♞ Rakip: Stockfish (pratik konum)' : '♚ Rakip kusursuz savunuyor (oyunsonu tablosu)'),
      st.par ? h('span', ` · 3 yıldız için en çok ${st.par} hamle`) : null,
      lesson.goal === 'draw' ? h('span', ` · ${st.practical ? PRACTICAL_HOLD : HOLD_MOVES} hamle dayan`) : null].filter(Boolean));
    if (!p0) say('Değerlendirme şu an yapılamıyor (bağlantı?). Yine de oynayabilirsin.', 'bad');
    if (lesson.oppFirst) await opponentMove();
    else yourTurn();
  }
  function yourTurn() {
    board.setPosition(st.fen, { interactive: true, lastMove: st.lastMove });
    say(st.moves ? 'Sıra sende.' : lesson.oppFirst ? 'Rakip oynadı. Sıra sende.' : 'Sıra sende. İlk hamleni yap.');
  }

  async function onStudentMove(m) {
    if (st.over) return;
    board.setArrows([]);
    st.history.push({ fen: st.fen, san: san.length, lastMove: st.lastMove, moves: st.moves });
    st.fen = m.fenAfter; st.lastMove = m.uci; st.moves++;
    san.push(localSan(m.san)); showMoves();
    const gs = gameState(st.fen);
    if (gs === 'mate') return finish(true, 'Mat!');
    if (gs === 'stalemate') return lesson.goal === 'draw' ? finish(true, 'Pat: beraberlik!') : mistake('Pat oldu! Rakibin hiç hamlesi kalmadı.');
    if (gs === 'insufficient') return lesson.goal === 'draw' ? finish(true, 'Mat edecek taş kalmadı: beraberlik!') : mistake('Mat edecek taş kalmadı.');
    say('Rakip düşünüyor…');
    const p = await probe(st.fen, { engine });
    const promoted = m.uci.length === 5;
    if (p && p.source === 'tablebase') {
      const mine = p.result === 'loss' ? 'win' : p.result === 'win' ? 'loss' : 'draw';
      if ((lesson.goal === 'mate' || lesson.goal === 'win') && mine !== 'win') return mistake(mine === 'draw' ? 'Bu hamleyle kazanç kaçtı: konum artık berabere.' : 'Bu hamleyle konum kaybedildi.');
      if (lesson.goal === 'draw' && mine === 'loss') return mistake('Bu hamleyle konum kaybedildi.');
      if (lesson.goal === 'win' && promoted && mine === 'win') return finish(true, 'Piyon terfi etti, kazanç garanti!');
      if (st.practical && lesson.goal === 'win' && mine === 'win') return finish(true, 'Kazanan teorik konuma ulaştın!');
      if (lesson.goal === 'draw' && st.moves >= (st.practical ? PRACTICAL_HOLD : HOLD_MOVES)) return finish(true, 'Beraberliği tuttun!');
      if (st.practical && lesson.goal === 'draw' && mine === 'draw' && pieceCount(st.fen) <= 5) return finish(true, 'Beraberlik konumuna ulaştın!');
    } else if (p && p.source === 'engine') {
      const my = -p.cp; // from the student's side
      if (lesson.goal !== 'draw') {
        const limit = Math.max(60, Math.min(150, (st.startCp || 300) * 0.4));
        if (my < limit) return mistake(my < -100 ? 'Bu hamleyle konum kaybedilebilir.' : 'Bu hamleyle avantajın büyük ölçüde gitti.');
        if (promoted && my >= 400) return finish(true, 'Piyon terfi etti!');
        if (st.moves >= 4 && my >= PRACTICAL_WIN_CP) return finish(true, 'Kazanç artık kesin!');
      } else {
        if (my < -200) return mistake('Bu hamleyle konum kaybedilebilir.');
        if (st.moves >= PRACTICAL_HOLD) return finish(true, 'Beraberliği tuttun!');
      }
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
    if (gs === 'stalemate' || gs === 'insufficient') return lesson.goal === 'draw' ? finish(true, 'Beraberlik!') : finish(false, 'Oyun berabere bitti. Baştan dene.');
    yourTurn();
  }

  function mistake(text) {
    st.mistakes++;
    say(text + ' Hamlen geri alınıyor…', 'bad');
    board.setPosition(st.fen, { interactive: false, lastMove: st.lastMove });
    setTimeout(() => { if (!st.over) { undo(true); say(text + ' Başka bir hamle dene.', 'bad'); } }, 1400);
  }

  function undo(silent) {
    if (!st.history.length) return;
    const prev = st.history.pop();
    st.fen = prev.fen; st.lastMove = prev.lastMove; st.moves = prev.moves; san.length = prev.san; showMoves();
    st.over = false; clear(doneBox); actions.style.display = '';
    board.setArrows([]);
    board.setPosition(st.fen, { interactive: true, lastMove: st.lastMove });
    if (!silent) say('Geri alındı. Sıra sende.');
  }

  async function hint() {
    if (st.over) return;
    say('İpucu hazırlanıyor…');
    const p = await probe(st.fen, { engine });
    if (!p || !p.best.length) { toast('İpucu şu an alınamadı', 'error'); return; }
    st.hints++;
    const u = p.best[0].uci;
    board.setArrows([{ orig: u.slice(0, 2), dest: u.slice(2, 4), brush: 'green' }]);
    say('Yeşil ok en iyi hamleyi gösteriyor.');
  }

  async function finish(ok, text) {
    st.over = true;
    board.setInteractive(false);
    if (!ok) { say(text, 'bad'); return; }
    const s = scoreStars({ mistakes: st.mistakes, hints: st.hints, moves: st.moves, par: st.par });
    await progress.record(lesson.id, s);
    activity.add('endgames');
    say(text, 'ok');
    actions.style.display = 'none';
    const why = s === 3 ? 'Kusursuz!' : st.mistakes || st.hints ? `${st.mistakes} hata, ${st.hints} ipucu` : `${st.moves} hamle (3 yıldız için en çok ${st.par})`;
    clear(doneBox).append(h('div.egp-done-card', starRow(s, '.big'), h('div.muted.small', why),
      h('div.row-btns', h('button.btn.small.ghost', { onclick: () => begin() }, '↺ Tekrar'),
        nav.list && i < nav.list.length - 1 ? h('button.btn.small.primary', { onclick: () => go(i + 1) }, 'Sonraki konum ▸') : nav.onBack ? h('button.btn.small.primary', { onclick: () => { destroy(); nav.onBack(); } }, 'Listeye dön') : null)));
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
  description: 'Teorik ve pratik oyunsonları: kusursuz savunan bilgisayara karşı, yıldızlı alıştırmalar.',
  ready: true,
  mount(root, opts = {}) {
    let current = null;
    const state = { level: 0 };
    const tabsHost = h('div.tabs');
    const body = h('div.module-body');
    clear(root).append(h('div.module', h('div.module-head', h('h2', 'Oyunsonu'), tabsHost), body));
    const swap = (v) => { if (current && current.destroy) current.destroy(); current = v; };
    const custom = window.endgameHooks || null;
    const setTabs = (active) => clear(tabsHost).append(...[
      ['lessons', 'Dersler', () => showHome()], ['puzzles', 'Bulmacalar', showPuzzles], custom ? ['custom', 'Hocanın konumları', () => showCustom()] : null,
    ].filter(Boolean).map(([k, l, f]) => h('button.tab' + (active === k ? '.active' : ''), { onclick: () => { swap(null); f(); } }, l)));
    const loading = () => clear(body).append(h('div.empty', 'Yükleniyor…'));
    const done = (l) => progress.get(l.id);
    const stat = (ls) => ({ n: ls.length, d: ls.filter(done).length, s: ls.reduce((a, l) => a + ((done(l) || {}).stars || 0), 0) });

    async function showHome() {
      setTabs('lessons'); loading();
      let cur;
      try { [cur] = await Promise.all([loadCurriculum(), progress.load()]); } catch (e) { clear(body).append(h('div.empty', e.message)); return; }
      const all = stat(cur.lessons);
      const pick = (ls) => (state.level ? ls.filter((l) => l.level === state.level) : ls);
      const tile = (c) => {
        const ls = pick(cur.lessons.filter((l) => l.ch === c.id));
        if (!ls.length) return null;
        const s = stat(ls);
        return h('button.eg-tile', { onclick: () => showChapter(c.id) },
          h('div.eg-tile-icon', c.icon), h('div.eg-tile-body', h('div.eg-tile-name', c.name), h('div.muted.small', c.desc),
            h('div.eg-bar', h('i', { style: { width: `${(100 * s.d) / s.n}%` } })),
            h('div.eg-tile-foot', h('span', `${s.d}/${s.n} konum`), h('span.eg-gold', `★ ${s.s}`))));
      };
      clear(body).append(h('div.eg-home',
        h('div.eg-hero', h('div.eg-hero-main', h('div.eg-hero-k', 'Oyunsonu yolculuğun'), h('div.eg-hero-v', `${all.d}`, h('small', ` / ${all.n} konum`)),
          h('div.eg-bar.big', h('i', { style: { width: `${(100 * all.d) / all.n}%` } }))), h('div.eg-hero-stars', h('span', '★'), h('b', all.s))),
        h('div.eg-levels', [[0, 'Hepsi'], ...LEVELS].map(([k, n]) => h('button.eg-chip' + (state.level === k ? '.on' : ''), { onclick: () => { state.level = k; showHome(); } }, n))),
        h('h3.eg-sec', 'Teorik oyunsonları', h('span.muted.small', ' · bilinmesi gereken konumlar, rakip kusursuz savunur')),
        h('div.eg-tiles', cur.chapters.filter((c) => c.kind === 'teori').map(tile)),
        h('h3.eg-sec', 'Pratik oyunsonları', h('span.muted.small', ' · ustaların maçlarından ve kitap alıştırmalarından, rakip Stockfish')),
        h('div.eg-tiles', cur.chapters.filter((c) => c.kind === 'pratik').map(tile))));
    }

    async function showChapter(chId, scrollId) {
      setTabs('lessons'); loading();
      const cur = await loadCurriculum(); await progress.load();
      const c = cur.chapters.find((x) => x.id === chId);
      const ls = cur.lessons.filter((l) => l.ch === chId && (!state.level || l.level === state.level));
      // sections by level (easy → hard); inside a level the curriculum order (concept by concept, then difficulty)
      const levels = [...new Set(ls.map((l) => l.level))].sort((a, b) => a - b);
      const s = stat(ls);
      clear(body).append(h('div.eg-chapter-page',
        h('div.eg-ch-top', h('button.egp-back', { onclick: () => showHome() }, '◂ Bölümler'),
          h('div.eg-ch-title', h('span.eg-tile-icon.sm', c.icon), h('div', h('h3', c.name), h('div.muted.small', `${s.d}/${s.n} konum · ★ ${s.s}`)))),
        levels.map((lv) => h('section.eg-topic', h('h4', h('span.eg-lv-dot.lv' + lv), levelName(lv), h('span.muted.small', ` ${ls.filter((l) => l.level === lv && done(l)).length}/${ls.filter((l) => l.level === lv).length}`)),
          h('div.eg-cards', ls.filter((l) => l.level === lv).map((l) => {
            const p = done(l);
            return h('button.eg-card' + (p ? '.done' : ''), { id: 'egc-' + l.id, onclick: () => open(l, ls, () => showChapter(chId, l.id), c.name) },
              thumb(l.fen, 128, studentSide(l) === 'b'),
              h('div.eg-card-body', h('div.eg-card-title', l.title),
                h('div.eg-card-foot', h('span.eg-goal-chip.' + l.goal, GOAL_TEXT[l.goal]), starRow(p ? p.stars : 0))));
          }))))));
      if (scrollId) { const el = document.getElementById('egc-' + scrollId); if (el) el.scrollIntoView({ block: 'center' }); }
    }

    function open(l, list, back, crumb) {
      const index = list.findIndex((x) => x.id === l.id);
      swap(playLesson(body, l, { list, index, crumb, onBack: back, onGo: (k) => open(list[k], list, back, crumb) }));
    }

    function showPuzzles() {
      setTabs('puzzles');
      clear(body).append(h('div.eg-home', h('p.muted', 'Bulmaca havuzundaki oyunsonu bulmacaları. Bir türe dokun, puanlı antrenman o türle başlasın.'),
        h('div.eg-tiles', END_THEMES.map((t) => h('button.eg-tile', { onclick: () => (window.goTo ? window.goTo('puzzles:theme:' + t) : null) },
          h('div.eg-tile-icon', THEME_TR[t][1]), h('div.eg-tile-body', h('div.eg-tile-name', THEME_TR[t][0]), h('div.muted.small', 'Puanlı bulmaca antrenmanı')))))));
    }

    async function showCustom() {
      setTabs('custom'); loading();
      let list = [];
      try { list = await custom.list(); } catch (e) { clear(body).append(h('div.empty', 'Konumlar alınamadı: ' + e.message)); return; }
      await progress.load();
      const lessons = list.map((x) => ({ id: 'c-' + x.id, title: x.title, fen: x.fen, goal: x.goal, text: x.note || '', topic: x.collection || 'Konumlar', custom: x }));
      const groups = [...new Set(lessons.map((l) => l.topic))];
      clear(body).append(h('div.eg-chapter-page',
        custom.isCoach ? h('div.row-btns', h('button.btn.primary', { onclick: () => custom.editDialog(null, showCustom) }, '+ Konum ekle'),
          h('button.btn', { onclick: () => custom.importDialog(showCustom) }, '⇪ PGN\'den içe aktar')) : null,
        lessons.length ? groups.map((g) => {
          const gl = lessons.filter((l) => l.topic === g);
          return h('section.eg-topic', h('h4', g, h('span.muted.small', ` ${gl.length} konum`)), h('div.eg-cards', gl.map((l) => {
            const p = done(l);
            return h('div.eg-card' + (p ? '.done' : ''),
              h('button.eg-card-open', { onclick: () => open(l, gl, showCustom, 'Hocanın konumları') }, thumb(l.fen, 128, studentSide(l) === 'b'),
                h('div.eg-card-body', h('div.eg-card-title', l.title), h('div.eg-card-foot', h('span.eg-goal-chip.' + l.goal, GOAL_TEXT[l.goal]), starRow(p ? p.stars : 0)))),
              custom.isCoach ? h('button.eg-edit', { onclick: () => custom.editDialog(l.custom, showCustom), title: 'Düzenle' }, '✎') : null);
          })));
        }) : h('div.empty', custom.isCoach ? 'Henüz konum yok. "+ Konum ekle" ya da "PGN\'den içe aktar" ile kendi konumlarını ekle; öğrenciler burada görür, ödeve de ekleyebilirsin.' : 'Hocan henüz konum eklemedi.')));
    }

    // opened from an assignment: just its endgames
    if (opts.lessons && opts.lessons.length) {
      progress.load().then(() => {
        setTabs('lessons');
        const ls = opts.lessons;
        const first = ls.find((l) => !progress.get(l.id)) || ls[0];
        open(first, ls, opts.onDone || (() => showHome()), opts.onDone ? 'Ödevlere dön' : 'Bölümler');
      });
    } else showHome();
    return { unmount() { swap(null); } };
  },
};
