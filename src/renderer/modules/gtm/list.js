// Game selector: PGN import, collections, search, start/resume/review.
import { h, clear, modal, toast, fmtDate } from '../../core/dom.js';
import { store } from '../../core/store.js';
import { splitPgn, parseGame, gameFens, sideToMove } from '../../core/pgn.js';
import { openingName } from '../../core/openings.js';
import { PRIORITY } from '../../core/engine.js';
import { GameAnalysis } from './analysis.js';
import { attemptsOf, activeAttempt, hasFinished, attemptStats, lastAttempt } from './session.js';

export async function importPgnTexts(files) {
  let added = 0, dup = 0, bad = 0;
  const known = new Set(store.games.map((g) => g.id));
  for (const f of files) {
    for (const txt of splitPgn(f.text)) {
      const col = (txt.match(/\[Collection "([^"]+)"\]/) || [])[1];
      const g = parseGame(txt, col || f.name);
      if (!g || g.error) { bad++; continue; }
      const trap = (txt.match(/\[Annotator "([^"]+)"\]/) || [])[1];
      if (trap && col === 'Klasik tuzaklar') { g.headers.White = trap; g.headers.Black = 'Klasik tuzak'; }
      if (known.has(g.id)) { dup++; continue; }
      const op = openingName(gameFens(g));
      g.opening = op ? `${op.eco} ${op.name}` : '';
      store.games.push(g);
      known.add(g.id);
      added++;
    }
  }
  await store.saveGames();
  return { added, dup, bad };
}

function difficultyOf(gameId) {
  const g = store.games.find((x) => x.id === gameId);
  return g && g.difficulty ? g.difficulty : null;
}

// Background analyser for a whole list of games (so the "Zorluk" column fills in).
const bg = { running: false, stop: false, done: 0, total: 0, onUpdate: null };
async function analyseAll(games) {
  if (bg.running) return;
  bg.running = true; bg.stop = false; bg.done = 0; bg.total = games.length;
  for (const g of games) {
    if (bg.stop) break;
    try {
      const fens = gameFens(g);
      const an = await new GameAnalysis(g, fens).load();
      const plies = [];
      for (let p = 0; p < g.ucis.length; p++) if (sideToMove(fens[p]) === g.userColor) plies.push(p);
      for (const p of plies) { if (bg.stop) break; await an.ensure(p, PRIORITY.BACKGROUND); }
      await an.save();
      if (!bg.stop) { updateDifficulty(g, an); await store.saveGames(); }
    } catch (e) { /* skip game */ }
    bg.done++;
    if (bg.onUpdate) bg.onUpdate();
  }
  bg.running = false;
  if (bg.onUpdate) bg.onUpdate();
}

export function updateDifficulty(g, an) {
  const rs = Object.values(an.data.plies).map((e) => e.rating).filter(Boolean);
  if (rs.length) g.difficulty = Math.round(rs.reduce((a, b) => a + b, 0) / rs.length);
}

export class ListView {
  constructor(root, { onPlay, onReview }) {
    this.root = root; this.onPlay = onPlay; this.onReview = onReview;
    this.filter = ''; this.collection = '';
    this.sort = { key: 'added', dir: -1 };
  }

  mount() {
    this.render();
    bg.onUpdate = () => this.renderBg();
  }

  render() {
    this.bgHost = h('span.bg-status');
    const collections = [...new Set(store.games.map((g) => g.collection))];
    const toolbar = h('div.toolbar',
      h('button.btn.primary', { onclick: () => this.import() }, '+ PGN İçe Aktar'),
      h('button.btn', { onclick: () => this.builtins() }, '📚 Hazır koleksiyonlar'),
      h('input.search', { placeholder: 'Oyuncu, açılış ya da etkinlik ara…', value: this.filter, oninput: (e) => { this.filter = e.target.value; this.renderTable(); } }),
      h('select', { onchange: (e) => { this.collection = e.target.value; this.renderTable(); } },
        h('option', { value: '' }, 'Tüm koleksiyonlar'),
        collections.map((c) => h('option', { value: c, selected: c === this.collection }, c))),
      h('span.spacer'),
      this.bgHost);
    this.tableHost = h('div.table-host');
    const drop = h('div.gtm-list', toolbar, this.tableHost);
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragging'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
    drop.addEventListener('drop', async (e) => {
      e.preventDefault(); drop.classList.remove('dragging');
      const files = await Promise.all([...e.dataTransfer.files].map(async (f) => ({ name: f.name.replace(/\.(pgn|txt)$/i, ''), text: await f.text() })));
      this.afterImport(await importPgnTexts(files));
    });
    clear(this.root).append(drop);
    this.renderTable();
    this.renderBg();
  }

  renderBg() {
    if (!this.bgHost) return;
    clear(this.bgHost);
    if (bg.running) {
      this.bgHost.append(`Analiz: ${bg.done}/${bg.total} oyun `, h('button.btn.small', { onclick: () => { bg.stop = true; } }, 'Durdur'));
    } else {
      const todo = this.visibleGames().filter((g) => !g.difficulty);
      if (todo.length) this.bgHost.append(h('button.btn.small', { title: 'Zorluk değerlerini hesaplar ve oyunları önceden analiz eder', onclick: () => analyseAll(todo) }, `Önceden analiz et (${todo.length})`));
      if (!bg.running && bg.total && bg.done === bg.total) this.renderTable();
    }
  }

  // Collections shipped with the app (resources/miniatures.pgn).
  async builtins() {
    const text = await window.api.miniatures();
    const groups = {};
    for (const t of splitPgn(text)) { const c = (t.match(/\[Collection "([^"]+)"\]/) || [])[1] || 'Koleksiyon'; (groups[c] = groups[c] || []).push(t); }
    const known = new Set(store.games.map((g) => g.collection));
    const desc = { 'Tarihi minyatürler': 'Legall, Anderssen, Morphy, Steinitz, Réti, Alekhine, Fischer… Satranç tarihinin kısa ve parlak oyunları.', 'Klasik tuzaklar': 'Açılışlarda sık düşülen tuzaklar: Blackburne-Shilling, Englund, Sibirya, Fil tuzağı… Tuzağı kuran tarafı oynarsınız.' };
    modal({
      title: 'Hazır koleksiyonlar',
      body: h('div.builtin-list', Object.entries(groups).map(([name, games]) => h('div.builtin',
        h('div', h('b', name), h('span.muted', ` · ${games.length} oyun`), h('div.muted.small', desc[name] || '')),
        known.has(name) ? h('span.chip.ok', 'Eklendi') : h('button.btn.small.primary', { onclick: async (e) => {
          e.target.disabled = true;
          this.afterImport(await importPgnTexts([{ name, text: games.join('\n\n') }]));
          this.collection = name; this.render();
          e.target.replaceWith(h('span.chip.ok', 'Eklendi'));
        } }, 'Ekle')))),
      actions: [{ label: 'Kapat', primary: true }],
    });
  }

  async import() {
    const files = await window.api.openPgn();
    if (!files.length) return;
    this.afterImport(await importPgnTexts(files));
  }

  afterImport({ added, dup, bad }) {
    toast(`${added} oyun eklendi` + (dup ? `, ${dup} zaten vardı` : '') + (bad ? `, ${bad} okunamadı` : ''), added ? 'ok' : '');
    this.render();
  }

  visibleGames() {
    const q = this.filter.toLocaleLowerCase('tr');
    return store.games.filter((g) => (!this.collection || g.collection === this.collection) &&
      (!q || [g.headers.White, g.headers.Black, g.headers.Event, g.opening, g.collection].join(' ').toLocaleLowerCase('tr').includes(q)));
  }

  renderTable() {
    const games = this.visibleGames();
    const host = clear(this.tableHost);
    if (!store.games.length) {
      host.append(h('div.empty',
        h('h3', 'Henüz oyun yok'),
        h('p', 'Usta oyunlarını içeren bir PGN dosyası içe aktarın ya da dosyayı buraya sürükleyip bırakın.'),
        h('p.muted', 'İpucu: Varsayılan olarak kazanan tarafı oynarsınız. Beraberlikte beyazı oynarsınız. Tarafı oyun menüsünden değiştirebilirsiniz.'),
        h('button.btn.primary', { onclick: () => this.import() }, '+ PGN İçe Aktar')));
      return;
    }
    const rowData = games.map((g) => {
      const atts = attemptsOf(g.id);
      const done = atts.filter((a) => a.status === 'done');
      const last = done[done.length - 1];
      return { g, last, lastAt: last ? last.finishedAt : 0, avg: last ? attemptStats(last).avg : null, active: activeAttempt(g.id) };
    });
    const k = this.sort.key, d = this.sort.dir;
    const val = (r) => ({ added: r.g.addedAt, last: r.lastAt, players: r.g.headers.White, opening: r.g.opening, diff: r.g.difficulty || 0, moves: r.g.ucis.length }[k]);
    rowData.sort((a, b) => (val(a) > val(b) ? d : val(a) < val(b) ? -d : 0));
    const th = (label, key) => h('th', { class: key ? 'sortable' + (k === key ? ' sorted' : '') : '', onclick: key ? () => { this.sort = { key, dir: k === key ? -d : -1 }; this.renderTable(); } : null },
      label, k === key ? (d > 0 ? ' ▲' : ' ▼') : '');
    host.append(h('table.games',
      h('thead', h('tr', th('Son (Ort. Skor)', 'last'), th('Oyuncular', 'players'), th('Sonuç'), th('Açılış', 'opening'), th('Zorluk', 'diff'), th('Hamle', 'moves'), th(''))),
      h('tbody', rowData.map(({ g, last, avg, active }) => {
        const H = g.headers;
        const w = g.userColor === 'w';
        return h('tr',
          h('td.muted', last ? `${fmtDate(last.finishedAt)} (${avg.toFixed(1)})` : '-'),
          h('td', h('span', { class: w ? 'me' : '' }, H.White), ' – ', h('span', { class: !w ? 'me' : '' }, H.Black),
            h('div.sub', [g.collection, H.Event, H.Date && H.Date.slice(0, 4)].filter(Boolean).join(' · '))),
          h('td', H.Result),
          h('td.opening', g.opening || '-'),
          h('td', g.difficulty || '–'),
          h('td', Math.ceil(g.ucis.length / 2)),
          h('td.actions',
            h('button.btn.small.primary', { onclick: () => this.start(g) }, active ? 'Devam' : last ? 'Tekrar' : 'Oyna'),
            h('button.icon-btn', { title: 'Diğer', onclick: (e) => this.menu(g, e) }, '⋯')));
      }))));
  }

  start(g) {
    if (activeAttempt(g.id)) return this.onPlay(g, { rated: activeAttempt(g.id).rated });
    if (hasFinished(g.id)) {
      modal({
        title: 'Daha önce oynanmış oyun',
        body: h('p', 'Bu oyunu daha önce oynadınız. Puansız olarak tekrar çözebilir ya da son denemenizi inceleyebilirsiniz.'),
        actions: [
          { label: 'Puansız Oyna', onClick: () => this.onPlay(g, { rated: false }) },
          { label: 'İncele', primary: true, onClick: () => this.onReview(g, lastDone(g.id)) },
        ],
      });
      return;
    }
    this.onPlay(g, { rated: true });
  }

  menu(g, ev) {
    const close = () => m.remove();
    const item = (label, fn) => h('button.menu-item', { onclick: () => { close(); fn(); } }, label);
    const m = h('div.popup-menu',
      hasFinished(g.id) ? item('Son denemeyi incele', () => this.onReview(g, lastDone(g.id))) : null,
      item(`Tarafı değiştir (şu an ${g.userColor === 'w' ? 'Beyaz' : 'Siyah'})`, () => this.switchSide(g)),
      item('Oyunu sil', () => this.remove([g])),
      item(`"${g.collection}" koleksiyonunu sil`, () => this.remove(store.games.filter((x) => x.collection === g.collection))));
    const r = ev.target.getBoundingClientRect();
    Object.assign(m.style, { top: r.bottom + 4 + 'px', left: Math.max(8, r.right - 260) + 'px' });
    document.body.append(m);
    setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { close(); document.removeEventListener('click', off); } }), 0);
  }

  switchSide(g) {
    if (attemptsOf(g.id).length) {
      toast('Bu oyunda deneme var; taraf yalnızca hiç oynanmamış oyunlarda değiştirilebilir.');
      return;
    }
    g.userColor = g.userColor === 'w' ? 'b' : 'w';
    delete g.difficulty;
    store.deleteAnalysis(g.id);
    store.saveGames();
    this.renderTable();
  }

  remove(games) {
    modal({
      title: 'Silinsin mi?',
      body: h('p', `${games.length} oyun ve bu oyunlardaki deneme kayıtları silinecek. Puanınız değişmez.`),
      actions: [
        { label: 'Vazgeç' },
        { label: 'Sil', primary: true, onClick: async () => {
          const ids = new Set(games.map((g) => g.id));
          store.games = store.games.filter((g) => !ids.has(g.id));
          for (const id of ids) { delete store.attempts[id]; store.deleteAnalysis(id); }
          await store.saveGames(); await store.saveAttempts();
          this.render();
        } },
      ],
    });
  }

  destroy() { bg.onUpdate = null; }
}

function lastDone(gameId) {
  const d = attemptsOf(gameId).filter((a) => a.status === 'done');
  return d[d.length - 1] || lastAttempt(gameId);
}
