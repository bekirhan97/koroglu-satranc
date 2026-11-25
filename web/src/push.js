// Notifications (Web Push): subscribe this device, and ask the "bildirim" Edge Function to notify students.
// iPhone/iPad: only works after "Ana Ekrana Ekle" (iOS 16.4+), when the site is opened from the home screen icon.
import { supa, SUPABASE_URL, SUPABASE_KEY } from './supa.js';
import { isInstalled, isIOS } from './install.js';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const needsHomeScreen = () => isIOS() && !isInstalled();

async function call(action, payload = {}) {
  const { data: s } = await supa.auth.getSession();
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  if (s.session) headers.Authorization = `Bearer ${s.session.access_token}`;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/bildirim`, { method: 'POST', headers, body: JSON.stringify({ action, ...payload }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error || `Hata (${res.status})`);
  return body;
}

const b64ToBytes = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

// 'on' | 'off' | 'denied' | 'unsupported' | 'homescreen'
export async function pushState() {
  if (needsHomeScreen()) return 'homescreen';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Bildirim izni verilmedi. Tarayıcı ayarlarından izin verebilirsin.' : 'Bildirim izni verilmedi.');
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('sw.js'));
  await navigator.serviceWorker.ready;
  const { publicKey } = await call('anahtar');
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // a subscription made with another key cannot be reused
    const k = sub.options && sub.options.applicationServerKey;
    if (k && btoa(String.fromCharCode(...new Uint8Array(k))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== publicKey) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  const j = sub.toJSON();
  const me = (await supa.auth.getUser()).data.user;
  await supa.from('push_subs').delete().eq('endpoint', j.endpoint); // same device, maybe another account before
  const { error } = await supa.from('push_subs').insert({ endpoint: j.endpoint, user_id: me.id, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) });
  if (error) throw new Error('Kaydedilemedi: ' + error.message);
  await call('deneme').catch(() => {});
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) { await supa.from('push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
}

// Before logging out: this device should stop receiving this account's notifications.
export async function forgetDevice() {
  try {
    const reg = pushSupported() && (await navigator.serviceWorker.getRegistration());
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) await supa.from('push_subs').delete().eq('endpoint', sub.endpoint);
  } catch (e) { /* ignore */ }
}

// Coach side: fire and forget.
export function notify(ids, title, body, url = '#home', tag = '') {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return;
  call('gonder', { ids: list, title, body, url, tag }).catch(() => {});
}
