// "Strateji": positional questions — not "win material", but "find the right plan / the right square".
// Data: data/strategy.json (scripts/build-strategy.py): positions only from the coach's strategy books; the
// candidate moves, the verdicts and the Turkish explanations are ours, every choice checked with Stockfish
// (the right answer is clearly better than the wrong ones and wins no material by force — those are tactics).
//   { chapters: [{ id, name, desc, icon }], items: [{ id, ch, title, level, fen, choices: [{ m, san, ok, why }], line }] }
// Progress: kv 'strategy' { items: { id: { stars, tries, done, last } } }.
import { Chess } from 'chess.js';
import { h, clear } from '../../src/renderer/core/dom.js';
import { Board } from '../../src/renderer/core/board.js';
import { activity } from '../../src/renderer/core/activity.js';
import { fenSvg } from '../../src/renderer/core/fensvg.js';
import { LEVELS, levelName } from '../../src/renderer/modules/endgame/curriculum.js';

const api = window.api;
let cache = null;
export async function loadStrategy() {
  if (cache) return cache;
  const res = await fetch('data/strategy.json');
  if (!res.ok) throw new Error('Strateji soruları yüklenemedi');
  cache = await res.json();
  return cache;
}

export const progress = {
  data: null,
  async load() { if (!this.data) { this.data = await api.read('strategy', {}); this.data.items = this.data.items || {}; } return this.data; },
  get(id) { return (this.data && this.data.items[id]) || null; },
  async record(id, stars) {
    await this.load();
    const cur = this.data.items[id] || { stars: 0, tries: 0 };
    const first = !cur.done;
    cur.tries = (cur.tries || 0) + 1;
    if (stars > (cur.stars || 0)) cur.stars = stars;
    cur.done = cur.done || Date.now();
    cur.last = Date.now();
    this.data.items[id] = cur;
    await api.write('strategy', this.data);
    return first;
  },
};
// wrong tries → stars: right away 3, after one wrong 2, otherwise 1
export const starsFor = (wrong) => (wrong === 0 ? 3 : wrong === 1 ? 2 : 1);

const starRow = (n, cls = '') => h('span.eg-stars' + cls, [0, 1, 2].map((i) => h('i' + (i < (n || 0) ? '.on' : ''), '★')));
const thumb = (fen, size) => h('div.eg-thumb', { html: fenSvg(fen, size, fen.split(' ')[1] === 'b') });

