// Antrenör → "Çalışma raporu": what each student (and each group) did in a period.
import { supa } from './supa.js';
import { h, clear, toast } from '../../src/renderer/core/dom.js';
import { students as reports } from '../../src/renderer/core/assign.js';
import { syncReports, academyStudents, filterSelect, filterTest } from './coach.js';
import { PERIODS, COLS, periodRange, rangeMs, studentRow, summarize, groupRows, toCsv } from './study-core.js';

const state = { period: 'd7', view: 'students', sort: 'puzzles', desc: true };
const lichessCache = new Map(); // `${username}|${since}|${until}` -> count

const fmtKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }); };
const num = (v, digits = 0) => (v == null ? '–' : v === 0 ? h('span.muted', '0') : (Math.round(v * 10 ** digits) / 10 ** digits).toLocaleString('tr-TR'));
const pct = (v) => (v == null ? h('span.muted', '–') : `%${Math.round(v * 100)}`);

async function lichessCount(username, since, until) {
  const key = `${username}|${since}|${until}`;
  if (lichessCache.has(key)) return lichessCache.get(key);
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(username)}?since=${since}&until=${until}&max=500&moves=false&tags=false&clocks=false&evals=false&opening=false`, { headers: { Accept: 'application/x-ndjson' } });
  if (res.status === 429) throw new Error('Lichess çok sık istek dedi, bir dakika sonra tekrar deneyin.');
  if (!res.ok) throw new Error('Lichess: ' + res.status);
  const n = (await res.text()).split('\n').filter((l) => l.trim()).length;
  lichessCache.set(key, n);
  return n;
}

export async function studyTab(body) {
  clear(body).append(h('div.empty', 'Yükleniyor…'));
  await syncReports().catch(() => 0);
  const list = await academyStudents().catch(() => []);
  const host = h('div');
  let rows = [], range, ms;

  async function load() {
    range = periodRange(state.period);
    ms = rangeMs(range);
    const [{ data: scores }, { data: sessions }, { data: att }] = await Promise.all([
      supa.from('scores').select('student_id, kind, created_at').gte('created_at', new Date(ms.since).toISOString()).lte('created_at', new Date(ms.until).toISOString()),
      supa.from('sessions').select('id, date, status').gte('date', range.from).lte('date', range.to),
      supa.from('attendance').select('session_id, student_id, status'),
    ]);
    const dateOf = Object.fromEntries((sessions || []).filter((s) => s.status !== 'cancelled').map((s) => [s.id, s.date]));
    const attendance = (att || []).filter((a) => dateOf[a.session_id]).map((a) => ({ ...a, date: dateOf[a.session_id] }));
    rows = list.map((st) => {
      const rep = reports.map[st.id] && reports.map[st.id].last;
      const u = rep && rep.lichess && rep.lichess.username;
      const lc = u ? lichessCache.get(`${u}|${ms.since}|${ms.until}`) : undefined;
      const r = studentRow(st, rep, { ...range, scores: scores || [], attendance, lichess: lc == null ? null : lc });
      r.lichessUser = u || null;
      r.updated = rep && rep.createdAt;
      r.st = st;
      return r;
    });
  }

  async function countLichess(btn) {
    const todo = rows.filter((r) => r.lichessUser && filterTest(r.st));
    if (!todo.length) { toast('Lichess hesabını bağlamış öğrenci yok', 'error'); return; }
    btn.disabled = true;
    try {
      for (let i = 0; i < todo.length; i++) {
        btn.textContent = `Lichess sayılıyor… ${i + 1}/${todo.length}`;
        todo[i].lichess = await lichessCount(todo[i].lichessUser, ms.since, ms.until);
      }
    } catch (e) { toast(e.message, 'error'); }
    draw();
  }

  function table() {
    const vis = rows.filter((r) => filterTest(r.st));
    const k = state.sort;
    const val = (r) => (k === 'name' ? r.name : r[k] == null ? -1 : r[k]);
    vis.sort((a, b) => (k === 'name' ? a.name.localeCompare(b.name, 'tr') : (val(b) - val(a))) * (state.desc || k === 'name' ? 1 : -1));
    const sum = summarize(vis);
    const th = (key, label, title) => h('th.sortable' + (state.sort === key ? '.sorted' : ''), { title: title || '', onclick: () => { state.desc = state.sort === key ? !state.desc : true; state.sort = key; draw(); } }, label);
    const cell = (r, key) => key === 'lessons' ? h('td', r.lessonsTotal ? `${r.lessonsCame}/${r.lessonsTotal}` : h('span.muted', '–')) : h('td', num(r[key]));
    if (state.view === 'groups') {
      const gs = groupRows(vis);
      return h('table.kv.study-table', h('thead', h('tr', h('th', 'Grup'), h('th', 'Öğrenci'), COLS.map(([key, s, l]) => h('th', { title: l }, s)))),
        h('tbody', gs.map((g) => h('tr', h('td', h('b', g.name)), h('td', g.sum.n),
          COLS.map(([key]) => h('td', key === 'lessons' ? pct(g.sum.total.lessons) : h('div', num(g.sum.total[key]), g.sum.total[key] ? h('div.muted.small', `kişi başı ${num(g.sum.avg[key], 1)}`) : null)))))),
        h('tfoot', h('tr', h('td', h('b', 'Toplam')), h('td', sum.n), COLS.map(([key]) => h('td', h('b', key === 'lessons' ? pct(sum.total.lessons) : num(sum.total[key])))))));
    }
    return h('table.kv.study-table', h('thead', h('tr', th('name', 'Öğrenci'), COLS.map(([key, s, l]) => th(key, s, l)))),
      h('tbody', vis.map((r) => h('tr' + (r.hasReport ? '' : '.no-report'),
        h('td', h('b', r.name), h('div.muted.small', [r.group, !r.hasReport ? 'henüz giriş yok' : r.updated ? 'güncel: ' + new Date(r.updated).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : ''].filter(Boolean).join(' · '))),
        COLS.map(([key]) => cell(r, key))))),
      h('tfoot',
        h('tr', h('td', h('b', `Toplam (${sum.n} öğrenci)`)), COLS.map(([key]) => h('td', h('b', key === 'lessons' ? (sum.total.lessonsTotal ? `${sum.total.lessonsCame}/${sum.total.lessonsTotal}` : '–') : num(sum.total[key]))))),
        h('tr', h('td', 'Öğrenci başı ortalama'), COLS.map(([key]) => h('td', key === 'lessons' ? pct(sum.avg.lessons) : num(sum.avg[key], 1))))));
  }

  function draw() {
    const label = `${PERIODS.find((p) => p[0] === state.period)[1]} (${fmtKey(range.from)}${range.from !== range.to ? ' – ' + fmtKey(range.to) : ''})`;
    const lichessBtn = h('button.btn.small.ghost', { onclick: (e) => countLichess(e.target) }, 'Lichess maçlarını say');
    clear(host).append(
      h('div.study-bar',
        h('select.filter-sel', { onchange: async (e) => { state.period = e.target.value; await load(); draw(); } }, PERIODS.map(([v, l]) => h('option', { value: v, selected: v === state.period }, l))),
        h('div.seg', [['students', 'Öğrenci öğrenci'], ['groups', 'Grup grup']].map(([v, l]) => h('button' + (state.view === v ? '.active' : ''), { onclick: () => { state.view = v; draw(); } }, l))),
        filterSelect(list, draw),
        h('span.spacer'),
        lichessBtn,
        h('button.btn.small.ghost', { onclick: () => {
          const vis = rows.filter((r) => filterTest(r.st));
          const a = h('a', { href: URL.createObjectURL(new Blob([toCsv(vis, label)], { type: 'text/csv;charset=utf-8' })), download: `calisma-raporu-${range.from}_${range.to}.csv` });
          document.body.append(a); a.click(); a.remove();
        } }, 'Excel\'e aktar')),
      h('div.muted.small.study-note', h('b', label), ' · Rakamlar öğrencinin cihazından gelen son rapora göredir (öğrenci çalıştıkça güncellenir). Sütun başlığına tıklayarak sıralayabilirsin.'),
      h('div.study-scroll', table()));
  }

  await load();
  draw();
  clear(body).append(h('div.sets-page', host));
}
