// "Lichess ile bağlan": Lichess's own OAuth (PKCE, no client secret, no app registration).
// We only use the token once to learn the account's username, then revoke it; the password never
// reaches us. The username is stored in the student's data (kv "lichess"); ratings are public.
const LICHESS = 'https://lichess.org';
const CLIENT_ID = 'koroglu-ogrenci-sistemi';
const api = () => window.api;

const redirectUri = () => location.origin + location.pathname;
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = (n = 48) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export async function startLink() {
  const verifier = randomString(48);
  const state = randomString(16);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem('lichess-oauth', JSON.stringify({ verifier, state }));
  const q = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: redirectUri(), code_challenge_method: 'S256', code_challenge: challenge, state });
  location.href = `${LICHESS}/oauth?${q}`;
}

// Called at startup (after login). Returns { username } | { error } | null (nothing to do).
export async function finishLink() {
  const p = new URLSearchParams(location.search);
  if (!p.has('code') && !p.has('error')) return null;
  const saved = JSON.parse(sessionStorage.getItem('lichess-oauth') || 'null');
  sessionStorage.removeItem('lichess-oauth');
  history.replaceState(null, '', redirectUri());
  if (p.get('error')) return { error: p.get('error') === 'access_denied' ? 'Lichess bağlantısı iptal edildi.' : 'Lichess bağlantısı yapılamadı.' };
  if (!saved || saved.state !== p.get('state')) return { error: 'Lichess bağlantısı doğrulanamadı, tekrar deneyin.' };
  try {
    const tr = await fetch(`${LICHESS}/api/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: p.get('code'), code_verifier: saved.verifier, redirect_uri: redirectUri(), client_id: CLIENT_ID }) });
    const tok = await tr.json();
    if (!tok.access_token) return { error: 'Lichess bağlantısı yapılamadı.' };
    const ar = await fetch(`${LICHESS}/api/account`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
    const acc = await ar.json();
    fetch(`${LICHESS}/api/token`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok.access_token}` } }).catch(() => {});
    if (!acc.username) return { error: 'Lichess hesabı okunamadı.' };
    const link = { username: acc.username, linkedAt: Date.now(), perfs: pickPerfs(acc.perfs), fetchedAt: Date.now() };
    await api().write('lichess', link);
    return { username: acc.username };
  } catch (e) { return { error: 'Lichess\'e bağlanılamadı. İnternet bağlantınızı kontrol edin.' }; }
}

function pickPerfs(perfs = {}) {
  const out = {};
  for (const k of ['bullet', 'blitz', 'rapid', 'classical', 'puzzle']) if (perfs[k]) out[k] = { rating: perfs[k].rating, games: perfs[k].games, prov: !!perfs[k].prov };
  return out;
}

export const getLink = () => api().read('lichess', null);
export const unlink = () => api().remove('lichess');

// Linked account with ratings refreshed at most every 3 hours (for the coach's report).
export async function lichessSummary() {
  const l = await getLink();
  if (!l || !l.username) return null;
  if (!l.fetchedAt || Date.now() - l.fetchedAt > 3 * 3600e3) {
    try {
      const r = await fetch(`${LICHESS}/api/user/${encodeURIComponent(l.username)}`);
      if (r.ok) { const u = await r.json(); l.perfs = pickPerfs(u.perfs); l.fetchedAt = Date.now(); await api().write('lichess', l); }
    } catch (e) { /* keep the old ratings */ }
  }
  return { username: l.username, perfs: l.perfs || {}, fetchedAt: l.fetchedAt };
}
