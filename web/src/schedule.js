// "Program": weekly lessons of the academy.
//  - classes: a group lesson or a private lesson that repeats every week (day, time, place, coaches, students)
//  - sessions: one particular day of a class (created when attendance / a note / a cancellation is entered)
//    or a one-off lesson (class_id empty: make-up lesson, extra private lesson)
//  - attendance: geldi / gelmedi / mazeretli per student and session
// Coaches see and edit everything in the academy; students see their own lessons, cancellations and notes.
import { supa } from './supa.js';
import { h, clear, modal, toast, fmtDate } from '../../src/renderer/core/dom.js';
import { academyStudents, academyCoaches, meta } from './coach.js';

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const ATT = [['geldi', 'Geldi', '✓'], ['gelmedi', 'Gelmedi', '✗'], ['mazeretli', 'Mazeretli', 'M']];

// ---------- dates (local time) ----------
const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); };
const hm = (t) => String(t || '').slice(0, 5);
const endTime = (t, min) => { const [hh, mm] = hm(t).split(':').map(Number); const e = hh * 60 + mm + (min || 60); return `${pad(Math.floor(e / 60) % 24)}:${pad(e % 60)}`; };
const fmtDay = (d) => `${d.getDate()} ${['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'][d.getMonth()]}`;

// All lessons between two dates: recurring classes expanded, merged with stored sessions and one-off lessons.
export function expandLessons(classes, sessions, from, days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i), key = dateKey(d), wd = ((d.getDay() + 6) % 7) + 1;
    for (const c of classes) {
      if (c.weekday !== wd) continue;
      if (c.created_at && dateKey(new Date(c.created_at)) > key) continue; // not before the class existed
      const s = sessions.find((x) => x.class_id === c.id && x.date === key);
      out.push({ key: c.id + '|' + key, date: key, cls: c, session: s || null, name: c.name, kind: c.kind, start: hm(s ? s.start_time : c.start_time),
        duration: s ? s.duration_min : c.duration_min, location: (s && s.location) || c.location, coach_ids: c.coach_ids, student_ids: (c.class_members || []).map((m) => m.student_id),
        cancelled: !!(s && s.status === 'cancelled'), note: s ? s.note : null });
    }
    for (const s of sessions.filter((x) => !x.class_id && x.date === key)) {
      out.push({ key: s.id, date: key, cls: null, session: s, name: s.title || (s.makeup ? 'Telafi dersi' : 'Ders'), kind: 'tek', makeup: s.makeup, start: hm(s.start_time),
        duration: s.duration_min, location: s.location, coach_ids: s.coach_ids, student_ids: s.student_ids, cancelled: s.status === 'cancelled', note: s.note });
    }
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

async function loadAll(from, to) {
  const [{ data: classes, error: e1 }, { data: sessions, error: e2 }] = await Promise.all([
    supa.from('classes').select('*, class_members(student_id)').order('weekday').order('start_time'),
    supa.from('sessions').select('*').gte('date', dateKey(from)).lte('date', dateKey(to)),
  ]);
  if (e1 || e2) throw e1 || e2;
  const ids = sessions.map((s) => s.id);
  let attendance = [];
  if (ids.length) {
    const { data } = await supa.from('attendance').select('*').in('session_id', ids);
    attendance = data || [];
  }
  return { classes, sessions, attendance };
}

const coachShort = (ids) => (ids || []).map((id) => (meta.coaches[id] ? meta.coaches[id].display_name.split(' ')[0] : null)).filter(Boolean).join(', ');
const studentName = (id) => (meta.students[id] ? meta.students[id].display_name : 'Öğrenci');

export default {
  id: 'program',
  title: 'Program',
  icon: '📅',
  description: 'Ders saatleri, gruplar ve özel dersler; yoklama ve ders notları.',
  ready: true,
  homeInfo: async () => {
    try { const n = await nextLessons(1); return n[0] ? `Sonraki: ${n[0].dayLabel} ${n[0].start}` : ''; } catch (e) { return ''; }
  },
  async mount(root) {
    const me = window.__me || {};
    const body = h('div.module-body');
    clear(root).append(h('div.module', h('div.module-head', h('h2', this.title)), body));
    if (me.role === 'coach') await coachView(body, me); else await studentView(body);
    return { unmount() {} };
  },
};

