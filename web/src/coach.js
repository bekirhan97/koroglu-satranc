// Antrenör (web): öğrenci hesapları, ödevi öğrencilere gönderme, raporları çekme.
// The desktop teacher module calls these through window.webHooks.
import { supa, hesap, cleanUsername } from './supa.js';
import { h, clear, modal, toast, fmtDate } from '../../src/renderer/core/dom.js';
import { students, packageSummary } from '../../src/renderer/core/assign.js';
import { videoStore } from './videos.js';

export async function syncReports() {
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
  const { data, error } = await supa.from('profiles').select('id, username, display_name, group_name, created_at').eq('role', 'student').order('display_name');
  if (error) throw error;
  return data;
}

const suggestUsername = (name) => cleanUsername(name).replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 32);
const randomPassword = () => { const w = 'abcdefghjkmnpqrstuvwxyz'; let s = ''; for (let i = 0; i < 4; i++) s += w[Math.floor(Math.random() * w.length)]; return s + (100 + Math.floor(Math.random() * 900)); };

export function accountsHooks(me) {
  return {
    syncReports,
    videoList: () => videoStore.load(true),

    // "Hesaplar" tab: list, create, rename/regroup, reset password, delete.
    async accountsTab(body, { onChange } = {}) {
      clear(body).append(h('div.empty', 'Yükleniyor…'));
      let list;
      try { list = await myStudents(); } catch (e) { clear(body).append(h('div.empty', 'Öğrenciler alınamadı: ' + e.message)); return; }
      const lastReport = Object.fromEntries(Object.values(students.map).map((s) => [s.id, s.last && s.last.createdAt]));
      const groups = [...new Set(list.map((s) => s.group_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
      const redraw = () => this.accountsTab(body, { onChange });
      clear(body).append(h('div.sets-page',
        h('div.toolbar',
          h('button.btn.primary', { onclick: () => createDialog(groups, redraw) }, '+ Öğrenci hesabı aç'),
          h('span.muted', `${list.length} öğrenci`, groups.length ? ` · ${groups.length} grup` : '')),
        list.length ? h('div.table-host', h('table.games.accounts',
          h('thead', h('tr', h('th', 'Öğrenci'), h('th', 'Kullanıcı adı'), h('th', 'Grup'), h('th', 'Son çalışma'), h('th', ''))),
          h('tbody', list.map((s) => h('tr',
            h('td', h('b', s.display_name), h('div.sub', `açıldı ${fmtDate(s.created_at)}`)),
            h('td', '@' + s.username),
            h('td', s.group_name || h('span.muted', '–')),
            h('td', lastReport[s.id] ? fmtDate(lastReport[s.id]) : h('span.muted', 'henüz yok')),
            h('td.acc-actions',
              h('button.btn.small', { onclick: () => editDialog(s, groups, redraw) }, 'Düzenle'),
              h('button.btn.small', { onclick: () => passwordDialog(s) }, 'Şifre'),
              h('button.btn.small.ghost', { onclick: () => deleteDialog(s, redraw) }, 'Sil')))))))
          : h('div.empty', h('div.big-icon', '👥'), h('h3', 'Henüz öğrenci hesabı yok'),
            h('p', 'Her öğrenci için bir kullanıcı adı ve ilk şifre belirleyin. Öğrenciye bu ikisini verin; telefondan, tabletten ya da bilgisayardan bu siteye girer.'),
            h('p.muted.small', 'Çocuklardan e-posta adresi istenmez.'))));
      if (onChange) onChange(list);
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
          groups.map((g) => h('button.btn.small', { onclick: () => { list.filter((s) => s.group_name === g).forEach((s) => chosen.add(s.id)); sync(); } }, g)),
          h('button.btn.small.ghost', { onclick: () => { chosen.clear(); sync(); } }, 'Temizle')),
        h('div.pick-list', list.map((s) => {
          const cb = h('input', { type: 'checkbox', onchange: (e) => { if (e.target.checked) chosen.add(s.id); else chosen.delete(s.id); sync(); } });
          boxes.set(s.id, cb);
          return h('label.pick', cb, h('span', s.display_name), s.group_name ? h('span.muted.small', ' · ' + s.group_name) : null);
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

function createDialog(groups, done) {
  const name = h('input', { placeholder: 'Öğrencinin adı soyadı' });
  const user = h('input', { placeholder: 'kullanıcı adı', autocapitalize: 'off', spellcheck: 'false' });
  const pass = h('input', { value: randomPassword() });
  const [grp, dl] = groupInput(groups);
  let userTouched = false;
  user.addEventListener('input', () => { userTouched = true; });
  name.addEventListener('input', () => { if (!userTouched) user.value = suggestUsername(name.value); });
  modal({
    title: 'Öğrenci hesabı aç',
    body: h('div.form-col', field('Ad soyad', name), field('Kullanıcı adı', user, 'Küçük harf, rakam, nokta. Türkçe harfler otomatik çevrilir.'),
      field('İlk şifre', pass, 'Öğrenciye verin. Öğrenci girdikten sonra Ayarlar\'dan değiştirebilir.'), field('Grup', grp), dl),
    actions: [{ label: 'Vazgeç' }, { label: 'Hesabı aç', primary: true, onClick: () => {
      hesap('ogrenci_ac', { display_name: name.value, username: user.value, password: pass.value, group_name: grp.value })
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

function editDialog(s, groups, done) {
  const name = h('input', { value: s.display_name });
  const [grp, dl] = groupInput(groups, s.group_name || '');
  modal({ title: 'Öğrenciyi düzenle', body: h('div.form-col', field('Ad soyad', name), field('Grup', grp), dl, h('p.muted.small', `Kullanıcı adı: @${s.username} (değiştirilemez)`)),
    actions: [{ label: 'Vazgeç' }, { label: 'Kaydet', primary: true, onClick: () => {
      hesap('ogrenci_guncelle', { id: s.id, display_name: name.value, group_name: grp.value }).then(() => { toast('Kaydedildi', 'ok'); done(); }).catch((e) => toast(e.message, 'error'));
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
