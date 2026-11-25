// Guess-the-Move statistics: rating graph, totals, score by difficulty, match types.
import { h, clear, fmtTime, fmtDate } from '../../core/dom.js';
import { store } from '../../core/store.js';
import { attemptStats } from './session.js';
import { gameTitle } from './widgets.js';
import { ratingChart, barChart } from '../../core/charts.js';

export function renderStats(root) {
  const gtm = store.profile.ratings.gtm;
  const all = [];
  const games = new Map(store.games.map((g) => [g.id, g]));
  for (const [gid, atts] of Object.entries(store.attempts)) for (const a of atts) all.push({ a, g: games.get(gid) });
  const rated = all.filter((x) => x.a.rated);
  const moves = all.flatMap((x) => Object.values(x.a.moves));
  const tot = { games: all.filter((x) => x.a.status === 'done').length, moves: moves.length };
  const sum = (arr, f) => arr.reduce((acc, m) => acc + f(m), 0);
  const avg = moves.length ? sum(moves, (m) => m.score) / moves.length : 0;
  const masterPct = moves.length ? (100 * moves.filter((m) => m.uci === m.masterUci).length) / moves.length : 0;
  const enginePct = moves.length ? (100 * moves.filter((m) => m.uci === m.bestUci).length) / moves.length : 0;
  const time = sum(moves, (m) => m.timeMs || 0);

  // score by position difficulty
  const buckets = [[0, 1200], [1200, 1400], [1400, 1600], [1600, 1800], [1800, 9999]];
  const byDiff = buckets.map(([a, b]) => {
    const ms = moves.filter((m) => m.posRating >= a && m.posRating < b);
    return { label: b > 5000 ? `${a}+` : `${a}–${b}`, value: ms.length ? sum(ms, (m) => m.score) / ms.length : 0, n: ms.length };
  });
  // match types (master > engine > opening > other), as in ChessTempo
  const types = { 'Usta': 0, 'Motor': 0, 'Açılış': 0, 'Eşleşmeyen': 0 };
  for (const m of moves) {
    if (m.uci === m.masterUci) types['Usta']++;
    else if (m.uci === m.bestUci) types['Motor']++;
    else if (m.type === 'opening') types['Açılış']++;
    else types['Eşleşmeyen']++;
  }
  const typeRows = Object.entries(types).map(([label, n]) => ({ label, value: moves.length ? (100 * n) / moves.length : 0, n }));
  const scoreDist = [[10, 99, '10+'], [9.5, 10, '9.5–10'], [6, 9.5, '6–9.5'], [4.5, 6, '4.5–6'], [3.5, 4.5, '3.5–4.5'], [0, 3.5, '0–3.5']].map(([a, b, label]) => {
    const n = moves.filter((m) => m.score >= a && m.score < b).length;
    return { label, value: moves.length ? (100 * n) / moves.length : 0, n };
  });

  const recent = all.filter((x) => x.a.status === 'done' && x.g).sort((p, q) => q.a.finishedAt - p.a.finishedAt).slice(0, 12);

  clear(root).append(h('div.stats-page',
    h('div.cards',
      h('div.card', h('div.card-k', 'Hamleyi Tahmin Et puanı'), h('div.card-v', gtm.r.toFixed(0)), h('div.muted', `sapma ±${Math.round(gtm.rd)}`)),
      h('div.card', h('div.card-k', 'Tamamlanan oyun'), h('div.card-v', tot.games), h('div.muted', `${rated.length} puanlı deneme`)),
      h('div.card', h('div.card-k', 'Tahmin edilen hamle'), h('div.card-v', tot.moves), h('div.muted', `toplam süre ${fmtTime(time)}`)),
      h('div.card', h('div.card-k', 'Ortalama skor'), h('div.card-v', avg.toFixed(2)), h('div.muted', `usta %${masterPct.toFixed(0)} · motor %${enginePct.toFixed(0)}`))),
    h('div.panel', h('div.panel-title', 'Puan grafiği'), ratingChart(gtm.history)),
    h('div.two-col',
      h('div.panel', h('div.panel-title', 'Pozisyon zorluğuna göre ortalama skor'), barChart(byDiff, { max: 12 })),
      h('div.panel', h('div.panel-title', 'Hamle türü dağılımı'), barChart(typeRows, { max: 100, fmt: (v) => '%' + v.toFixed(0) }))),
    h('div.two-col',
      h('div.panel', h('div.panel-title', 'Skor dağılımı'), barChart(scoreDist, { max: 100, fmt: (v) => '%' + v.toFixed(0) })),
      h('div.panel', h('div.panel-title', 'Son oyunlar'),
        recent.length ? h('table.kv.recent', recent.map(({ a, g }) => {
          const st = attemptStats(a);
          return h('tr', h('td', fmtDate(a.finishedAt)), h('td', gameTitle(g)), h('td', st.avg.toFixed(1)),
            h('td', a.rated ? ((st.ratingChange >= 0 ? '+' : '') + st.ratingChange.toFixed(1)) : 'puansız'));
        })) : h('div.muted', 'Henüz tamamlanan oyun yok.')))));
}