// ======================= coach =======================
async function coachView(body, me) {
  let week = mondayOf(new Date());
  let mine = false;
  await Promise.all([academyStudents().catch(() => []), academyCoaches().catch(() => [])]);
  async function draw() {
    clear(body).append(h('div.empty', 'Yükleniyor…'));
    let data;
    try { data = await loadAll(week, addDays(week, 6)); } catch (e) { clear(body).append(h('div.empty', 'Program alınamadı: ' + e.message)); return; }
    let lessons = expandLessons(data.classes, data.sessions, week, 7);
    if (mine) lessons = lessons.filter((l) => (l.coach_ids || []).includes(me.id));
    const attOf = (l) => (l.session ? data.attendance.filter((a) => a.session_id === l.session.id) : []);
    const today = dateKey(new Date());
    const card = (l) => {
      const att = attOf(l);
      const came = att.filter((a) => a.status === 'geldi').length;
      return h('button.lesson' + (l.cancelled ? '.cancelled' : '') + (l.kind === 'ozel' ? '.ozel' : '') + (l.kind === 'tek' ? '.tek' : ''), { onclick: () => lessonDialog(l, att, me, draw) },
        h('div.lesson-time', `${l.start}–${endTime(l.start, l.duration)}`),
        h('div.lesson-name', l.name),
        h('div.lesson-meta', [coachShort(l.coach_ids), `${l.student_ids.length} öğr.`, l.location].filter(Boolean).join(' · ')),
        l.cancelled ? h('span.chip.warn', 'İptal') : att.length ? h('span.chip.ok', `Yoklama ${came}/${l.student_ids.length}`) : null,
        l.makeup ? h('span.chip', 'Telafi') : null,
        l.note ? h('span.chip', '📝 not') : null);
    };
    clear(body).append(h('div.schedule',
      h('div.toolbar',
        h('button.btn.small', { onclick: () => { week = addDays(week, -7); draw(); } }, '◂'),
        h('b', `${fmtDay(week)} – ${fmtDay(addDays(week, 6))} ${addDays(week, 6).getFullYear()}`),
        h('button.btn.small', { onclick: () => { week = addDays(week, 7); draw(); } }, '▸'),
        h('button.btn.small.ghost', { onclick: () => { week = mondayOf(new Date()); draw(); } }, 'Bu hafta'),
        h('select.filter-sel', { onchange: (e) => { mine = e.target.value === 'mine'; draw(); } }, h('option', { value: 'all', selected: !mine }, 'Bütün akademi'), h('option', { value: 'mine', selected: mine }, 'Benim derslerim')),
        h('span.spacer'),
        h('button.btn', { onclick: () => classesDialog(data.classes, me, draw) }, 'Gruplar ve özel dersler'),
        h('button.btn.primary', { onclick: () => oneOffDialog(me, draw) }, '+ Tek seferlik ders')),
      data.classes.length || lessons.length ? h('div.week-grid', DAYS.map((dn, i) => {
        const d = addDays(week, i), key = dateKey(d);
        const ls = lessons.filter((l) => l.date === key);
        return h('div.day-col' + (key === today ? '.today' : ''), h('div.day-head', h('b', DAYS_SHORT[i]), ' ', fmtDay(d)), ls.length ? ls.map(card) : h('div.muted.small.day-empty', '—'));
      })) : h('div.empty', h('div.big-icon', '📅'), h('h3', 'Henüz ders programı yok'),
        h('p', '"Gruplar ve özel dersler"den her grubun ve özel dersin gününü, saatini, hocasını ve öğrencilerini girin. Program her hafta kendiliğinden tekrarlanır.'),
        h('button.btn.primary', { onclick: () => classEditDialog(null, me, draw) }, '+ İlk grubu ekle'))));
  }
  draw();
}

// Save (or create) the session row of a lesson day and return it.
async function ensureSession(l, me) {
  if (l.session) return l.session;
  const row = { academy_id: me.coach_id || me.id, class_id: l.cls.id, date: l.date, start_time: l.cls.start_time, duration_min: l.cls.duration_min, location: l.cls.location, coach_ids: l.cls.coach_ids };
  const { data, error } = await supa.from('sessions').upsert(row, { onConflict: 'class_id,date' }).select().single();
  if (error) throw error;
  l.session = data;
  return data;
}

