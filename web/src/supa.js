// Supabase istemcisi. Yayınlanabilir anahtar herkese açıktır; güvenliği veritabanındaki RLS kuralları sağlar.
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://ajghkdqwgcgzscweckoo.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_ABfE9lmyKa9ePWYJNLql0g_aT6Bhh_q';
export const EMAIL_DOMAIN = 'kullanici.koroglu-satranc.app';

export const supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'koroglu-oturum' },
});

export const usernameToEmail = (u) => `${cleanUsername(u)}@${EMAIL_DOMAIN}`;
export function cleanUsername(u) {
  return String(u || '').trim().toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');
}

// Hesap servisi (Edge Function "hesap").
export async function hesap(action, payload = {}) {
  const { data: s } = await supa.auth.getSession();
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  if (s.session) headers.Authorization = `Bearer ${s.session.access_token}`;
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/hesap`, { method: 'POST', headers, body: JSON.stringify({ action, ...payload }) });
  } catch (e) { throw new Error('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error || `Hata (${res.status})`);
  return body;
}
