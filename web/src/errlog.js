// Error log: uncaught errors in the browser are written to Supabase (client_errors) so coaches can see
// what went wrong on a student's phone. At most 10 distinct errors per page load; no personal data besides the user id.
import { supa } from './supa.js';

const seen = new Set();
let started = false;
const IGNORE = [/ResizeObserver loop/i, /^Script error\.?$/i, /chrome-extension:|moz-extension:|safari-extension:/i];

export function logError(message, stack = '') {
  message = String(message || 'Bilinmeyen hata').slice(0, 500);
  if (IGNORE.some((r) => r.test(message) || r.test(stack))) return;
  if (seen.has(message) || seen.size >= 10) return;
  seen.add(message);
  const page = (window.__activePage || location.hash || '').slice(0, 100);
  supa.from('client_errors').insert({ message, stack: String(stack || '').slice(0, 2000), page, ua: navigator.userAgent.slice(0, 200), version: (window.__appVersion || '').slice(0, 40) })
    .then(() => {}, () => {});
}

export function startErrorLog() {
  if (started) return;
  started = true;
  window.addEventListener('error', (e) => logError(e.message, e.error && e.error.stack ? e.error.stack : `${e.filename || ''}:${e.lineno || ''}`));
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason; logError(r && r.message ? r.message : String(r), r && r.stack); });
}

// Coach view: last 7 days.
export async function recentErrors() {
  const since = new Date(Date.now() - 7 * 86400e3).toISOString();
  const { data, error } = await supa.from('client_errors').select('id, user_id, created_at, message, stack, page, ua').gte('created_at', since).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data;
}