function lessonDialog(l, att, me, done) {
  const marks = Object.fromEntries(att.map((a) => [a.student_id, a.status]));
  const note = h('textarea.paste', { rows: 3, placeholder: 'Bu derste ne işlendi? (örn. Çatal 2. bölüm, ödev: 10 bulmaca)' }, l.note || '');
  const rows = l.student_ids.map((sid) => {
    const btns = ATT.map(([k, label, icon]) => h('button.att-btn.' + k + (marks[sid] === k ? '.on' : ''), { title: label, onclick: (e) => {
      marks[sid] = marks[sid] === k ? null : k;
      [...e.target.parentNode.children].forEach((b) => b.classList.remove('on'));
      if (marks[sid]) e.target.classList.add('on');
    } }, icon));
    return h('div.att-row', h('span', studentName(sid)), h('span.att-btns', btns));
  });
  const allCame = h('button.btn.small', { onclick: () => { for (const sid of l.student_ids) marks[sid] = 'geldi'; body.querySelectorAll('.att-btn').forEach((b) => b.classList.toggle('on', b.classList.contains('geldi'))); } }, 'Hepsi geldi');
  const body = h('div.form-col',
    h('div.muted', `${DAYS[(parseKey(l.date).getDay() + 6) % 7]} ${fmtDate(parseKey(l.date))} · ${l.start}–${endTime(l.start, l.duration)}`, l.location ? ` · ${l.location}` : '', l.coach_ids.length ? ` · ${coachShort(l.coach_ids)}` : ''),
    l.cancelled ? h('div.chip.warn', 'Bu ders iptal edildi') : null,
    h('div.form-l', 'Yoklama', h('span.spacer'), l.student_ids.length ? allCame : null),
    l.student_ids.length ? h('div.att-list', rows) : h('div.muted.small', 'Bu derse kayıtlı öğrenci yok.'),
    h('div.form-l', 'Ders notu'), note);
  const save = async (status) => {
    try {
      const s = await ensureSession(l, me);
      const patch = { note: note.value.trim() || null, updated_at: new Date().toISOString() };
      if (status) patch.status = status;
      const { error } = await supa.from('sessions').update(patch).eq('id', s.id);
      if (error) throw error;
      const up = Object.entries(marks).filter(([, v]) => v).map(([sid, v]) => ({ session_id: s.id, student_id: sid, status: v }));
      const off = Object.entries(marks).filter(([, v]) => !v).map(([sid]) => sid);
      if (up.length) { const { error: e2 } = await supa.from('attendance').upsert(up, { onConflict: 'session_id,student_id' }); if (e2) throw e2; }
      if (off.length) await supa.from('attendance').delete().eq('session_id', s.id).in('student_id', off);
      toast(status === 'cancelled' ? 'Ders iptal edildi' : status === 'planned' ? 'İptal geri alındı' : 'Kaydedildi', 'ok');
      done();
    } catch (e) { toast('Kaydedilemedi: ' + e.message, 'error'); }
  };
  const actions = [{ label: 'Vazgeç' }];
  if (l.kind === 'tek') actions.push({ label: 'Dersi sil', onClick: () => { supa.from('sessions').delete().eq('id', l.session.id).then(({ error }) => { if (error) toast(error.message, 'error'); else { toast('Ders silindi', 'ok'); done(); } }); } });
  actions.push(l.cancelled ? { label: 'İptali geri al', onClick: () => { save('planned'); } } : { label: 'Dersi iptal et', onClick: () => { save('cancelled'); } });
  actions.push({ label: 'Kaydet', primary: true, onClick: () => { save(null); } });
  modal({ title: l.name, wide: true, body, actions });
}

// ---------- classes (repeating lessons) ----------
function classesDialog(classes, me, done) {
  const list = h('div.class-list', classes.length ? classes.map((c) => h('div.class-row',
    h('div', h('b', c.name), ' ', c.kind === 'ozel' ? h('span.chip.ozel', 'Özel ders') : null,
      h('div.muted.small', [`${DAYS[c.weekday - 1]} ${hm(c.start_time)}–${endTime(c.start_time, c.duration_min)}`, c.location, coachShort(c.coach_ids), `${(c.class_members || []).length} öğrenci`].filter(Boolean).join(' · '))),
    h('button.btn.small', { onclick: () => { m.close(); classEditDialog(c, me, done); } }, 'Düzenle')))
    : h('div.muted', 'Henüz grup ya da özel ders yok.'));
  const m = modal({ title: 'Gruplar ve özel dersler', wide: true, body: h('div', h('p.muted.small', 'Her satır her hafta aynı gün ve saatte tekrarlanan bir derstir. Grup dersinin adı, öğrencilerin "grup" bilgisi olarak da kullanılır (duyurular, sıralama, filtreler).'), list),
    actions: [{ label: 'Kapat' }, { label: '+ Yeni grup / özel ders', primary: true, onClick: () => { classEditDialog(null, me, done); } }] });
}

