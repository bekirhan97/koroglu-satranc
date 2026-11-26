// "Sıralama": every puzzle type × this week / this month / all time × my group / whole academy.
// Data: leaderboard2() (only students whose parents agreed; names shortened as "Ayşe Y.").
import { supa } from './supa.js';
import { h, clear } from '../../src/renderer/core/dom.js';

export const KINDS = [
  ['antrenman', 'Antrenman'], ['storm3', 'Storm 3 dk'], ['storm5', 'Storm 5 dk'],
  ['rush3', 'Rush 3 dk'], ['rush5', 'Rush 5 dk'], ['survival', 'Hayatta kal'], ['streak', 'Streak'],
];
const PERIODS = [['week', 'Bu hafta'], ['month', 'Bu ay'], ['all', 'Tüm zamanlar']];
const unit = (kind, period) => (kind === 'antrenman' ? (period === 'all' ? 'puan' : 'bulmaca') : kind === 'streak' ? 'seri' : 'bulmaca');
const medal = (n) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : n);

export async function fetchRanking(kind, period, scope, grp = null) {
  const { data, error } = await supa.rpc('leaderboard2', { kind, period, scope, grp });
  if (error) throw error;
  return data || [];
}

function rankRows(rows) {
  let rank = 0, prev = null;
  return rows.slice().sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'tr'))
    .map((r, i) => { if (r.value !== prev) { rank = i + 1; prev = r.value; } return { ...r, rank }; });
}

function table(rows, kind, period, { limit = 50, showGroup = false } = {}) {
  const ranked = rankRows(rows);
  let shown = ranked.slice(0, limit);
  const mine = ranked.find((r) => r.is_me);
  if (mine && !shown.includes(mine)) shown = [...shown, mine];
  if (!shown.length || (shown.length === 1 && shown[0].is_me && !shown[0].value)) return h('div.muted.small.lb-empty', 'Bu dönemde henüz sonuç yok. İlk sen ol!');
  return h('table.lb', shown.map((r) => h('tr' + (r.is_me ? '.me' : ''),
    h('td.lb-rank', medal(r.rank)),
    h('td', r.name, showGroup && r.group_name ? h('span.muted.small', ` · ${r.group_name}`) : null),
    h('td.num', h('b', r.value), h('span.muted.small', ' ' + unit(kind, period))))));
}

// Full view: used by the "Sıralama" module (students) and Antrenör → Sıralama (coaches).
export function rankingView({ isCoach = false, myGroup = null, groups = [] } = {}) {
  const st = { kind: 'antrenman', period: 'week', scope: isCoach ? 'academy' : (myGroup ? 'group' : 'academy'), grp: isCoach ? groups[0] || null : myGroup };
  const pickGroup = isCoach || groups.length > 1;
  const root = h('div.ranking');
  const body = h('div.panel.lb-panel');
  const seg = (items, key, onPick) => h('div.seg.lb-seg', items.map(([k, l]) => h('button' + (st[key] === k ? '.active' : ''), { onclick: () => { st[key] = k; onPick && onPick(); draw(); } }, l)));
  async function draw() {
    const scopeItems = isCoach ? [['academy', 'Akademi geneli'], ...(groups.length ? [['group', 'Grup']] : [])] : [...(myGroup ? [['group', groups.length > 1 ? 'Grubum' : `Grubum (${myGroup})`]] : []), ['academy', 'Akademi geneli']];
    clear(root).append(
      h('div.lb-controls', seg(KINDS, 'kind'), seg(PERIODS, 'period'),
        h('div.btn-row', seg(scopeItems, 'scope'),
          pickGroup && st.scope === 'group' ? h('select.filter-sel', { onchange: (e) => { st.grp = e.target.value; draw(); } }, groups.map((g) => h('option', { value: g, selected: g === st.grp }, g))) : null)),
      body);
    clear(body).append(h('div.muted.small', 'Yükleniyor…'));
    try {
      const rows = await fetchRanking(st.kind, st.period, st.scope, st.scope === 'group' ? st.grp : null);
      clear(body).append(...[
        h('div.panel-title', `${KINDS.find((k) => k[0] === st.kind)[1]} · ${PERIODS.find((p) => p[0] === st.period)[1]}`),
        table(rows, st.kind, st.period, { showGroup: st.scope === 'academy' }),
        h('div.muted.small', st.kind === 'antrenman'
          ? (st.period === 'all' ? 'Tüm zamanlar: bulmaca puanı (Antrenman sekmesindeki puan).' : 'Bu dönemde çözülen bulmaca sayısı (Antrenman + Tekrar).')
          : st.period === 'all' ? 'Bugüne kadarki en iyi skor (rekor).' : 'Bu dönemdeki en iyi skor. Hafta pazartesi, ay ayın 1\'inde yeniden başlar.'),
        isCoach ? h('div.muted.small', 'Yalnızca velisi onay veren öğrenciler sıralamada görünür (Hesaplar → "Sıralamada").') : null].filter(Boolean));
    } catch (e) { clear(body).append(h('div.muted.small', 'Sıralama alınamadı: ' + e.message)); }
  }
  draw();
  return root;
}

// Small home-page card: this week's Antrenman in my group (or academy), with a link to the full module.
export function homeRanking({ myGroup, go }) {
  const host = h('div');
  const scope = myGroup ? 'group' : 'academy';
  fetchRanking('antrenman', 'week', scope).then((rows) => {
    if (rows.length < 2) return;
    host.append(h('div.panel.lb-panel',
      h('div.panel-title', `🏆 Bu hafta · ${myGroup ? myGroup : 'Akademi'}`, h('button.btn.small.ghost', { style: { marginLeft: 'auto' }, onclick: () => go('siralama') }, 'Bütün sıralamalar →')),
      table(rows, 'antrenman', 'week', { limit: 5 })));
  }).catch(() => {});
  return host;
}

export default {
  id: 'siralama',
  title: 'Sıralama',
  icon: '🏆',
  description: 'Her bulmaca türünde grup içi ve akademi geneli sıralama: bu hafta, bu ay, tüm zamanlar.',
  ready: true,
  async mount(root) {
    const me = window.__me || {};
    // a student can be in several groups (Program): let them pick which one
    let groups = me.group_name ? [me.group_name] : [];
    try {
      const { data } = await supa.from('classes').select('name, kind');
      groups = [...new Set([...groups, ...(data || []).filter((c) => c.kind === 'grup').map((c) => c.name)])].sort((a, b) => a.localeCompare(b, 'tr'));
    } catch (e) { /* keep the primary group */ }
    const myGroup = me.group_name || groups[0] || null;
    clear(root).append(h('div.module', h('div.module-head', h('h2', this.title)),
      h('div.module-body', rankingView({ isCoach: false, myGroup, groups }))));
    return { unmount() {} };
  },
};
