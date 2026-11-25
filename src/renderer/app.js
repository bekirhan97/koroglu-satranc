// Köroğlu Satranç – application shell: sidebar navigation, home, settings, first-run profile.
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import './styles.css';
import { h, clear, modal, toast, fmtDate } from './core/dom.js';
import { store, newProfile } from './core/store.js';
import { loadOpenings } from './core/openings.js';
import { modules } from './modules/registry.js';
import brandLogo from './assets/brand.png';
import { activity, goalProgress, streak, GOAL_KINDS } from './core/activity.js';
import { assignments, importPackage, assignmentProgress, buildReport, packageSummary } from './core/assign.js';
import { importReports } from './modules/teacher/index.js';

const visibleModules = () => modules.filter((m) => !m.teacherOnly || store.settings.teacherMode);

const app = document.getElementById('app');
let mounted = null;
let activeId = 'home';

function nav() {
  const item = (id, icon, title, extra) =>
    h('button.nav-item' + (activeId === id ? '.active' : ''), { onclick: () => go(id) }, h('span.nav-icon', icon), h('span', title), extra);
  return h('aside.sidebar',
    h('div.brand', h('img.brand-logo', { src: brandLogo, alt: '' }), h('div', h('div.brand-name', 'Köroğlu'), h('div.brand-sub', 'Satranç Akademi'))),
    item('home', '⌂', 'Ana Sayfa'),
    h('div.nav-sep', 'Çalışma'),
    visibleModules().map((m) => item(m.id, m.icon, m.title, m.ready ? null : h('span.soon', 'yakında'))),
    h('div.nav-fill'),
    item('settings', '⚙', 'Ayarlar'),
    h('div.profile-chip', store.profile ? store.profile.name : ''));
}

function layout(content) {
  clear(app).append(h('div.shell', nav(), h('main.main', content)));
}

function go(id) {
  if (mounted && mounted.unmount) mounted.unmount();
  mounted = null;
  activeId = id;
  const content = h('div.content');
  layout(content);
  if (id === 'home') return renderHome(content);
  if (id === 'settings') return renderSettings(content);
  const m = modules.find((x) => x.id === id);
  if (!m) return renderHome(content);
  if (!m.ready) {
    content.append(h('div.module', h('div.module-head', h('h2', m.title)),
      h('div.empty', h('div.big-icon', m.icon), h('h3', 'Bu bölüm hazırlanıyor'), h('p', m.description))));
    return;
  }
  const res = m.mount(content, { go });
  if (res && res.then) res.then((r) => { if (activeId === id) mounted = r; else if (r && r.unmount) r.unmount(); });
  else mounted = res;
}

async function renderHome(root) {
  const p = store.profile;
  await Promise.all([activity.load(), assignments.load()]);
  const today = h('div.today');
  const asgHost = h('div.asg-host');
  root.append(h('div.home',
    h('div.hero', h('div', h('h1', `Hoş geldin, ${p.name}`), h('p.muted', 'Bugün ne çalışmak istersin?')),
      h('div.hero-actions',
        h('button.btn', { onclick: () => openPackageFiles() }, 'Ödev paketi aç…'),
        h('button.btn.primary', { onclick: () => sendReport() }, 'Rapor gönder'))),
    today,
    asgHost,
    h('div.module-grid', visibleModules().map((m) => h('button.module-card' + (m.ready ? '' : '.disabled'), { onclick: () => go(m.id) },
      h('div.mc-icon', m.icon),
      h('div.mc-title', m.title, m.ready ? null : h('span.soon', 'yakında')),
      h('div.mc-desc', m.description),
      m.homeInfo ? infoSlot(m) : null)))));
  renderToday(today);
  renderAssignments(asgHost);
}

