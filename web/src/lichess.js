// "Lichess ile bağlan": Lichess's own OAuth (PKCE, no client secret, no app registration).
//  - Linking (no scopes): the token is used once to learn the username, then revoked.
//  - Playing (board:play + challenges): the token is kept ONLY in this browser (localStorage), never in the
//    database, so the coach and the server never see it. The password never reaches us in either case.
// The username is stored in the student's data (kv "lichess") and in lichess_accounts (so classmates can
// challenge each other); ratings are public.
import { supa } from './supa.js';

export const LICHESS = 'https://lichess.org';
const CLIENT_ID = 'koroglu-ogrenci-sistemi';
const PLAY_SCOPES = 'board:play challenge:read challenge:write';
const TOKEN_KEY = 'koroglu-lichess-oyun';
const api = () => window.api;

const redirectUri = () => location.origin + location.pathname;
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = (n = 48) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export async function startLink({ play = false } = {}) {
  const verifier = randomString(48);
  const state = randomString(16);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem('lichess-oauth', JSON.stringify({ verifier, state, play }));
  const q = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: redirectUri(), code_challenge_method: 'S256', code_challenge: challenge, state });
  if (play) q.set('scope', PLAY_SCOPES);
  location.href = `${LICHESS}/oauth?${q}`;
}

// Called at startup (after login). Returns { username, play } | { error } | null (nothing to do).
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
    if (!acc.username) return { error: 'Lichess hesabı okunamadı.' };
    if (saved.play) {
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: tok.access_token, username: acc.username, id: acc.id || acc.username.toLowerCase(),
        expires: Date.now() + (tok.expires_in ? tok.expires_in * 1000 : 300 * 86400e3) }));
    } else {
      fetch(`${LICHESS}/api/token`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok.access_token}` } }).catch(() => {});
    }
    const link = { username: acc.username, linkedAt: Date.now(), perfs: pickPerfs(acc.perfs), fetchedAt: Date.now(), registered: true };
    await api().write('lichess', link);
    await supa.rpc('set_lichess_username', { uname: acc.username });
    return { username: acc.username, play: !!saved.play };
  } catch (e) { return { error: 'Lichess\'e bağlanılamadı. İnternet bağlantınızı kontrol edin.' }; }
}

function pickPerfs(perfs = {}) {
  const out = {};
  for (const k of ['bullet', 'blitz', 'rapid', 'classical', 'puzzle']) if (perfs[k]) out[k] = { rating: perfs[k].rating, games: perfs[k].games, prov: !!perfs[k].prov };
  return out;
}

export const getLink = () => api().read('lichess', null);
export async function unlink() {
  forgetPlay();
  await supa.rpc('set_lichess_username', { uname: '' });
  return api().remove('lichess');
}

// ---------- play token (this device only) ----------
export function playToken() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    if (!t || !t.token || (t.expires && t.expires < Date.now())) return null;
    return t;
  } catch (e) { return null; }
}
export function forgetPlay() {
  const t = playToken();
  localStorage.removeItem(TOKEN_KEY);
  if (t) fetch(`${LICHESS}/api/token`, { method: 'DELETE', headers: { Authorization: `Bearer ${t.token}` } }).catch(() => {});
}

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

// Accounts linked before lichess_accounts existed: register once so classmates can find them.
export async function ensureRegistered() {
  const l = await getLink();
  if (l && l.username && !l.registered) {
    const { error } = await supa.rpc('set_lichess_username', { uname: l.username });
    if (!error) { l.registered = true; await api().write('lichess', l); }
  }
}