function field(label, input, hint) { return h('label.form-row', h('span.form-l', label), input, hint ? h('span.muted.small', hint) : null); }

async function classEditDialog(c, me, done) {
  const students = Object.values(meta.students).sort((a, b) => a.display_name.localeCompare(b.display_name, 'tr'));
  const coaches = Object.values(meta.coaches);
  let kind = c ? c.kind : 'grup';
  const name = h('input', { value: c ? c.name : '', placeholder: 'Örn. Cumartesi 10:00 – Başlangıç' });
  const day = h('select', DAYS.map((d, i) => h('option', { value: i + 1, selected: c ? c.weekday === i + 1 : i === 5 }, d)));
  const time = h('input', { type: 'time', value: c ? hm(c.start_time) : '10:00' });
  const dur = h('select', [45, 60, 75, 90, 120, 150, 180].map((m) => h('option', { value: m, selected: (c ? c.duration_min : 60) === m }, `${m} dk`)));
  const loc = h('input', { value: c ? c.location || '' : '', placeholder: 'Örn. Salon 1 / Online' });
  const coachSet = new Set(c ? c.coach_ids : [me.id]);
  const memberSet = new Set(c ? (c.class_members || []).map((x) => x.student_id) : []);
  const kindSeg = h('div.seg', [['grup', 'Grup dersi'], ['ozel', 'Özel ders']].map(([k, l]) => h('button' + (k === kind ? '.active' : ''), { type: 'button', onclick: (e) => { kind = k; [...e.target.parentNode.children].forEach((b) => b.classList.remove('active')); e.target.classList.add('active'); } }, l)));
  const search = h('input.search', { placeholder: 'Öğrenci ara…' });
  const stList = h('div.pick-list');
  const drawStudents = () => {
    const q = search.value.trim().toLocaleLowerCase('tr');
    clear(stList).append(...students.filter((s) => !q || s.display_name.toLocaleLowerCase('tr').includes(q)).map((s) => h('label.pick',
      h('input', { type: 'checkbox', checked: memberSet.has(s.id), onchange: (e) => { if (e.target.checked) memberSet.add(s.id); else memberSet.delete(s.id); } }),
      h('span', s.display_name), h('span.muted.small', s.group_name ? ' · ' + s.group_name : ''))));
  };
  search.addEventListener('input', drawStudents); drawStudents();
  const attHost = h('div');
  if (c) attendanceSummary(c).then((el) => attHost.append(el)).catch(() => {});
  const save = async () => {
    const row = { name: name.value.trim(), kind, weekday: +day.value, start_time: time.value, duration_min: +dur.value, location: loc.value.trim() || null, coach_ids: [...coachSet] };
    if (!row.name) { toast('Bir ad yazın', 'error'); return false; }
    if (!row.start_time) { toast('Saat seçin', 'error'); return false; }
    (async () => {
      try {
        let id = c && c.id;
        if (c) { const { error } = await supa.from('classes').update(row).eq('id', id); if (error) throw error; }
        else { const { data, error } = await supa.from('classes').insert({ ...row, academy_id: me.coach_id || me.id }).select('id').single(); if (error) throw error; id = data.id; }
        const before = new Set(c ? (c.class_members || []).map((x) => x.student_id) : []);
        const add = [...memberSet].filter((x) => !before.has(x)), del = [...before].filter((x) => !memberSet.has(x));
        if (add.length) { const { error } = await supa.from('class_members').insert(add.map((sid) => ({ class_id: id, student_id: sid }))); if (error) throw error; }
        if (del.length) await supa.from('class_members').delete().eq('class_id', id).in('student_id', del);
        const oldName = c && (c.name !== row.name || c.kind !== row.kind || del.length) ? c.name : null;
        await supa.rpc('class_sync', { cid: id, old_name: oldName });
        toast('Kaydedildi', 'ok');
        await academyStudents().catch(() => {});
        done();
      } catch (e) { toast('Kaydedilemedi: ' + e.message, 'error'); }
    })();
  };
  const actions = [{ label: 'Vazgeç' }];
  if (c) actions.push({ label: 'Sil', onClick: () => {
    modal({ title: 'Silinsin mi?', body: h('p', `"${c.name}" programdan kalkacak; bu derse ait yoklama ve notlar da silinir. Öğrenci hesapları silinmez.`),
      actions: [{ label: 'Vazgeç' }, { label: 'Sil', primary: true, onClick: () => {
        supa.from('classes').delete().eq('id', c.id).then(async ({ error }) => { if (error) toast(error.message, 'error'); else { await supa.rpc('class_release', { old_name: c.name }); toast('Silindi', 'ok'); await academyStudents().catch(() => {}); done(); } });
      } }] });
  } });
  actions.push({ label: 'Kaydet', primary: true, onClick: save });
  modal({ title: c ? c.name : 'Yeni grup / özel ders', wide: true, actions,
    body: h('div.form-col',
      field('Tür', kindSeg), field('Ad', name, 'Grup dersinde öğrencilerin grup adı olur. Özel derste örn. "Özel – Ali Yılmaz".'),
      h('div.form-grid', field('Gün', day), field('Başlangıç', time), field('Süre', dur), field('Yer', loc)),
      coaches.length ? field('Hocaları', h('div.coach-pick', coaches.map((co) => h('label.chk', h('input', { type: 'checkbox', checked: coachSet.has(co.id), onchange: (e) => { if (e.target.checked) coachSet.add(co.id); else coachSet.delete(co.id); } }), ' ', co.display_name)))) : null,
      h('div.form-l', 'Öğrenciler'), search, stList, attHost) });
}

