// "Ana ekrana ekle": the site installs like an app (logo on the home screen, opens full screen).
import { h } from '../../src/renderer/core/dom.js';

let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; document.dispatchEvent(new Event('install-ready')); });
window.addEventListener('appinstalled', () => { deferred = null; });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Card with a button (Android/desktop Chrome, Edge) or instructions (iPhone/iPad, others).
export function installCard({ onDismiss } = {}) {
  if (isInstalled()) return null;
  const body = h('div.install-body');
  const draw = () => {
    body.replaceChildren();
    if (deferred) body.append(h('button.btn.primary', { onclick: async () => { deferred.prompt(); const r = await deferred.userChoice; deferred = null; if (r.outcome === 'accepted') card.remove(); else draw(); } }, 'Ana ekrana ekle'));
    else if (isIOS()) body.append(h('div.small', 'Safari\'de alttaki ', h('b', 'Paylaş'), ' (□↑) düğmesine, sonra ', h('b', '"Ana Ekrana Ekle"'), '\'ye dokunun.'));
    else body.append(h('div.small', 'Tarayıcı menüsünden (⋮) ', h('b', '"Ana ekrana ekle"'), ' ya da ', h('b', '"Uygulamayı yükle"'), ' seçeneğine dokunun.'));
  };
  document.addEventListener('install-ready', draw);
  draw();
  const card = h('div.panel.install-card',
    h('img', { src: 'icon-192.png', alt: '' }),
    h('div', h('b', 'Uygulama gibi kullan'), h('div.muted.small', 'Köroğlu simgesi telefonunun ana ekranına gelir, tek dokunuşla tam ekran açılır.'), body),
    onDismiss ? h('button.icon-btn', { title: 'Kapat', onclick: () => { card.remove(); onDismiss(); } }, '✕') : null);
  return card;
}
