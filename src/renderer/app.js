// Köroğlu Satranç – application shell: sidebar navigation, home, settings, first-run profile.
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import './styles.css';
import { h, clear, modal, toast } from './core/dom.js';
import { store, newProfile } from './core/store.js';
import { loadOpenings } from './core/openings.js';
import { modules } from './modules/registry.js';

const app = document.getElementById('app');
let mounted = null;
let activeId = 'home';

function nav() {
  const item = (id, icon, title, extra) =>
    h('button.nav-item' + (activeId === id ? '.active' : ''), { onclick: () => go(id) }, h('span.nav-icon', icon), h('span', title), extra);
  return h('aside.sidebar',
    h('div.brand', h('div.brand-mark', '♜'), h('div', h('div.brand-name', 'Köroğlu'), h('div.brand-sub', 'Satranç'))),
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
        h('div.panel-title', 'Veriler'),
        row('Veri klasörü', h('button.btn.small', { onclick: () => window.api.openDataDir() }, 'Klasörü aç'), info.dataDir),
        row('Sürüm', h('span', info.version))))));
}

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
