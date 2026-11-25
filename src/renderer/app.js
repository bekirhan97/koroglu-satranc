// Köroğlu Satranç – application shell: sidebar navigation, home, settings, first-run profile.
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import './styles.css';
import { h, clear, modal, toast, fmtDate } from './core/dom.js';
import { store, newProfile } from './core/store.js';
import { loadOpenings } from './core/openings.js';
import { modules } from './modules/registry.js';
import brandLogo from './assets/brand.png';

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
    modules.map((m) => item(m.id, m.icon, m.title, m.ready ? null : h('span.soon', 'yakında'))),
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

function renderHome(root) {
  const p = store.profile;
  root.append(h('div.home',
    h('div.hero', h('h1', `Hoş geldin, ${p.name}`), h('p.muted', 'Bugün ne çalışmak istersin?')),
    h('div.module-grid', modules.map((m) => h('button.module-card' + (m.ready ? '' : '.disabled'), { onclick: () => go(m.id) },
      h('div.mc-icon', m.icon),
      h('div.mc-title', m.title, m.ready ? null : h('span.soon', 'yakında')),
      h('div.mc-desc', m.description),
      m.homeInfo ? infoSlot(m) : null)))));
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
  const updateBox = h('div.update-box');
  root.append(h('div.module', h('div.module-head', h('h2', 'Ayarlar')),
    h('div.settings',
      h('div.panel',
        h('div.panel-title', 'Profil'),
        row('Ad', h('input', { value: store.profile.name, onchange: (e) => { store.profile.name = e.target.value.trim() || store.profile.name; store.saveProfile(); go('settings'); } }))),
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
})();