// Attendance rate per student of one class (all recorded lessons).
async function attendanceSummary(c) {
  const { data: ss } = await supa.from('sessions').select('id, date, status').eq('class_id', c.id).order('date', { ascending: false }).limit(60);
  const held = (ss || []).filter((s) => s.status !== 'cancelled');
  if (!held.length) return h('div');
  const { data: att } = await supa.from('attendance').select('*').in('session_id', held.map((s) => s.id));
  const by = {};
  for (const a of att || []) { by[a.student_id] = by[a.student_id] || { geldi: 0, n: 0 }; by[a.student_id].n++; if (a.status === 'geldi') by[a.student_id].geldi++; }
  return h('div.panel.att-summary', h('div.panel-title', `Devam (yoklama girilmiş ${held.length} ders)`),
    h('table.kv', (c.class_members || []).map((m) => { const r = by[m.student_id]; return h('tr', h('td', studentName(m.student_id)), h('td.num', r ? `%${Math.round((100 * r.geldi) / r.n)}` : '–'), h('td.muted.small', r ? `${r.geldi}/${r.n} ders` : 'kayıt yok')); })));
}

function oneOffDialog(me, done) {
  const students = Object.values(meta.students).sort((a, b) => a.display_name.localeCompare(b.display_name, 'tr'));
  const coaches = Object.values(meta.coaches);
  const title = h('input', { placeholder: 'Örn. Telafi – Cumartesi grubu / Özel ders – Ali' });
  const date = h('input', { type: 'date', value: dateKey(new Date()) });
  const time = h('input', { type: 'time', value: '10:00' });
  const dur = h('select', [45, 60, 75, 90, 120].map((m) => h('option', { value: m, selected: m === 60 }, `${m} dk`)));
  const loc = h('input', { placeholder: 'Yer (isteğe bağlı)' });
  const makeup = h('input', { type: 'checkbox' });
  const coachSet = new Set([me.id]), memberSet = new Set();
  modal({ title: 'Tek seferlik ders', wide: true,
    body: h('div.form-col', field('Başlık', title), h('div.form-grid', field('Tarih', date), field('Saat', time), field('Süre', dur), field('Yer', loc)),
      h('label.chk', makeup, ' Telafi dersi'),
      coaches.length > 1 ? field('Hocaları', h('div.coach-pick', coaches.map((co) => h('label.chk', h('input', { type: 'checkbox', checked: coachSet.has(co.id), onchange: (e) => { if (e.target.checked) coachSet.add(co.id); else coachSet.delete(co.id); } }), ' ', co.display_name)))) : null,
      h('div.form-l', 'Öğrenciler'), h('div.pick-list', students.map((s) => h('label.pick', h('input', { type: 'checkbox', onchange: (e) => { if (e.target.checked) memberSet.add(s.id); else memberSet.delete(s.id); } }), h('span', s.display_name), h('span.muted.small', s.group_name ? ' · ' + s.group_name : ''))))),
    actions: [{ label: 'Vazgeç' }, { label: 'Ekle', primary: true, onClick: () => {
      if (!date.value || !time.value) { toast('Tarih ve saat seçin', 'error'); return false; }
      supa.from('sessions').insert({ academy_id: me.coach_id || me.id, class_id: null, date: date.value, start_time: time.value, duration_min: +dur.value, title: title.value.trim() || null,
        location: loc.value.trim() || null, coach_ids: [...coachSet], student_ids: [...memberSet], makeup: makeup.checked })
        .then(({ error }) => { if (error) toast('Eklenemedi: ' + error.message, 'error'); else { toast('Ders eklendi', 'ok'); done(); } });
    } }] });
}