function renderToday(host) {
  const goal = assignments.goal();
  const day = activity.day();
  const gp = goalProgress(goal, day);
  const st = streak(activity.days, goal);
  const fire = h('div.streak' + (st.todayDone ? '.done' : ''), h('div.streak-n', st.current), h('div.streak-l', st.current === 1 ? 'günlük seri' : 'günlük seri'),
    h('div.muted.small', st.todayDone ? 'Bugün tamam ✓' : st.current ? 'Seriyi bugün de sürdür' : 'Bugün başla'));
  const goalBox = gp
    ? h('div.goal-box', h('div.goal-title', gp.met ? '🎯 Bugünün hedefi tamamlandı!' : '🎯 Bugünün hedefi', goal.from === 'teacher' ? h('span.muted.small', ` · ${goal.teacher || 'öğretmen'} belirledi`) : null),
      gp.items.map((i) => h('div.goal-item' + (i.done >= i.target ? '.met' : ''),
        h('span.gi-label', i.label), h('span.gi-track', h('span', { style: { width: `${(100 * i.done) / i.target}%` } })), h('span.gi-num', `${i.raw}/${i.target}`))))
    : h('div.goal-box.empty-goal', h('div.goal-title', '🎯 Günlük hedef yok'),
      h('p.muted.small', 'Öğretmeniniz ödev paketiyle bir hedef gönderebilir ya da Ayarlar\'dan kendiniz belirleyebilirsiniz.'),
      h('button.btn.small', { onclick: () => go('settings') }, 'Hedef belirle'),
      h('div.muted.small', `Bugün: ${(day.puzzles || 0) + (day.reviews || 0)} bulmaca, ${day.openings || 0} açılış pozisyonu, ${day.gtmMoves || 0} tahmin`));
  clear(host).append(fire, goalBox);
}

async function renderAssignments(host) {
  const list = assignments.list.slice().sort((a, b) => (a.due || 9e15) - (b.due || 9e15));
  if (!list.length) return;
  const rows = [];
  for (const a of list) {
    const pr = await assignmentProgress(a);
    if (pr.complete && a.due && Date.now() - a.due > 14 * 86400e3) continue; // finished long ago: hide
    const dueTxt = a.due ? (pr.overdue ? `süresi geçti (${fmtDate(a.due)})` : `son gün ${fmtDate(a.due)}`) : '';
    rows.push(h('div.asg' + (pr.complete ? '.complete' : pr.overdue ? '.overdue' : ''),
      h('div.asg-main', h('div.asg-title', a.title, pr.complete ? h('span.chip.ok', 'Tamamlandı') : null),
        h('div.muted.small', [a.teacher ? `${a.teacher}` : null, dueTxt].filter(Boolean).join(' · ')),
        a.note ? h('div.asg-note', a.note) : null,
        h('div.asg-parts', pr.parts.map((x) => h('button.asg-part', { onclick: () => go(x.kind === 'gtm' ? 'gtm' : x.kind === 'sets' ? 'puzzles' : 'openings') }, `${x.done}/${x.total} ${x.label}`)),
          (a.links || []).map((l) => h('button.asg-part.lichess', { title: l.url, onclick: () => window.api.openExternal(l.url) }, '♞ ', l.title, ' ↗')))),
      h('div.asg-pct', h('div.ring', { style: { '--p': Math.round(100 * pr.pct) } }, h('span', `%${Math.round(100 * pr.pct)}`)))));
  }
  if (rows.length) clear(host).append(h('div.panel.asg-panel', h('div.panel-title', 'Ödevlerim'), rows));
}