function playItem(root, item, nav) {
  const side = item.fen.split(' ')[1];
  const st = { wrong: 0, over: false, tried: new Set() };
  const boardHost = h('div.egp-board');
  const status = h('div.egp-status');
  const list = h('div.st-choices');
  const explain = h('div.st-explain');
  const doneBox = h('div.egp-done');
  const i = nav.index;
  const navRow = h('div.egp-nav',
    h('button.btn.small.ghost', { disabled: i <= 0, onclick: () => go(i - 1) }, '◂ Önceki'),
    h('span.muted.small', `${i + 1} / ${nav.list.length}`),
    h('button.btn.small.ghost', { disabled: i >= nav.list.length - 1, onclick: () => go(i + 1) }, 'Sonraki ▸'));
  clear(root).append(h('div.egp', boardHost, h('aside.egp-panel',
    h('div.egp-top', h('button.egp-back', { onclick: () => { destroy(); nav.onBack(); } }, '◂ ', nav.crumb), h('span.egp-level', levelName(item.level))),
    h('h3.egp-title', item.title),
    h('div.egp-goal.win', h('span.egp-goal-k', '🧭 En iyi plan hangisi?'),
      h('span.egp-side', h('i.dot.' + (side === 'w' ? 'white' : 'black')), side === 'w' ? 'Beyaz oynar' : 'Siyah oynar')),
    h('p.egp-text', 'Taş kazandıran bir kombinezon aramıyoruz: pozisyonu iyileştiren doğru planı seç. Seçeneğin üstüne gelince tahtada ok çıkar; hamleyi tahtada da oynayabilirsin.'),
    status, list, explain, doneBox, navRow)));
  const board = new Board(boardHost, { orientation: side === 'w' ? 'white' : 'black', onMove: (m) => {
    const c = item.choices.find((x) => x.m === m.uci || x.m === m.uci.slice(0, 4));
    if (!c) { say('Bu hamle seçeneklerde yok. Seçeneklerden birini oyna ya da listeden seç.', 'bad'); setTimeout(() => board.setPosition(item.fen, { interactive: !st.over }), 500); return; }
    pick(c);
  } });
  setTimeout(() => board.refresh(), 60);
  const say = (t, k = '') => { status.className = 'egp-status' + (k ? ' ' + k : ''); status.textContent = t; };
  const arrow = (c, brush = 'blue') => board.setArrows(c ? [{ orig: c.m.slice(0, 2), dest: c.m.slice(2, 4), brush }] : []);
  function go(k) { destroy(); nav.onGo(k); }

  function drawChoices() {
    clear(list).append(...item.choices.map((c) => {
      const shown = st.tried.has(c.m) || st.over;
      return h('button.st-choice' + (shown ? (c.ok ? '.ok' : '.bad') : ''), {
        disabled: st.over || st.tried.has(c.m),
        onmouseenter: () => !st.over && arrow(c), onmouseleave: () => !st.over && arrow(null),
        onclick: () => pick(c),
      }, h('b', c.san), shown ? h('span.st-mark', c.ok ? '✓' : '✗') : null);
    }));
  }
  async function pick(c) {
    if (st.over || st.tried.has(c.m)) return;
    st.tried.add(c.m);
    if (!c.ok) {
      st.wrong++;
      board.showMove ? board.showMove(item.fen, c.m) : null;
      arrow(c, 'red');
      say('Bu plan değil. Tekrar dene.', 'bad');
      clear(explain).append(h('div.st-why.bad', h('b', c.san + ': '), c.why));
      setTimeout(() => { if (!st.over) { board.setPosition(item.fen, { interactive: true }); arrow(c, 'red'); } }, 900);
      drawChoices();
      return;
    }
    st.over = true;
    board.setPosition(item.fen, { interactive: false });
    arrow(c, 'green');
    const stars = starsFor(st.wrong);
    const first = await progress.record(item.id, stars);
    if (first) activity.add('strategy');
    say(st.wrong ? 'Doğru! Sonunda buldun.' : 'Doğru, ilk denemede!', 'ok');
    drawChoices();
    clear(explain).append(
      h('div.st-why.ok', h('b', c.san + ': '), c.why),
      ...item.choices.filter((x) => !x.ok).map((x) => h('div.st-why.bad', h('b', x.san + ': '), x.why)));
    clear(doneBox).append(h('div.egp-done-card', starRow(stars, '.big'), h('div.muted.small', st.wrong ? `${st.wrong} yanlış deneme` : 'Kusursuz!'),
      h('div.row-btns',
        item.line && item.line.length > 1 ? h('button.btn.small.ghost', { onclick: () => playLine() }, '▶ Devamı göster') : null,
        i < nav.list.length - 1 ? h('button.btn.small.primary', { onclick: () => go(i + 1) }, 'Sonraki soru ▸') : h('button.btn.small.primary', { onclick: () => { destroy(); nav.onBack(); } }, 'Listeye dön'))));
  }
  let timer = null;
  function playLine() {
    clearInterval(timer);
    const c = new Chess(item.fen);
    board.setArrows([]);
    board.setPosition(item.fen);
    let k = 0;
    timer = setInterval(() => {
      if (k >= item.line.length) { clearInterval(timer); return; }
      const u = item.line[k++];
      try { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined }); } catch (e) { clearInterval(timer); return; }
      board.setPosition(c.fen(), { lastMove: u });
    }, 900);
  }
  function destroy() { clearInterval(timer); board.destroy(); }
  board.setPosition(item.fen, { interactive: true });
  say('Sıra sende: doğru planı seç.');
  drawChoices();
  return { destroy };
}

