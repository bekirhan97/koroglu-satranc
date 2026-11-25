// Coach home: students who need attention — missed the last two lessons, inactive for a week,
// homework due soon but not opened, puzzle rating dropping. Built from data the system already has.
import { supa } from './supa.js';
import { h, clear } from '../../src/renderer/core/dom.js';
import { students as reports } from '../../src/renderer/core/assign.js';
import { academyStudents, meta } from './coach.js';

import { computeAlerts, keyOf, DAY } from './alerts-core.js';
let scope = null;

const KINDS = [
  ['absent', '🚫 Derse gelmeyenler'],
  ['inactive', '💤 Çalışmayanlar'],
  ['homework', '📚 Ödevini açmayanlar'],
  ['rating', '📉 Puanı düşenler'],
];

export function coachAlerts(me, go) {
  const host = h('div');
  (async () => {
    const list = await academyStudents();
    const mine = list.filter((st) => (st.coaches || []).includes(me.id));
    if (scope == null) scope = me.coach_id && mine.length ? 'mine' : 'all';
    const from = keyOf(new Date(Date.now() - 60 * DAY));
    const [{ data: assignments }, { data: sessions }, { data: attendance }] = await Promise.all([
      supa.from('assignments').select('id, title, package, assignment_targets(student_id)'),
      supa.from('sessions').select('id, date, status').gte('date', from),
      supa.from('attendance').select('session_id, student_id, status'),
    ]);
    const reps = Object.fromEntries(Object.entries(reports.map).map(([id, x]) => [id, x.last]));
    const draw = () => {
      const pool = scope === 'mine' ? mine : list;
      const all = computeAlerts({ list: pool, reps, assignments: assignments || [], sessions: (sessions || []).filter((s) => s.status !== 'cancelled'), attendance: attendance || [] });
      const name = (sid) => (meta.students[sid] ? meta.students[sid].display_name : 'Öğrenci');
      const scopeSel = mine.length ? h('select.filter-sel', { onchange: (e) => { scope = e.target.value; draw(); } },
        h('option', { value: 'mine', selected: scope === 'mine' }, 'Benim öğrencilerim'), h('option', { value: 'all', selected: scope === 'all' }, 'Bütün akademi')) : null;
      clear(host).append(h('div.panel.alerts-panel',
        h('div.panel-title', '⚠️ Dikkat edilecekler', h('span.spacer'), scopeSel),
        all.length ? h('div.alerts-grid', KINDS.map(([k, label]) => {
          const rows = all.filter((a) => a.kind === k);
          if (!rows.length) return null;
          const more = rows.length > 5 ? h('button.link-btn', { onclick: (e) => { e.target.parentElement.querySelectorAll('.alert-row.hidden').forEach((x) => x.classList.remove('hidden')); e.target.remove(); } }, `+${rows.length - 5} daha`) : null;
          return h('div.alert-group', h('div.alert-k', label, h('span.chip', rows.length)),
            rows.map((a, i) => h('div.alert-row' + (i >= 5 ? '.hidden' : ''), h('b', name(a.sid)), h('span.muted.small', a.text))), more);
        }))
          : h('div.muted', 'Şu an dikkat edilecek bir durum yok 👍'),
        h('div.row-btns', { style: { marginTop: '8px' } }, h('button.btn.small.ghost', { onclick: () => go('teacher') }, 'Öğrencilerim ▸'))));
    };
    draw();
  })().catch(() => {});
  return host;
}