async function sendReport() {
  toast('Rapor hazırlanıyor…');
  const r = await buildReport();
  const d = new Date();
  const name = `${store.profile.name} - rapor ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`.replace(/[\\/:*?"<>|]/g, '-');
  const path = await window.api.saveFile('rapor', name, r);
  if (path) modal({ title: 'Rapor kaydedildi', body: h('div', h('p', 'Bu dosyayı öğretmeninize WhatsApp, e-posta ya da USB ile gönderin:'), h('p', h('b', path.split(/[\\/]/).pop())), h('p.muted.small', path),
    h('p.muted.small', 'Raporda puanlarınız, çalıştığınız günler, tema analizi ve ödev ilerlemeniz bulunur.')), actions: [{ label: 'Tamam', primary: true }] });
}

async function openPackageFiles() {
  const files = await window.api.openFiles('paket');
  for (const f of files) await handleFile(f);
}

// A .kpaket or .krapor arrived (double-click, "open with" or the buttons).
async function handleFile(f) {
  if (f.error) { toast(`${f.name}: ${f.error}`, 'error'); return; }
  if (f.kind === 'rapor') {
    if (!store.settings.teacherMode) {
      modal({ title: 'İlerleme raporu', body: h('div', h('p', `"${f.name}" bir öğrenci ilerleme raporu.`), h('p', 'Raporları görmek için Ayarlar\'dan öğretmen modunu açın.')),
        actions: [{ label: 'Vazgeç' }, { label: 'Öğretmen modunu aç ve ekle', primary: true, onClick: async () => { store.settings.teacherMode = true; await store.saveSettings(); await importReports([f]); go('teacher'); } }] });
      return;
    }
    await importReports([f]);
    go('teacher');
    return;
  }
  const pkg = f.data;
  await assignments.load();
  if (assignments.list.some((a) => a.id === pkg.id)) { toast(`"${pkg.title}" paketi zaten eklenmiş`); return; }
  await new Promise((resolve) => modal({
    title: 'Yeni ödev paketi',
    onClose: resolve,
    body: h('div.pkg-preview',
      h('h3', pkg.title), h('div.muted', [pkg.teacher, pkg.createdAt ? fmtDate(pkg.createdAt) : null].filter(Boolean).join(' · ')),
      pkg.note ? h('p.asg-note', pkg.note) : null,
      h('ul', packageSummary(pkg).map((x) => h('li', x))),
      pkg.due ? h('p', 'Son teslim: ', h('b', fmtDate(pkg.due))) : null,
      pkg.goal ? h('p', 'Günlük hedef: ', h('b', GOAL_KINDS.filter(([k]) => pkg.goal[k] > 0).map(([k, unit]) => `${pkg.goal[k]} ${unit}`).join(', '))) : null),
    actions: [{ label: 'Vazgeç', onClick: () => resolve() }, { label: 'Ödevi ekle', primary: true, onClick: async () => {
      try {
        const r = await importPackage(pkg);
        toast(r.duplicate ? 'Bu paket zaten eklenmiş' : `"${pkg.title}" eklendi`, 'ok');
        if (activeId === 'home') go('home');
      } catch (e) { toast('Paket eklenemedi: ' + e.message, 'error'); }
      resolve();
    } }],
  }));
}

async function takeWaitingFiles() {
  const files = await window.api.takeFiles();
  for (const f of files) await handleFile(f);
}

function infoSlot(m) {
  const el = h('div.mc-foot');
  Promise.resolve(m.homeInfo()).then((t) => { el.textContent = t || ''; }).catch(() => {});
  return el;
}

async function renderSettings(root) {
  const s = store.settings;
  const info = await window.api.appInfo();
  const engineBox = h('div.muted', 'Motor kontrol ediliyor…');
  window.api.engineInfo().then((e) => {
    clear(engineBox).append(e.exists ? `${e.name || 'Motor'} – ${e.path}` : `Motor bulunamadı: ${e.path}`);
  });
  const row = (label, control, hint) => h('div.set-row', h('div', h('div.set-label', label), hint ? h('div.muted.small', hint) : null), control);
  const save = () => { store.saveSettings(); toast('Kaydedildi', 'ok'); };
  const backupList = h('div.backup-list');
  await assignments.load();
  const tg = assignments.goal();
  const teacherGoal = tg && tg.from === 'teacher' ? tg : null;
  const updateBox = h('div.update-box');
  root.append(h('div.module', h('div.module-head', h('h2', 'Ayarlar')),
    h('div.settings',
      h('div.panel',
        h('div.panel-title', 'Profil'),
        row('Ad', h('input', { value: store.profile.name, onchange: (e) => { store.profile.name = e.target.value.trim() || store.profile.name; store.saveProfile(); go('settings'); } })),
        row('Öğretmen modu', h('input', { type: 'checkbox', checked: !!s.teacherMode, onchange: async (e) => { s.teacherMode = e.target.checked; await store.saveSettings(); go('settings'); } }),
          'Menüye "Öğretmen" bölümünü ekler: öğrencilere ödev paketi hazırlayın, gönderdikleri raporları görün.')),
      h('div.panel',
        h('div.panel-title', 'Günlük hedef'),
        teacherGoal ? h('p.muted.small', `Şu an ${teacherGoal.teacher || 'öğretmeninizin'} ödev paketiyle belirlediği hedef geçerli. Aşağıdaki kendi hedefiniz, öğretmen hedefi olmadığında kullanılır.`)
          : h('p.muted.small', 'Her gün yapmak istediğiniz çalışma. 0 bırakılanlar hedefe girmez. Hedefi tutturduğunuz her gün seriye eklenir.'),
        h('div.goal-grid', GOAL_KINDS.map(([k, , label]) => h('label', h('input.goal-in', { type: 'number', min: 0, max: 200, value: (s.dailyGoal || {})[k] || 0,
          onchange: (e) => { s.dailyGoal = { ...(s.dailyGoal || {}), [k]: Math.max(0, +e.target.value || 0) }; save(); } }), h('span', label))))),
      h('div.panel',
        h('div.panel-title', 'Hamleyi Tahmin Et'),
        row('Analiz derinliği', h('select', { onchange: (e) => { s.depth = +e.target.value; save(); } },
          [14, 16, 18, 20, 22].map((d) => h('option', { value: d, selected: s.depth === d }, `${d}${d === 18 ? ' (önerilen)' : ''}`))),
          'Yüksek derinlik daha doğru puanlama sağlar ama hamle başına daha uzun sürer. Zaten analiz edilmiş oyunlar değişmez.'),
        row('Tahminden sonra otomatik devam et', h('input', { type: 'checkbox', checked: s.autoNext, onchange: (e) => { s.autoNext = e.target.checked; save(); } }),
          'Kapalıyken her hamleden sonra "Devam" butonuna basarsınız.'),
        row('Türkçe notasyon (Ş V K F A)', h('input', { type: 'checkbox', checked: s.turkishNotation !== false, onchange: (e) => { s.turkishNotation = e.target.checked; save(); } })),
        row('Rakip hamlesi gecikmesi', h('select', { onchange: (e) => { s.opponentDelay = +e.target.value; save(); } },
          [[200, 'Hızlı'], [500, 'Normal'], [1000, 'Yavaş']].map(([v, l]) => h('option', { value: v, selected: s.opponentDelay === v }, l))))),
      h('div.panel',
        h('div.panel-title', 'Motor'),
        row('Stockfish', engineBox),
        row('İşlemci çekirdeği', h('select', { onchange: async (e) => { s.threads = +e.target.value; await store.saveSettings(); await window.api.restartEngine(); toast('Motor yeniden başlatıldı', 'ok'); } },
          [[0, 'Otomatik'], [1, '1'], [2, '2'], [4, '4'], [8, '8']].map(([v, l]) => h('option', { value: v, selected: (s.threads || 0) === v }, l))))),
      h('div.panel',
        h('div.panel-title', 'Yedekleme'),
        h('p.muted.small', 'Puanlarınız, oyunlarınız ve tekrar geçmişiniz yalnızca bu bilgisayarda durur. Uygulama her gün kendiliğinden bir yedek alır (son 7 gün saklanır). Bilgisayar değiştirirken ya da formatlamadan önce yedeği bir USB belleğe ya da buluta kaydedin.'),
        row('Yedeği dışa aktar', h('button.btn.small.primary', { onclick: async () => {
          const r = await window.api.backupExport();
          if (r) toast(`Yedek kaydedildi (${r.files} dosya)`, 'ok');
        } }, 'Yedeği kaydet…'), 'Tüm verilerinizi tek bir .kyedek dosyasına kaydeder.'),
        row('Yedekten geri yükle', h('button.btn.small', { onclick: () => restoreFlow() }, 'Yedek dosyası seç…'), 'Şu anki verilerin yerine yedekteki veriler gelir.'),
        row('Otomatik yedek klasörü', h('div.btn-row',
          h('button.btn.small', { onclick: async () => { const d = await window.api.backupChooseDir(); if (d) { toast('Klasör değiştirildi', 'ok'); go('settings'); } } }, 'Değiştir…'),
          info.backupDir.includes('backups') ? null : h('button.btn.small.ghost', { onclick: async () => { await window.api.backupResetDir(); go('settings'); } }, 'Varsayılan'),
          h('button.btn.small.ghost', { onclick: () => window.api.backupOpenDir() }, 'Aç')), info.backupDir + ' — OneDrive/Google Drive klasörü seçerseniz yedekler buluta da gider.'),
        backupList),
      h('div.panel',
        h('div.panel-title', 'Güncelleme'),
        row('Sürüm', h('span', info.version)),
        row('Durum', updateBox)),
      h('div.panel',
        h('div.panel-title', 'Sorun bildirme'),
        row('Hata raporu', h('button.btn.small', { onclick: async () => {
          const p = await window.api.saveErrorReport();
          if (p) toast('Rapor kaydedildi. Bu dosyayı öğretmeninize gönderebilirsiniz.', 'ok');
        } }, 'Hata raporunu kaydet…'), 'Uygulamada bir sorun yaşadıysanız bu dosyayı öğretmeninize gönderin. Kişisel oyun verileriniz rapora girmez.'),
        row('Veri klasörü', h('button.btn.small.ghost', { onclick: () => window.api.openDataDir() }, 'Klasörü aç'), info.dataDir)))));

  window.api.backupList().then((list) => {
    clear(backupList).append(list.length
      ? h('table.kv.backups', list.slice(0, 8).map((b) => h('tr',
        h('td', backupLabel(b.name)), h('td.muted', `${fmtDate(b.t)} ${new Date(b.t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`),
        h('td.muted', `${Math.max(1, Math.round(b.bytes / 1024))} KB`),
        h('td', h('button.btn.small.ghost', { onclick: () => confirmRestore({ path: b.path, createdAt: b.t, label: backupLabel(b.name) }) }, 'Geri yükle')))))
      : h('div.muted.small', 'Henüz otomatik yedek yok. İlk yedek uygulama açıldıktan kısa süre sonra alınır.'),
    h('button.btn.small.ghost', { style: { marginTop: '6px' }, onclick: async () => { const r = await window.api.backupNow(); if (r && !r.error) { toast('Yedek alındı', 'ok'); go('settings'); } else toast('Yedek alınamadı' + (r && r.error ? ': ' + r.error : ''), 'error'); } }, 'Şimdi yedek al'));
  });
  renderUpdate(updateBox);
}

const backupLabel = (n) => n.startsWith('otomatik-') ? 'Otomatik yedek' : n.startsWith('geri-yukleme-oncesi') ? 'Geri yükleme öncesi' : n;

async function restoreFlow() {
  const r = await window.api.backupPick();
  if (!r) return;
  if (r.error) { toast(r.error, 'error'); return; }
  confirmRestore({ path: r.path, createdAt: r.createdAt, label: `${r.profileName || 'Yedek'} · ${r.files} dosya · sürüm ${r.appVersion}` });
}

function confirmRestore({ path, createdAt, label }) {
  modal({
    title: 'Yedekten geri yüklensin mi?',
    body: h('div', h('p', h('b', label), h('br'), `Yedek tarihi: ${fmtDate(createdAt)}`),
      h('p', 'Şu anki tüm verileriniz bu yedektekilerle değiştirilecek. Güvenlik için şu anki durumun da bir yedeği alınır, gerekirse ona geri dönebilirsiniz.')),
    actions: [{ label: 'Vazgeç' }, { label: 'Geri yükle', primary: true, onClick: async () => {
      const res = await window.api.backupRestore(path);
      if (res.error) toast('Geri yüklenemedi: ' + res.error, 'error'); else toast('Geri yüklendi, uygulama yenileniyor…', 'ok');
    } }],
  });
}

// ---------- updates ----------
let updateState = { status: 'idle' };
const updateListeners = new Set();
window.api.onUpdateState((s) => { updateState = s; updateListeners.forEach((f) => f(s)); renderUpdateBanner(); });
window.api.updateState().then((s) => { if (s && s.status !== 'idle') { updateState = s; renderUpdateBanner(); } });

function updateText(s) {
  switch (s.status) {
    case 'checking': return 'Yeni sürüm aranıyor…';
    case 'latest': return 'En son sürümü kullanıyorsunuz.';
    case 'downloading': return `Yeni sürüm (${s.version}) indiriliyor… %${s.percent || 0}`;
    case 'ready': return `Yeni sürüm (${s.version}) hazır. Uygulamayı yeniden başlattığınızda kurulur.`;
    case 'manual': return `Yeni sürüm var: ${s.version}`;
    case 'error': return 'Güncelleme kontrol edilemedi (internet bağlantısı olmayabilir).';
    case 'dev': return 'Geliştirme sürümü, güncelleme kapalı.';
    default: return 'Kontrol edilmedi.';
  }
}

function updateActions(s) {
  if (s.status === 'ready') return h('button.btn.small.primary', { onclick: () => window.api.updateInstall() }, 'Şimdi yeniden başlat');
  if (s.status === 'manual') return h('button.btn.small.primary', { onclick: () => window.api.openExternal(s.url) }, 'İndir');
  if (s.status === 'downloading' || s.status === 'checking') return null;
  return h('button.btn.small', { onclick: () => window.api.updateCheck() }, 'Şimdi kontrol et');
}

function renderUpdate(box) {
  const draw = (s) => { if (!box.isConnected && box.dataset.drawn) { updateListeners.delete(draw); return; } box.dataset.drawn = '1'; clear(box).append(h('span.muted', updateText(s)), ' ', updateActions(s) || ''); };
  updateListeners.add(draw);
  draw(updateState);
}

function renderUpdateBanner() {
  document.querySelector('.update-banner')?.remove();
  const s = updateState;
  if (s.status !== 'ready' && s.status !== 'manual') return;
  if (sessionStorage.getItem('update-dismissed') === s.version) return;
  const text = s.status === 'ready' ? `Yeni sürüm ${s.version} hazır.` : `Yeni sürüm ${s.version} yayınlandı.`;
  document.body.append(h('div.update-banner', h('span', '⬆ ', text), updateActions(s),
    h('button.icon-btn', { title: 'Kapat', onclick: (e) => { sessionStorage.setItem('update-dismissed', s.version); e.target.closest('.update-banner').remove(); } }, '✕')));
}

// ---------- error reporting ----------
window.addEventListener('error', (e) => window.api.log('error', `${e.message} @ ${e.filename}:${e.lineno}\n${e.error && e.error.stack ? e.error.stack : ''}`));
window.addEventListener('unhandledrejection', (e) => window.api.log('error', 'Promise: ' + (e.reason && e.reason.stack ? e.reason.stack : e.reason)));

function firstRun() {
  return new Promise((resolve) => {
    const input = h('input.big-input', { placeholder: 'Adınız', autofocus: true });
    const done = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return false; }
      store.profile = newProfile(name);
      store.saveProfile();
      resolve();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && done() !== false) document.querySelector('.modal-back')?.remove(); });
    modal({
      title: 'Köroğlu Satranç\'a hoş geldiniz',
      body: h('div', h('p', 'Başlamak için adınızı yazın. Puanlarınız ve istatistikleriniz bu bilgisayarda saklanır.'), input),
      actions: [{ label: 'Başla', primary: true, required: true, onClick: done }],
    });
    setTimeout(() => input.focus(), 50);
  });
}

(async function boot() {
  await store.load();
  await loadOpenings();
  if (!store.profile) { layout(h('div.content')); await firstRun(); }
  go('home');
  window.api.onFilesWaiting(() => takeWaitingFiles());
  takeWaitingFiles();
  // refresh the home screen's goal/streak when study is logged elsewhere (e.g. after returning)
  window.addEventListener('activity-changed', () => { const t = document.querySelector('.today'); if (t && activeId === 'home') renderToday(t); });
})();