export default {
  id: 'strateji',
  title: 'Strateji',
  icon: '🧭',
  description: 'Taktik değil plan: doğru kareyi, doğru hattı, doğru piyon hamlesini bul.',
  ready: true,
  mount(root, opts = {}) {
    let current = null;
    const state = { level: 0 };
    const body = h('div.module-body');
    clear(root).append(h('div.module', h('div.module-head', h('h2', 'Strateji')), body));
    const swap = (v) => { if (current && current.destroy) current.destroy(); current = v; };
    const done = (x) => progress.get(x.id);
    const stat = (ls) => ({ n: ls.length, d: ls.filter(done).length, s: ls.reduce((a, x) => a + ((done(x) || {}).stars || 0), 0) });
    const loading = () => clear(body).append(h('div.empty', 'Yükleniyor…'));

    async function showHome() {
      swap(null); loading();
      let d;
      try { [d] = await Promise.all([loadStrategy(), progress.load()]); } catch (e) { clear(body).append(h('div.empty', e.message)); return; }
      const all = stat(d.items);
      const pick = (ls) => (state.level ? ls.filter((x) => x.level === state.level) : ls);
      const next = d.items.find((x) => !done(x) && (!state.level || x.level === state.level));
      clear(body).append(h('div.eg-home',
        h('div.eg-hero', h('div.eg-hero-main', h('div.eg-hero-k', 'Strateji yolculuğun'), h('div.eg-hero-v', `${all.d}`, h('small', ` / ${all.n} soru`)),
          h('div.eg-bar.big', h('i', { style: { width: `${(100 * all.d) / all.n}%` } }))), h('div.eg-hero-stars', h('span', '★'), h('b', all.s))),
        next ? h('div.row-btns', h('button.btn.primary', { onclick: () => { const ls = pick(d.items.filter((x) => x.ch === next.ch)); open(next, ls, () => showHome(), 'Strateji'); } }, '▶ Kaldığın yerden devam et')) : null,
        h('div.eg-levels', [[0, 'Hepsi'], ...LEVELS].map(([k, n]) => h('button.eg-chip' + (state.level === k ? '.on' : ''), { onclick: () => { state.level = k; showHome(); } }, n))),
        h('div.eg-tiles', d.chapters.map((c) => {
          const ls = pick(d.items.filter((x) => x.ch === c.id));
          if (!ls.length) return null;
          const s = stat(ls);
          return h('button.eg-tile', { onclick: () => showChapter(c.id) },
            h('div.eg-tile-icon', c.icon), h('div.eg-tile-body', h('div.eg-tile-name', c.name), h('div.muted.small', c.desc),
              h('div.eg-bar', h('i', { style: { width: `${(100 * s.d) / s.n}%` } })),
              h('div.eg-tile-foot', h('span', `${s.d}/${s.n} soru`), h('span.eg-gold', `★ ${s.s}`))));
        }))));
    }

    async function showChapter(chId, scrollId) {
      swap(null); loading();
      const d = await loadStrategy(); await progress.load();
      const c = d.chapters.find((x) => x.id === chId);
      const ls = d.items.filter((x) => x.ch === chId && (!state.level || x.level === state.level));
      const levels = [...new Set(ls.map((x) => x.level))].sort((a, b) => a - b);
      const s = stat(ls);
      clear(body).append(h('div.eg-chapter-page',
        h('div.eg-ch-top', h('button.egp-back', { onclick: () => showHome() }, '◂ Bölümler'),
          h('div.eg-ch-title', h('span.eg-tile-icon.sm', c.icon), h('div', h('h3', c.name), h('div.muted.small', `${s.d}/${s.n} soru · ★ ${s.s}`)))),
        levels.map((lv) => {
          const lvl = ls.filter((x) => x.level === lv);
          return h('section.eg-topic', h('h4', h('span.eg-lv-dot.lv' + lv), levelName(lv), h('span.muted.small', ` ${lvl.filter(done).length}/${lvl.length}`)),
            h('div.eg-cards', lvl.map((x) => {
              const p = done(x);
              return h('button.eg-card' + (p ? '.done' : ''), { id: 'stc-' + x.id, onclick: () => open(x, ls, () => showChapter(chId, x.id), c.name) },
                thumb(x.fen, 128),
                h('div.eg-card-body', h('div.eg-card-title', x.title),
                  h('div.eg-card-foot', h('span.muted.small', x.fen.split(' ')[1] === 'w' ? 'Beyaz oynar' : 'Siyah oynar'), starRow(p ? p.stars : 0))));
            })));
        })));
      if (scrollId) { const el = document.getElementById('stc-' + scrollId); if (el) el.scrollIntoView({ block: 'center' }); }
    }

    function open(x, list, back, crumb) {
      const index = list.findIndex((y) => y.id === x.id);
      swap(playItem(body, x, { list, index, crumb, onBack: back, onGo: (k) => open(list[k], list, back, crumb) }));
    }

    showHome();
    return { unmount() { swap(null); } };
  },
};
