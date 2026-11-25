// Antrenör (web): öğrenci hesapları, ödevi öğrencilere gönderme, raporları çekme.
// The desktop teacher module calls these through window.webHooks.
import { supa, hesap, cleanUsername } from './supa.js';
import { h, clear, modal, toast, fmtDate } from '../../src/renderer/core/dom.js';
import { students, packageSummary } from '../../src/renderer/core/assign.js';
import { videoStore } from './videos.js';
import { rankingView } from './ranking.js';

// Cached profile info of the academy's students (ders türü, grup, hocalar) for filters.
export const meta = { students: {}, coaches: {}, me: null };

export async function syncReports() {
  await Promise.all([myStudents().catch(() => []), myCoaches().catch(() => [])]);
  const { data, error } = await supa.from('reports').select('student_id, report');
  if (error) return 0;
  await students.load();
  for (const row of data) { try { students.add(row.report); } catch (e) { /* ignore */ } }
  const ids = new Set(data.map((r) => r.student_id));
  for (const id of Object.keys(students.map)) if (!ids.has(id)) delete students.map[id];
  await students.save();
  return data.length;
}

async function myStudents() {
  const { data, error } = await supa.from('profiles').select('id, username, display_name, group_name, lesson_type, created_at, leaderboard_ok, student_coaches!student_coaches_student_id_fkey(coach_id)').eq('role', 'student').order('display_name');
  if (error) throw error;
  for (const st of data) { st.coaches = (st.student_coaches || []).map((x) => x.coach_id); delete st.student_coaches; }
  meta.students = Object.fromEntries(data.map((st) => [st.id, st]));
  return data;
}
async function myCoaches() {
  const { data, error } = await supa.from('profiles').select('id, username, display_name, coach_id, created_at').eq('role', 'coach').order('display_name');
  if (error) throw error;
  meta.coaches = Object.fromEntries(data.map((c) => [c.id, c]));
  return data.sort((a, b) => (a.coach_id ? 1 : 0) - (b.coach_id ? 1 : 0) || a.display_name.localeCompare(b.display_name, 'tr'));
}

// "Özel ders" / grup adı: lists are grouped and filtered by this.
export const classOf = (st) => st.lesson_type === 'ozel' ? 'Özel ders' + (st.group_name ? ' · ' + st.group_name : '') : (st.group_name || 'Grupsuz');
const coachNames = (ids) => (ids || []).map((id) => (meta.coaches[id] ? meta.coaches[id].display_name.split(' ')[0] : '?')).join(', ');