// ======================= student =======================
export async function nextLessons(limit = 5, days = 14) {
  const from = new Date(); from.setHours(0, 0, 0, 0);
  const { classes, sessions } = await loadAll(from, addDays(from, days));
  const now = `${dateKey(new Date())} ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  return expandLessons(classes, sessions, from, days)
    .filter((l) => `${l.date} ${endTime(l.start, l.duration)}` >= now)
    .slice(0, limit)
    .map((l) => { const d = parseKey(l.date); const diff = Math.round((d - from) / 86400e3); return { ...l, dayLabel: diff === 0 ? 'Bugün' : diff === 1 ? 'Yarın' : `${DAYS[(d.getDay() + 6) % 7]} ${fmtDay(d)}` }; });
}

async function studentView(body) {
  clear(body).append(h('div.empty', 'Yükleniyor…'));
  let next = [], past = [], att = [];
  try {
    next = await nextLessons(8, 21);
    const { data: ps } = await supa.from('sessions').select('*, classes(name)').lt('date', dateKey(new Date())).order('date', { ascending: false }).limit(20);
    past = ps || [];
    const { data: a } = await supa.from('attendance').select('*');
    att = a || [];
  } catch (e) { clear(body).append(h('div.empty', 'Program alınamadı: ' + e.message)); return; }
  const attLabel = { geldi: '✓ Geldin', gelmedi: '✗ Gelmedin', mazeretli: 'Mazeretli' };
  clear(body).append(h('div.schedule-student',
    h('div.panel', h('div.panel-title', 'Sonraki derslerin'),
      next.length ? next.map((l) => h('div.next-row' + (l.cancelled ? '.cancelled' : ''), h('b', l.dayLabel), h('span', `${l.start}–${endTime(l.start, l.duration)}`), h('span', l.name), l.location ? h('span.muted.small', l.location) : null,
        l.cancelled ? h('span.chip.warn', 'İptal') : null, l.makeup ? h('span.chip', 'Telafi') : null))
        : h('div.muted', 'Önümüzdeki günlerde dersin görünmüyor.')),
    h('div.panel', h('div.panel-title', 'Geçmiş dersler'),
      past.length ? past.map((s) => { const a = att.find((x) => x.session_id === s.id); return h('div.past-row',
        h('div', h('b', fmtDate(parseKey(s.date))), ' ', (s.classes && s.classes.name) || s.title || 'Ders', s.status === 'cancelled' ? h('span.chip.warn', 'İptal') : a ? h('span.chip' + (a.status === 'geldi' ? '.ok' : ''), attLabel[a.status]) : null),
        s.note ? h('div.past-note', s.note) : null); })
        : h('div.muted', 'Henüz kayıtlı ders yok.'))));
}

// Home card for students: the next lesson (and a cancellation warning).
export function homeNextLesson(go) {
  const host = h('div');
  nextLessons(1).then(([l]) => {
    if (!l) return;
    host.append(h('div.panel.next-lesson' + (l.cancelled ? '.cancelled' : ''), { onclick: () => go('program') },
      h('div.nl-icon', '📅'), h('div', h('div.muted.small', l.cancelled ? 'Ders iptal edildi' : 'Sonraki dersin'), h('b', `${l.dayLabel} ${l.start}`), ' · ', l.name, l.location ? h('span.muted.small', ` · ${l.location}`) : null)));
  }).catch(() => {});
  return host;
}
