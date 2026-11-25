// Puzzles module ("Bulmacalar"): rated training from the built-in Lichess set, theme training,
// user PGN puzzle sets, and statistics.
import { h, clear, modal, toast, fmtDate, fmtTime } from '../../core/dom.js';
import { store } from '../../core/store.js';
import { ratingChart, barChart } from '../../core/charts.js';
import { pdata, pickPuzzle, themeCounts, parsePuzzlePgn, recordResult, dueReviews, nextReviewAt, gradeReview, themeAnalysis, MIN_N, GRADUATE_LEVEL } from './data.js';
import { LEVEL_NAMES } from '../../core/srs.js';
import { showStorm } from './storm.js';
import { PuzzleSolver } from './solver.js';
import { THEME_GROUPS, themeName } from './themes.js';

const OFFSETS = [[-300, 'Daha kolay'], [0, 'Normal'], [300, 'Daha zor']];

export default {
  id: 'puzzles',
  title: 'Bulmacalar',
  icon: '🧩',
  description: 'Lichess veritabanından 60.000 puanlı bulmaca ve kendi PGN bulmaca setleriniz. Temalara göre çalışın, bulmaca puanınızı takip edin.',
  ready: true,
  homeInfo: () => { const d = dueReviews().length; return `Bulmaca puanı: ${store.profile.ratings.puzzles.r.toFixed(0)} · ${pdata.history.length} çözüldü` + (d ? ` · ${d} tekrar bekliyor` : ''); },

  mount(root) {
    let current = null;
    const state = { theme: '', offset: 0 };
    const tabsHost = h('div.tabs');
    const body = h('div.module-body');
    clear(root).append(h('div.module', h('div.module-head', h('h2', this.title), tabsHost), body));
    const swap = (v) => { if (current && current.destroy) current.destroy(); current = v; };
    const setTabs = (active) => clear(tabsHost).append(...[
      ['train', 'Antrenman', showTrain], ['storm', '⚡ Storm', showStormTab], ['review', 'Tekrar', showReview], ['themes', 'Temalar', showThemes], ['sets', 'Setlerim', showSets], ['stats', 'İstatistikler', showStats],
    ].map(([k, l, f]) => h('button.tab' + (active === k ? '.active' : ''), { onclick: f }, l,
      k === 'review' && dueReviews().length ? h('span.count', dueReviews().length) : null)),
    pill);
    const pill = h('span.rating-pill');
    const refreshPill = () => { pill.textContent = `Bulmaca puanı: ${store.profile.ratings.puzzles.r.toFixed(0)}`; };
    refreshPill();
    window.addEventListener('ratings-changed', refreshPill);

    const loading = (text) => clear(body).append(h('div.empty', text));

    // ---------- rated training ----------
    async function showTrain() {
      setTabs('train'); swap(null);
      if (!pdata.db) { loading('Bulmacalar yükleniyor…'); await pdata.loadDb(); }
      next();
    }
    function next() {
      setTabs('train');
      const target = store.profile.ratings.puzzles.r + state.offset;
      let weak = null;
      if (state.theme === '__weak') {
        weak = themeAnalysis(pdata.history, store.profile.ratings.puzzles.r).weakest;
        if (!weak.length) { toast(`Henüz zayıf tema bulunamadı. Her temada en az ${MIN_N} bulmaca çözünce belirlenir.`); state.theme = ''; weak = null; }
      }
      const p = weak ? pickPuzzle({ target, themes: weak }) : pickPuzzle({ target, theme: state.theme });
      const bar = h('div.pz-bar',
        h('span.muted', 'Tema:'),
        h('select', { onchange: (e) => { state.theme = e.target.value; next(); } },
          h('option', { value: '' }, 'Karışık'),
          h('option', { value: '__weak', selected: state.theme === '__weak' }, '★ Zayıf temalarım'),
          THEME_GROUPS.map(([g, ts]) => h('optgroup', { label: g }, ts.map((t) => h('option', { value: t, selected: state.theme === t }, themeName(t)))))),
        h('span.muted', 'Zorluk:'),
        h('div.seg', OFFSETS.map(([v, l]) => h('button' + (state.offset === v ? '.active' : ''), { onclick: () => { state.offset = v; next(); } }, l))));
      if (!p) { swap(null); clear(body).append(bar, h('div.empty', 'Bu filtreye uygun yeni bulmaca kalmadı.')); return; }
      const host = h('div.pz-host');
      clear(body).append(host);
      const v = new PuzzleSolver(host, p, { rated: true, onNext: next, header: bar });
      swap(v); v.mount();
    }

    // ---------- Puzzle Storm ----------
    function showStormTab() {
      setTabs('storm'); swap(null);
      showStorm(body, { setActive: (stop) => swap({ destroy: stop }) });
    }

    // ---------- missed puzzles (spaced repetition, unrated) ----------
    function showReview() {
      setTabs('review'); swap(null);
      const due = dueReviews();
      const total = Object.keys(pdata.review).length;
      if (!due.length) {
        const nx = nextReviewAt();
        clear(body).append(h('div.empty',
          h('div.big-icon', '🔁'),
          h('h3', total ? 'Şu an tekrar edilecek bulmaca yok' : 'Tekrar listesi boş'),
          h('p', 'Çözemediğiniz (ya da ipucu/çözüm gördüğünüz) bulmacalar buraya gelir ve aralıklı tekrarla yeniden sorulur: 4 saat → 1 gün → 3 gün → 1 hafta → 2 hafta. 2 hafta sonra da doğru çözerseniz öğrenilmiş sayılır.'),
          h('p.muted', 'Tekrarlar puanınızı değiştirmez.'),
          total ? h('p', `Listede ${total} bulmaca var. Sıradaki tekrar: ${fmtDate(nx)} ${new Date(nx).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`) : null,
          pdata.graduated ? h('p.ok-text', `✓ ${pdata.graduated} bulmaca öğrenildi`) : null));
        return;
      }
      const item = due[0];
      const host = h('div.pz-host');
      clear(body).append(host);
      const header = h('div.pz-bar', h('b', 'Tekrar'), h('span.muted', `${due.length} bulmaca bekliyor`),
        h('span.chip', `Seviye: ${LEVEL_NAMES[item.lv] || item.lv}`), h('span.muted', `${item.lapses} kez kaçırıldı`), h('span.spacer'),
        h('span.muted.small', 'Puanı etkilemez'));
      const v = new PuzzleSolver(host, item.p, {
        rated: false, header,
        onFinish: ({ ok }) => {
          const r = gradeReview(item.key, ok);
          if (r && r.graduated) toast('Bu bulmacayı öğrendiniz! Tekrar listesinden çıkarıldı.', 'ok');
          else if (r) toast(ok ? `Doğru. Sonraki tekrar: ${LEVEL_NAMES[r.lv]} sonra` : 'Yanlış. 4 saat sonra yeniden sorulacak.', ok ? 'ok' : '');
          return 0;
        },
        onNext: showReview,
        nextLabel: due.length > 1 ? 'Sonraki tekrar ▸' : 'Bitir',
      });
      swap(v); v.mount();
    }

    // ---------- themes ----------
    async function showThemes() {
      setTabs('themes'); swap(null);
      if (!pdata.db) { loading('Bulmacalar yükleniyor…'); await pdata.loadDb(); }
      const counts = themeCounts();
      const perf = themePerf();
      const ta = themeAnalysis(pdata.history, store.profile.ratings.puzzles.r);
      const verdict = Object.fromEntries(ta.rows.map((r) => [r.theme, r.verdict]));
      clear(body).append(h('div.theme-page',
        ta.weakest.length ? h('div.panel.weak-banner', h('div', h('b', 'Zayıf temalarınız: '), ta.weakest.map(themeName).join(', ')),
          h('button.btn.primary.small', { onclick: () => { state.theme = '__weak'; showTrain(); } }, 'Zayıf temalarımı çalış ▸')) : null,
        THEME_GROUPS.map(([g, ts]) => h('div',
        h('h3.group-title', g),
        h('div.theme-grid', ts.filter((t) => counts[t]).map((t) => {
          const pf = perf[t];
          return h('button.theme-card' + (verdict[t] && verdict[t] !== 'az' && verdict[t] !== 'normal' ? '.' + verdict[t] : ''), { onclick: () => { state.theme = t; showTrain(); } },
            h('div.tc-name', themeName(t)),
            h('div.tc-sub', `${counts[t].toLocaleString('tr-TR')} bulmaca`),
            pf ? h('div.tc-perf', `%${Math.round((100 * pf.ok) / pf.n)} başarı (${pf.n})`) : null);
        }))))));
    }

    // ---------- PGN sets ----------
    function showSets() {
      setTabs('sets'); swap(null);
      const importBtn = h('button.btn.primary', { onclick: async () => {
        const files = await window.api.openPgn();
        let added = 0, bad = 0;
        for (const f of files) {
          const { set, bad: b } = parsePuzzlePgn(f.text, f.name);
          bad += b;
          if (set.puzzles.length) { pdata.sets.push(set); added += set.puzzles.length; }
        }
        await pdata.saveSets();
        if (files.length) toast(`${added} bulmaca eklendi` + (bad ? `, ${bad} okunamadı` : ''), added ? 'ok' : '');
        showSets();
      } }, '+ PGN Bulmaca Seti İçe Aktar');
      const list = pdata.sets.map((s) => {
        const pr = pdata.progress[s.id] || {};
        const ok = s.puzzles.filter((p) => pr[p.id] === 'ok').length;
        const fail = s.puzzles.filter((p) => pr[p.id] === 'fail').length;
        return h('div.set-card',
          h('div', h('div.set-name', s.name), h('div.muted', `${s.puzzles.length} bulmaca · ${ok} çözüldü · ${fail} hatalı · eklendi ${fmtDate(s.addedAt)}`),
            h('div.progress', h('span.ok', { style: { width: `${(100 * ok) / s.puzzles.length}%` } }), h('span.fail', { style: { width: `${(100 * fail) / s.puzzles.length}%` } }))),
          h('div.set-actions',
            h('button.btn.primary.small', { onclick: () => solveSet(s, 'next') }, ok + fail ? 'Devam' : 'Başla'),
            fail ? h('button.btn.small', { onclick: () => solveSet(s, 'fails') }, 'Yanlışları çöz') : null,
            h('button.btn.small.ghost', { onclick: () => { delete pdata.progress[s.id]; pdata.saveProgress(); showSets(); } }, 'Sıfırla'),
            h('button.btn.small.ghost', { onclick: () => modal({ title: 'Set silinsin mi?', body: h('p', `"${s.name}" seti ve ilerlemesi silinecek.`),
              actions: [{ label: 'Vazgeç' }, { label: 'Sil', primary: true, onClick: () => { pdata.sets = pdata.sets.filter((x) => x !== s); delete pdata.progress[s.id]; pdata.saveSets(); pdata.saveProgress(); showSets(); } }] }) }, 'Sil')));
      });
      clear(body).append(h('div.sets-page',
        h('div.toolbar', importBtn, h('span.muted', 'Her oyunda [FEN] etiketi olmalı. FEN\'de sırası gelen taraf çözer, ana hat çözümdür.')),
        list.length ? list : h('div.empty', h('h3', 'Henüz set yok'), h('p', 'Öğrencilerinize kendi hazırladığınız bulmaca setlerini PGN olarak verebilirsiniz.'))));
    }

    function solveSet(set, mode) {
      const pr = (pdata.progress[set.id] = pdata.progress[set.id] || {});
      const queue = set.puzzles.filter((p) => (mode === 'fails' ? pr[p.id] === 'fail' : !pr[p.id]));
      if (!queue.length) { toast(mode === 'fails' ? 'Hatalı bulmaca kalmadı' : 'Set tamamlandı!', 'ok'); showSets(); return; }
      setTabs('sets');
      const p = queue[0];
      const idx = set.puzzles.indexOf(p) + 1;
      const host = h('div.pz-host');
      clear(body).append(host);
      const header = h('div.pz-bar', h('b', set.name), h('span.muted', `Bulmaca ${idx}/${set.puzzles.length}`), h('span.spacer'),
        h('button.btn.small.ghost', { onclick: showSets }, 'Setlere dön'));
      const v = new PuzzleSolver(host, p, {
        rated: false, header,
        onFinish: ({ ok, ms }) => { pr[p.id] = ok ? 'ok' : 'fail'; pdata.saveProgress(); recordResult({ ...p, id: `${set.id}:${p.id}` }, { ok, ms, rated: false }); return 0; },
        onNext: () => solveSet(set, mode),
        nextLabel: queue.length > 1 ? 'Sonraki ▸' : 'Bitir',
      });
      swap(v); v.mount();
    }

    // ---------- statistics ----------
    function showStats() {
      setTabs('stats'); swap(null);
      const pr = store.profile.ratings.puzzles;
      const hist = pdata.history;
      const rated = hist.filter((x) => x.rated);
      const ok = hist.filter((x) => x.ok).length;
      let streak = 0, best = 0;
      for (const x of hist) { streak = x.ok ? streak + 1 : 0; best = Math.max(best, streak); }
      const perf = themePerf();
      const themePanel = () => {
        const ta = themeAnalysis(hist, pr.r);
        const rows = ta.rows.filter((r) => r.verdict !== 'az');
        const few = ta.rows.filter((r) => r.verdict === 'az').length;
        const label = { zayif: 'Zayıf', normal: 'Normal', guclu: 'Güçlü' };
        return h('div.panel.theme-analysis', h('div.panel-title', 'Tema analizi'),
          h('p.muted.small', `Her temadaki performansınız (çözdüğünüz bulmacaların zorluğu ve sonucuna göre) bulmaca puanınızla (${pr.r.toFixed(0)}) karşılaştırılır. En az ${MIN_N} puanlı bulmaca gerekir.`),
          rows.length ? h('table.ta', h('tbody', rows.map((r) => h('tr.' + r.verdict,
            h('td', themeName(r.theme)),
            h('td.num', `${r.ok}/${r.n}`),
            h('td.bar', h('span.ta-track', h('span.ta-zero'), h('span.ta-fill', { style: r.diff < 0
              ? { right: '50%', width: `${Math.min(50, (-r.diff / 400) * 50)}%` }
              : { left: '50%', width: `${Math.min(50, (r.diff / 400) * 50)}%` } }))),
            h('td.num', (r.diff >= 0 ? '+' : '') + Math.round(r.diff)),
            h('td', h('span.verdict', label[r.verdict])),
            h('td', h('button.btn.small.ghost', { onclick: () => { state.theme = r.theme; showTrain(); } }, 'Çalış')))))) : h('div.muted', 'Henüz yeterli veri yok. Karışık bulmaca çözdükçe analiz oluşur.'),
          few ? h('div.muted.small', `${few} temada henüz yeterli bulmaca yok.`) : null,
          ta.weakest.length ? h('button.btn.primary.small', { style: { marginTop: '8px' }, onclick: () => { state.theme = '__weak'; showTrain(); } }, 'Zayıf temalarımı çalış ▸') : null);
      };
      const avgMs = hist.length ? hist.reduce((a, x) => a + (x.ms || 0), 0) / hist.length : 0;
      clear(body).append(h('div.stats-page',
        h('div.cards',
          h('div.card', h('div.card-k', 'Bulmaca puanı'), h('div.card-v', pr.r.toFixed(0)), h('div.muted', `sapma ±${Math.round(pr.rd)}`)),
          h('div.card', h('div.card-k', 'Çözülen bulmaca'), h('div.card-v', hist.length), h('div.muted', `${rated.length} puanlı`)),
          h('div.card', h('div.card-k', 'Başarı oranı'), h('div.card-v', hist.length ? `%${Math.round((100 * ok) / hist.length)}` : '–'), h('div.muted', `ortalama süre ${fmtTime(avgMs)}`)),
          h('div.card', h('div.card-k', 'Seri'), h('div.card-v', streak), h('div.muted', `en iyi seri ${best}`))),
        h('div.panel', h('div.panel-title', 'Puan grafiği'), ratingChart(pr.history)),
        h('div.two-col',
          themePanel(),
          h('div.panel', h('div.panel-title', 'Son bulmacalar'),
            hist.length ? h('table.kv.recent', hist.slice(-12).reverse().map((x) => h('tr',
              h('td', fmtDate(x.t)), h('td', x.src === 'lichess' ? `#${x.id}` : 'Set'), h('td', x.r || '–'),
              h('td', { class: x.ok ? 'ok-text' : 'bad-text' }, x.ok ? '✓' : '✗'),
              h('td', x.rated ? (x.d >= 0 ? '+' : '') + x.d : '')))) : h('div.muted', 'Henüz bulmaca çözülmedi.')))));
    }

    showTrain();
    return { unmount: () => { swap(null); window.removeEventListener('ratings-changed', refreshPill); } };
  },
};

function themePerf() {
  const perf = {};
  for (const x of pdata.history) for (const t of x.themes || []) {
    const p = (perf[t] = perf[t] || { n: 0, ok: 0 });
    p.n++; if (x.ok) p.ok++;
  }
  return perf;
}

// Load history/sets once at startup.
pdata.load();