// Filter: all | mine | ozel | g:<group>
let filterValue = 'all';
export function filterTest(st, value = filterValue) {
  if (!st) return value === 'all';
  if (value === 'mine') return (st.coaches || []).includes(meta.me);
  if (value === 'ozel') return st.lesson_type === 'ozel';
  if (value.startsWith('g:')) return st.group_name === value.slice(2) && st.lesson_type !== 'ozel';
  return true;
}
export function filterSelect(list, onChange) {
  const groups = [...new Set(list.filter((x) => x.lesson_type !== 'ozel').map((x) => x.group_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  if (filterValue.startsWith('g:') && !groups.includes(filterValue.slice(2))) filterValue = 'all';
  return h('select.filter-sel', { onchange: (e) => { filterValue = e.target.value; onChange(); } },
    [['all', 'Bütün öğrenciler'], ['mine', 'Benim öğrencilerim'], ['ozel', 'Özel ders'], ...groups.map((g) => ['g:' + g, 'Grup: ' + g])]
      .map(([v, l]) => h('option', { value: v, selected: v === filterValue }, l)));
}

const suggestUsername = (name) => cleanUsername(name).replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 32);
const randomPassword = () => { const w = 'abcdefghjkmnpqrstuvwxyz'; let s = ''; for (let i = 0; i < 4; i++) s += w[Math.floor(Math.random() * w.length)]; return s + (100 + Math.floor(Math.random() * 900)); };

export function accountsHooks(me) {
  meta.me = me.id;
  const isHead = me.role === 'coach' && !me.coach_id;
  return {
    syncReports,
    isHead,
    studentMeta: () => meta.students,
    filterSelect, filterTest: (id) => filterTest(meta.students[id]),
    videoList: () => videoStore.load(true),

    // "Hesaplar" tab: list, create, rename/regroup, reset password, delete.
    async accountsTab(body, { onChange } = {}) {
      clear(body).append(h('div.empty', 'Yükleniyor…'));
      let all, coaches;
      try { [all, coaches] = await Promise.all([myStudents(), myCoaches()]); } catch (e) { clear(body).append(h('div.empty', 'Öğrenciler alınamadı: ' + e.message)); return; }
      const list = all.filter((x) => filterTest(x)).sort((a, b) => classOf(a).localeCompare(classOf(b), 'tr') || a.display_name.localeCompare(b.display_name, 'tr'));
      const lastReport = Object.fromEntries(Object.values(students.map).map((s) => [s.id, s.last && s.last.createdAt]));
      const groups = [...new Set(all.map((s) => s.group_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
      const redraw = () => this.accountsTab(body, { onChange });
      clear(body).append(h('div.sets-page',
        h('div.toolbar',
          h('button.btn.primary', { onclick: () => createDialog(groups, coaches, me, redraw) }, '+ Öğrenci hesabı aç'),
          filterSelect(all, redraw),
          h('span.muted', `${list.length} / ${all.length} öğrenci`)),
        list.length ? h('div.table-host', h('table.games.accounts',
          h('thead', h('tr', h('th', 'Öğrenci'), h('th', 'Kullanıcı adı'), h('th', 'Ders'), h('th', 'Hocaları'), h('th', 'Son çalışma'), h('th', { title: 'Veli açık rıza formunda sıralamayı onayladıysa işaretleyin' }, 'Sıralamada'), h('th', ''))),
          h('tbody', list.map((s) => h('tr',
            h('td', h('b', s.display_name), h('div.sub', `açıldı ${fmtDate(s.created_at)}`)),
            h('td', '@' + s.username),
            h('td', h('span.chip' + (s.lesson_type === 'ozel' ? '.ozel' : ''), classOf(s))),
            h('td', coachNames(s.coaches) || h('span.muted', '–')),
            h('td', lastReport[s.id] ? fmtDate(lastReport[s.id]) : h('span.muted', 'henüz yok')),
            h('td', h('input', { type: 'checkbox', checked: !!s.leaderboard_ok, title: 'Veli sıralama onayı verdi', onchange: async (e) => {
              const { error } = await supa.rpc('set_leaderboard_ok', { student: s.id, ok: e.target.checked });
              if (error) { toast(error.message, 'error'); e.target.checked = !e.target.checked; } else toast(e.target.checked ? `${s.display_name} sıralamada görünecek` : `${s.display_name} sıralamadan çıkarıldı`, 'ok');
            } })),
            h('td.acc-actions',
              h('button.btn.small', { onclick: () => editDialog(s, groups, coaches, redraw) }, 'Düzenle'),
              h('button.btn.small', { onclick: () => passwordDialog(s) }, 'Şifre'),
              h('button.btn.small.ghost', { onclick: () => deleteDialog(s, redraw) }, 'Sil')))))))
          : all.length ? h('div.empty', 'Bu filtrede öğrenci yok.') : h('div.empty', h('div.big-icon', '👥'), h('h3', 'Henüz öğrenci hesabı yok'),
            h('p', 'Her öğrenci için bir kullanıcı adı ve ilk şifre belirleyin. Öğrenciye bu ikisini verin; telefondan, tabletten ya da bilgisayardan bu siteye girer.'),
            h('p.muted.small', 'Çocuklardan e-posta adresi istenmez.'))));
      if (onChange) onChange(list);
    },

    // ---------- "Ödevler": per-assignment progress, withdraw ----------
    async assignmentsTab(body) {
      clear(body).append(h('div.empty', 'Yükleniyor…'));
      await syncReports();
      const [{ data: asgAll, error }, list] = await Promise.all([
        supa.from('assignments').select('id, title, coach_id, created_at, package, assignment_targets(student_id)').order('created_at', { ascending: false }),
        myStudents().catch(() => []),
      ]);
      const onlyMine = this._asgMine || false;
      const asg = (asgAll || []).filter((a) => !onlyMine || a.coach_id === me.id);
      if (error) { clear(body).append(h('div.empty', 'Ödevler alınamadı: ' + error.message)); return; }
      const byId = Object.fromEntries(list.map((s) => [s.id, s]));
      const redraw = () => this.assignmentsTab(body);
      const card = (a) => {
        const rows = a.assignment_targets.map((t) => {
          const st = byId[t.student_id];
          const rep = students.map[t.student_id] && students.map[t.student_id].last;
          const pr = rep && rep.assignments ? rep.assignments.find((x) => x.id === a.id) : null;
          return { name: st ? st.display_name : 'Silinmiş öğrenci', group: st && st.group_name, pr, seen: !!pr };
        }).sort((x, y) => (y.pr ? y.pr.pct : -1) - (x.pr ? x.pr.pct : -1) || x.name.localeCompare(y.name, 'tr'));
        const done = rows.filter((r) => r.pr && r.pr.pct >= 1).length;
        const half = rows.filter((r) => r.pr && r.pr.pct > 0 && r.pr.pct < 1).length;
        const none = rows.length - done - half;
        const due = a.package.due;
        const details = h('div.asg-detail', { style: { display: 'none' } },
          h('table.kv.asg-students', rows.map((r) => h('tr',
            h('td', h('b', r.name), r.group ? h('span.muted.small', ` · ${r.group}`) : null),
            h('td', r.pr ? r.pr.parts.map((p) => `${p.done}/${p.total} ${p.label}`).join(' · ') : h('span.muted', r.seen ? '' : 'henüz açmadı')),
            h('td', h('div.mini-progress', h('span', { style: { width: `${Math.round(100 * (r.pr ? r.pr.pct : 0))}%` } }), h('b', `%${Math.round(100 * (r.pr ? r.pr.pct : 0))}`)))))));
        return h('div.panel.asg-card',
          h('div.asg-card-head',
            h('div', h('div.asg-title', a.title), h('div.muted.small', [meta.coaches[a.coach_id] ? meta.coaches[a.coach_id].display_name : null, `gönderildi ${fmtDate(a.created_at)}`, due ? `son gün ${fmtDate(due)}` : null, packageSummary(a.package).join(', ')].filter(Boolean).join(' · '))),
            h('div.asg-counts', h('span.chip.ok', `${done} bitirdi`), h('span.chip', `${half} yarıda`), h('span.chip' + (none ? '.warn' : ''), `${none} başlamadı`))),
          h('div.btn-row',
            h('button.btn.small', { onclick: (e) => { const open = details.style.display === 'none'; details.style.display = open ? '' : 'none'; e.target.textContent = open ? 'Gizle' : `Öğrenciler (${rows.length})`; } }, `Öğrenciler (${rows.length})`),
            a.coach_id !== me.id && !isHead ? null : h('button.btn.small.ghost', { onclick: () => modal({ title: 'Ödev geri alınsın mı?', body: h('div', h('p', h('b', a.title), ' ödevi silinecek.'), h('p', 'Öğrencilerin ödev listesinden de kalkar (siteye bir sonraki girişlerinde). Çözdükleri bulmacalar ve puanları silinmez.')),
              actions: [{ label: 'Vazgeç' }, { label: 'Ödevi geri al', primary: true, onClick: () => {
                supa.from('assignments').delete().eq('id', a.id).then(({ error: e }) => { if (e) toast(e.message, 'error'); else { toast('Ödev geri alındı', 'ok'); redraw(); } });
              } }] }) }, 'Geri al')),
          details);
      };
      clear(body).append(h('div.sets-page',
        h('div.toolbar', h('button.btn', { onclick: redraw }, '↻ Yenile'),
          h('select.filter-sel', { onchange: (e) => { this._asgMine = e.target.value === 'mine'; redraw(); } }, h('option', { value: 'all', selected: !onlyMine }, 'Bütün ödevler'), h('option', { value: 'mine', selected: onlyMine }, 'Benim verdiklerim')),
          h('span.muted', 'İlerleme, öğrenci siteye girip çalıştıkça güncellenir.')),
        asg.length ? asg.map(card) : h('div.empty', h('div.big-icon', '📋'), h('h3', onlyMine ? 'Henüz ödev göndermediniz' : 'Henüz ödev yok'), h('p', '"Ödev ver" sekmesinden ilk ödevi hazırlayın.'))));
    },

    // ---------- "Duyurular" ----------
    async announcementsTab(body) {
      const all = await myStudents().catch(() => []);
      const list = isHead ? all : all.filter((x) => (x.coaches || []).includes(me.id));
      const groups = [...new Set(list.map((s) => s.group_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
      const { data: anns } = await supa.from('announcements').select('*').eq('coach_id', me.id).order('created_at', { ascending: false });
      const text = h('textarea.paste', { rows: 3, maxlength: 1000, placeholder: 'Örn. Bu cumartesi ders yok. Pazar 14:00\'te Lichess takım turnuvası var!' });
      const everyone = isHead ? 'Bütün öğrenciler' : `Benim öğrencilerim (${list.length})`;
      const grp = h('select', h('option', { value: '' }, everyone), groups.map((g) => h('option', { value: g }, 'Grup: ' + g)));
      const dur = h('select', [[1, '1 gün'], [3, '3 gün'], [7, '1 hafta'], [30, '1 ay'], [0, 'Süresiz']].map(([v, l]) => h('option', { value: v, selected: v === 7 }, l)));
      const redraw = () => this.announcementsTab(body);
      const now = Date.now();
      clear(body).append(h('div.sets-page',
        isHead ? null : h('p.muted.small', 'Duyurunuz yalnızca hocası olduğunuz öğrencilere gider (Hesaplar → Hocaları).'),
        h('div.panel', h('div.panel-title', 'Yeni duyuru'), text,
          h('div.btn-row', h('span.muted', 'Kime:'), grp, h('span.muted', 'Ne kadar görünsün:'), dur, h('span.spacer'),
            h('button.btn.primary', { onclick: async () => {
              const t = text.value.trim();
              if (!t) { toast('Duyuru metni yazın', 'error'); return; }
              const days = +dur.value;
              const { error } = await supa.from('announcements').insert({ body: t, group_name: grp.value || null, expires_at: days ? new Date(Date.now() + days * 86400e3).toISOString() : null });
              if (error) toast('Gönderilemedi: ' + error.message, 'error'); else { toast('Duyuru gönderildi', 'ok'); redraw(); }
            } }, 'Duyur'))),
        h('div.panel', h('div.panel-title', 'Duyurular'),
          (anns || []).length ? (anns || []).map((a) => {
            const expired = a.expires_at && new Date(a.expires_at).getTime() < now;
            return h('div.ann-row' + (expired ? '.expired' : ''),
              h('div', h('div.ann-body', a.body), h('div.muted.small', [fmtDate(a.created_at), a.group_name || everyone, a.expires_at ? (expired ? 'süresi doldu' : `${fmtDate(a.expires_at)} tarihine kadar`) : 'süresiz'].join(' · '))),
              h('button.btn.small.ghost', { onclick: async () => { const { error } = await supa.from('announcements').delete().eq('id', a.id); if (error) toast(error.message, 'error'); else redraw(); } }, 'Sil'));
          }) : h('div.muted.small', 'Henüz duyuru yok.'))));
    },

    // ---------- "Sıralama" ----------
    async leaderboardTab(body) {
      const all = await myStudents().catch(() => []);
      const groups = [...new Set(all.map((x) => x.group_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
      clear(body).append(h('div.sets-page', rankingView({ isCoach: true, groups })));
    },

    // ---------- "Antrenörler" (başantrenör) ----------
    async coachesTab(body) {
      clear(body).append(h('div.empty', 'Yükleniyor…'));
      let coaches, studs;
      try { [coaches, studs] = await Promise.all([myCoaches(), myStudents()]); } catch (e) { clear(body).append(h('div.empty', 'Antrenörler alınamadı: ' + e.message)); return; }
      const redraw = () => this.coachesTab(body);
      const count = (id) => studs.filter((x) => (x.coaches || []).includes(id)).length;
      clear(body).append(h('div.sets-page',
        h('div.toolbar', h('button.btn.primary', { onclick: () => coachCreateDialog(redraw) }, '+ Antrenör hesabı aç'),
          h('span.muted', 'Antrenörler akademinin bütün öğrencilerini görür, ödev ve duyuru verebilir. Antrenör hesabını yalnızca siz açar ve silersiniz.')),
        h('div.table-host', h('table.games.accounts',
          h('thead', h('tr', h('th', 'Antrenör'), h('th', 'Kullanıcı adı'), h('th', 'Hocası olduğu öğrenci'), h('th', ''))),
          h('tbody', coaches.map((c) => h('tr',
            h('td', h('b', c.display_name), !c.coach_id ? h('span.chip.ok', { style: { marginLeft: '6px' } }, 'Başantrenör') : null),
            h('td', '@' + c.username),
            h('td.num', count(c.id)),
            h('td.acc-actions', c.coach_id ? [
              h('button.btn.small', { onclick: () => coachEditDialog(c, redraw) }, 'Düzenle'),
              h('button.btn.small', { onclick: () => coachPasswordDialog(c) }, 'Şifre'),
              h('button.btn.small.ghost', { onclick: () => coachDeleteDialog(c, redraw) }, 'Sil')] : h('span.muted.small', 'siz'))))))),
        h('p.muted.small', 'Bir antrenör silinirse verdiği ödevler, eklediği videolar ve duyurular size geçer; öğrenciler etkilenmez.')));
    },

    // Called by the package builder instead of saving a .kpaket file.
    async sendPackage(pkg) {
      let list;
      try { list = await myStudents(); } catch (e) { toast('Öğrenciler alınamadı: ' + e.message, 'error'); return false; }
      if (!list.length) { toast('Önce "Hesaplar" sekmesinden öğrenci hesabı açın.', 'error'); return false; }
      const chosen = new Set();
      const groups = [...new Set(list.map((s) => s.group_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
      const boxes = new Map();
      const count = h('b', '0');
      const sync = () => { for (const [id, cb] of boxes) cb.checked = chosen.has(id); count.textContent = chosen.size; };
      const body = h('div.send-pick',
        h('ul', packageSummary(pkg).map((x) => h('li', x))),
        h('div.btn-row',
          h('button.btn.small', { onclick: () => { list.forEach((s) => chosen.add(s.id)); sync(); } }, 'Hepsi'),
          h('button.btn.small', { onclick: () => { list.filter((s) => filterTest(s, 'mine')).forEach((s) => chosen.add(s.id)); sync(); } }, 'Benim öğrencilerim'),
          list.some((s) => s.lesson_type === 'ozel') ? h('button.btn.small', { onclick: () => { list.filter((s) => s.lesson_type === 'ozel').forEach((s) => chosen.add(s.id)); sync(); } }, 'Özel ders') : null,
          groups.map((g) => h('button.btn.small', { onclick: () => { list.filter((s) => s.group_name === g && s.lesson_type !== 'ozel').forEach((s) => chosen.add(s.id)); sync(); } }, g)),
          h('button.btn.small.ghost', { onclick: () => { chosen.clear(); sync(); } }, 'Temizle')),
        h('div.pick-list', list.map((s) => {
          const cb = h('input', { type: 'checkbox', onchange: (e) => { if (e.target.checked) chosen.add(s.id); else chosen.delete(s.id); sync(); } });
          boxes.set(s.id, cb);
          return h('label.pick', cb, h('span', s.display_name), h('span.muted.small', ' · ' + classOf(s)));
        })),
        h('p.muted.small', 'Seçilen öğrenci: ', count));
      return new Promise((resolve) => modal({
        title: `"${pkg.title}" kime gitsin?`, body, wide: true, onClose: () => resolve(false),
        actions: [{ label: 'Vazgeç', onClick: () => resolve(false) }, { label: 'Gönder', primary: true, onClick: () => {
          if (!chosen.size) { toast('En az bir öğrenci seçin', 'error'); return false; }
          (async () => {
            const { error } = await supa.from('assignments').insert({ id: pkg.id, coach_id: me.id, title: pkg.title, package: pkg });
            if (error) { toast('Ödev kaydedilemedi: ' + error.message, 'error'); return resolve(false); }
            const { error: e2 } = await supa.from('assignment_targets').insert([...chosen].map((sid) => ({ assignment_id: pkg.id, student_id: sid })));
            if (e2) { await supa.from('assignments').delete().eq('id', pkg.id); toast('Öğrencilere atanamadı: ' + e2.message, 'error'); return resolve(false); }
            toast(`Ödev ${chosen.size} öğrenciye gönderildi. Öğrenciler siteye girince görür.`, 'ok');
            resolve(true);
          })();
        } }],
      }));
    },
  };
}

function field(label, input, hint) { return h('label.form-row', h('span.form-l', label), input, hint ? h('span.muted.small', hint) : null); }

function groupInput(groups, value = '') {
  const id = 'grp-' + Math.random().toString(36).slice(2, 7);
  return [h('input', { value, list: id, placeholder: 'örn. Cumartesi 10:00 (isteğe bağlı)' }), h('datalist', { id }, groups.map((g) => h('option', { value: g })))];
}

function lessonSeg(value, onChange) {
  let v = value || 'grup';
  const seg = h('div.seg');
  const draw = () => clear(seg).append(...[['grup', 'Grup dersi'], ['ozel', 'Özel ders']].map(([k, l]) => h('button' + (k === v ? '.active' : ''), { type: 'button', onclick: () => { v = k; draw(); if (onChange) onChange(k); } }, l)));
  draw();
  return { el: seg, get: () => v };
}
function coachPicker(coaches, selected) {
  const set = new Set(selected);
  const el = h('div.coach-pick', coaches.map((c) => h('label.chk', h('input', { type: 'checkbox', checked: set.has(c.id), onchange: (e) => { if (e.target.checked) set.add(c.id); else set.delete(c.id); } }), ' ', c.display_name)));
  return { el, get: () => [...set] };
}

function createDialog(groups, coaches, me, done) {
  const name = h('input', { placeholder: 'Öğrencinin adı soyadı' });
  const user = h('input', { placeholder: 'kullanıcı adı', autocapitalize: 'off', spellcheck: 'false' });
  const pass = h('input', { value: randomPassword() });
  const [grp, dl] = groupInput(groups);
  const lesson = lessonSeg('grup');
  const cp = coachPicker(coaches, [me.id]);
  let userTouched = false;
  user.addEventListener('input', () => { userTouched = true; });
  name.addEventListener('input', () => { if (!userTouched) user.value = suggestUsername(name.value); });
  modal({
    title: 'Öğrenci hesabı aç', wide: true,
    body: h('div.form-col', field('Ad soyad', name), field('Kullanıcı adı', user, 'Küçük harf, rakam, nokta. Türkçe harfler otomatik çevrilir.'),
      field('İlk şifre', pass, 'Öğrenciye verin. Öğrenci girdikten sonra Ayarlar\'dan değiştirebilir.'),
      field('Ders türü', lesson.el), field('Grup', grp, 'Grup dersi için ders saati/grup adı; özel derste boş bırakılabilir.'), dl,
      coaches.length > 1 ? field('Hocaları', cp.el, 'Öğrencinin dersini veren antrenör(ler). Duyurular yalnızca hocalarından gelir.') : null),
    actions: [{ label: 'Vazgeç' }, { label: 'Hesabı aç', primary: true, onClick: () => {
      hesap('ogrenci_ac', { display_name: name.value, username: user.value, password: pass.value, group_name: grp.value, lesson_type: lesson.get(), coach_ids: cp.get() })
        .then((r) => {
          modal({ title: 'Hesap açıldı', body: h('div', h('p', h('b', name.value.trim())),
            h('div.cred', h('div', 'Site: ', h('b', location.origin + location.pathname)), h('div', 'Kullanıcı adı: ', h('b', r.username)), h('div', 'Şifre: ', h('b', pass.value))),
            h('p.muted.small', 'Bu bilgileri öğrenciye ya da velisine iletin. Şifreyi daha sonra görüntüleyemezsiniz; unutulursa "Şifre" düğmesiyle yenisini verirsiniz.')),
          actions: [{ label: 'Bilgileri kopyala', onClick: () => { navigator.clipboard?.writeText(`Köroğlu Satranç Öğrenci Sistemi\n${location.origin + location.pathname}\nKullanıcı adı: ${r.username}\nŞifre: ${pass.value}`); toast('Kopyalandı', 'ok'); return false; } },
            { label: 'Tamam', primary: true }] });
          done();
        })
        .catch((e) => toast(e.message, 'error'));
    } }],
  });
  setTimeout(() => name.focus(), 50);
}

function editDialog(s, groups, coaches, done) {
  const name = h('input', { value: s.display_name });
  const [grp, dl] = groupInput(groups, s.group_name || '');
  const lesson = lessonSeg(s.lesson_type);
  const cp = coachPicker(coaches, s.coaches || []);
  modal({ title: 'Öğrenciyi düzenle', wide: true, body: h('div.form-col', field('Ad soyad', name), field('Ders türü', lesson.el), field('Grup', grp), dl,
    coaches.length > 1 ? field('Hocaları', cp.el) : null, h('p.muted.small', `Kullanıcı adı: @${s.username} (değiştirilemez)`)),
    actions: [{ label: 'Vazgeç' }, { label: 'Kaydet', primary: true, onClick: () => {
      const payload = { id: s.id, display_name: name.value, group_name: grp.value, lesson_type: lesson.get() };
      if (coaches.length > 1) payload.coach_ids = cp.get();
      hesap('ogrenci_guncelle', payload).then(() => { toast('Kaydedildi', 'ok'); done(); }).catch((e) => toast(e.message, 'error'));
    } }] });
}

// ---------- coaches (başantrenör) ----------
function coachCreateDialog(done) {
  const name = h('input', { placeholder: 'Antrenörün adı soyadı' });
  const user = h('input', { placeholder: 'kullanıcı adı', autocapitalize: 'off', spellcheck: 'false' });
  const pass = h('input', { value: randomPassword() });
  let userTouched = false;
  user.addEventListener('input', () => { userTouched = true; });
  name.addEventListener('input', () => { if (!userTouched) user.value = suggestUsername(name.value); });
  modal({ title: 'Antrenör hesabı aç', body: h('div.form-col', field('Ad soyad', name), field('Kullanıcı adı', user), field('İlk şifre', pass, 'Antrenör girdikten sonra Ayarlar\'dan değiştirebilir.')),
    actions: [{ label: 'Vazgeç' }, { label: 'Hesabı aç', primary: true, onClick: () => {
      hesap('antrenor_ac', { display_name: name.value, username: user.value, password: pass.value })
        .then((r) => {
          modal({ title: 'Antrenör hesabı açıldı', body: h('div', h('p', h('b', name.value.trim())),
            h('div.cred', h('div', 'Site: ', h('b', location.origin + location.pathname)), h('div', 'Kullanıcı adı: ', h('b', r.username)), h('div', 'Şifre: ', h('b', pass.value)))),
          actions: [{ label: 'Bilgileri kopyala', onClick: () => { navigator.clipboard?.writeText(`Köroğlu Satranç Öğrenci Sistemi (antrenör)\n${location.origin + location.pathname}\nKullanıcı adı: ${r.username}\nŞifre: ${pass.value}`); toast('Kopyalandı', 'ok'); return false; } },
            { label: 'Tamam', primary: true }] });
          done();
        }).catch((e) => toast(e.message, 'error'));
    } }] });
  setTimeout(() => name.focus(), 50);
}
function coachEditDialog(c, done) {
  const name = h('input', { value: c.display_name });
  modal({ title: 'Antrenörü düzenle', body: h('div.form-col', field('Ad soyad', name), h('p.muted.small', `Kullanıcı adı: @${c.username}`)),
    actions: [{ label: 'Vazgeç' }, { label: 'Kaydet', primary: true, onClick: () => {
      hesap('antrenor_guncelle', { id: c.id, display_name: name.value }).then(() => { toast('Kaydedildi', 'ok'); done(); }).catch((e) => toast(e.message, 'error'));
    } }] });
}
function coachPasswordDialog(c) {
  const pass = h('input', { value: randomPassword() });
  modal({ title: `${c.display_name}: yeni şifre`, body: h('div.form-col', field('Yeni şifre', pass)),
    actions: [{ label: 'Vazgeç' }, { label: 'Şifreyi değiştir', primary: true, onClick: () => {
      hesap('antrenor_guncelle', { id: c.id, password: pass.value })
        .then(() => modal({ title: 'Şifre değişti', body: h('div.cred', h('div', 'Kullanıcı adı: ', h('b', c.username)), h('div', 'Yeni şifre: ', h('b', pass.value))), actions: [{ label: 'Tamam', primary: true }] }))
        .catch((e) => toast(e.message, 'error'));
    } }] });
}
function coachDeleteDialog(c, done) {
  modal({ title: 'Antrenör hesabı silinsin mi?', body: h('div', h('p', h('b', c.display_name), ` (@${c.username}) artık giriş yapamayacak.`), h('p', 'Verdiği ödevler, eklediği videolar ve duyurular size geçer. Öğrenciler ve çalışmaları silinmez.')),
    actions: [{ label: 'Vazgeç' }, { label: 'Sil', primary: true, onClick: () => {
      hesap('antrenor_sil', { id: c.id }).then(() => { toast('Antrenör hesabı silindi', 'ok'); done(); }).catch((e) => toast(e.message, 'error'));
    } }] });
}

function passwordDialog(s) {
  const pass = h('input', { value: randomPassword() });
  modal({ title: `${s.display_name}: yeni şifre`, body: h('div.form-col', field('Yeni şifre', pass, 'Eski şifre geçersiz olur. Öğrenci açık oturumlarında çalışmaya devam edebilir.')),
    actions: [{ label: 'Vazgeç' }, { label: 'Şifreyi değiştir', primary: true, onClick: () => {
      hesap('ogrenci_guncelle', { id: s.id, password: pass.value })
        .then(() => modal({ title: 'Şifre değişti', body: h('div.cred', h('div', 'Kullanıcı adı: ', h('b', s.username)), h('div', 'Yeni şifre: ', h('b', pass.value))), actions: [{ label: 'Tamam', primary: true }] }))
        .catch((e) => toast(e.message, 'error'));
    } }] });
}

function deleteDialog(s, done) {
  modal({ title: 'Hesap silinsin mi?', body: h('div', h('p', h('b', s.display_name), ` (@${s.username}) hesabı ve bütün çalışmaları kalıcı olarak silinecek.`), h('p.bad-text', 'Bu işlem geri alınamaz.')),
    actions: [{ label: 'Vazgeç' }, { label: 'Kalıcı olarak sil', primary: true, onClick: () => {
      hesap('ogrenci_sil', { id: s.id }).then(async () => { toast('Hesap silindi', 'ok'); await syncReports(); done(); }).catch((e) => toast(e.message, 'error'));
    } }] });
}

// ---------- shared: leaderboard (student home + coach tab) ----------
export async function fetchLeaderboard() {
  const { data, error } = await supa.rpc('leaderboard');
  if (error) throw error;
  return data || [];
}
const LB_KINDS = [['week_puzzles', 'Bu hafta bulmaca'], ['streak', 'Seri (gün)'], ['rating', 'Bulmaca puanı']];
export function leaderboardView(rows, { title = 'Haftalık sıralama', limit = 10, compact = false } = {}) {
  let kind = 'week_puzzles';
  const host = h('div.panel.lb-panel');
  const draw = () => {
    const sorted = rows.slice().sort((a, b) => b[kind] - a[kind] || a.name.localeCompare(b.name, 'tr'));
    let rank = 0, prev = null;
    const ranked = sorted.map((r, i) => { if (r[kind] !== prev) { rank = i + 1; prev = r[kind]; } return { ...r, rank }; });
    let shown = ranked.slice(0, limit);
    const mine = ranked.find((r) => r.is_me);
    if (mine && !shown.includes(mine)) shown = [...shown, mine];
    const medal = (n) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : n);
    clear(host).append(
      h('div.panel-title', title),
      h('div.seg.lb-seg', LB_KINDS.map(([k, l]) => h('button' + (k === kind ? '.active' : ''), { onclick: () => { kind = k; draw(); } }, l))),
      shown.length ? h('table.lb', shown.map((r) => h('tr' + (r.is_me ? '.me' : ''), h('td.lb-rank', medal(r.rank)), h('td', r.name, compact || !r.group_name ? null : h('span.muted.small', ` · ${r.group_name}`)), h('td.num', h('b', r[kind])))))
        : h('div.muted.small', 'Henüz veri yok. Öğrenciler çalıştıkça sıralama oluşur.'),
      h('div.muted.small', 'Sıralama, öğrencilerin siteye en son girdiği andaki çalışmalarına göre güncellenir.'));
  };
  draw();
  return host;
}

export const academyStudents = () => myStudents();
export const academyCoaches = () => myCoaches();
