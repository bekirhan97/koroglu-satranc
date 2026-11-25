// In-memory stand-in for the Supabase project, for UI tests with Playwright (page.route).
// Covers what the web app uses: password login, /auth/v1/user, PostgREST select/insert/upsert/update/delete
// with eq filters, and the "hesap" function. No RLS: tests only check the UI flows.
import crypto from 'node:crypto';

export function createMock() {
  const db = { profiles: [], kv: [], assignments: [], assignment_targets: [], reports: [], videos: [] };
  const users = new Map(); // email -> { id, password }
  const tokens = new Map(); // token -> user id
  const DOMAIN = 'kullanici.koroglu-satranc.app';
  const keyOf = { kv: ['user_id', 'key'], reports: ['student_id'], profiles: ['id'], assignments: ['id'], videos: ['id'], assignment_targets: ['assignment_id', 'student_id'] };

  function addUser(username, password, profile) {
    const id = crypto.randomUUID();
    users.set(`${username}@${DOMAIN}`, { id, password });
    db.profiles.push({ id, username, created_at: new Date().toISOString(), coach_id: null, group_name: null, ...profile });
    return id;
  }
  const userFromReq = (req) => tokens.get((req.headers().authorization || '').replace(/^Bearer /, ''));
  const json = (route, status, body, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: body === undefined ? '' : JSON.stringify(body) });

  function filterRows(table, url) {
    let rows = db[table];
    for (const [k, v] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
      const m = v.match(/^(eq|like)\.(.*)$/);
      if (!m) continue;
      const val = decodeURIComponent(m[2]);
      rows = rows.filter((r) => (m[1] === 'eq' ? String(r[k]) === val : new RegExp('^' + val.replace(/[.]/g, '\\.').replace(/%/g, '.*') + '$').test(String(r[k]))));
    }
    const order = url.searchParams.get('order');
    if (order) { const [col, dir] = order.split('.'); rows = rows.slice().sort((a, b) => (a[col] > b[col] ? 1 : -1) * (dir === 'desc' ? -1 : 1)); }
    return rows;
  }

  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const p = url.pathname;
    // ---- auth ----
    if (p === '/auth/v1/token') {
      const b = JSON.parse(req.postData() || '{}');
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const uid = tokens.get(b.refresh_token);
        if (!uid) return json(route, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
        return json(route, 200, session(uid));
      }
      const u = users.get(b.email);
      if (!u || u.password !== b.password) return json(route, 400, { error: 'invalid_grant', error_code: 'invalid_credentials', msg: 'Invalid login credentials', error_description: 'Invalid login credentials' });
      return json(route, 200, session(u.id));
    }
    if (p === '/auth/v1/user') {
      const uid = userFromReq(req);
      if (!uid) return json(route, 401, { msg: 'invalid JWT' });
      if (method === 'PUT') { const b = JSON.parse(req.postData() || '{}'); for (const u of users.values()) if (u.id === uid && b.password) u.password = b.password; }
      return json(route, 200, userObj(uid));
    }
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    // ---- functions ----
    if (p === '/functions/v1/hesap') {
      const b = JSON.parse(req.postData() || '{}');
      if (b.action === 'durum') return json(route, 200, { hasCoach: true });
      const uid = userFromReq(req);
      const me = db.profiles.find((x) => x.id === uid);
      if (!me || me.role !== 'coach') return json(route, 403, { error: 'Bu işlem yalnızca antrenör içindir.' });
      if (b.action === 'ogrenci_ac') {
        const username = String(b.username).toLowerCase();
        if (db.profiles.some((x) => x.username === username)) return json(route, 400, { error: 'Bu kullanıcı adı zaten kullanılıyor.' });
        const id = addUser(username, b.password, { role: 'student', display_name: b.display_name, coach_id: me.id, group_name: b.group_name || null });
        return json(route, 200, { ok: true, id, username });
      }
      if (b.action === 'ogrenci_guncelle') { const st = db.profiles.find((x) => x.id === b.id); if ('display_name' in b) st.display_name = b.display_name; if ('group_name' in b) st.group_name = b.group_name; return json(route, 200, { ok: true }); }
      if (b.action === 'ogrenci_sil') { db.profiles = db.profiles.filter((x) => x.id !== b.id); db.reports = db.reports.filter((x) => x.student_id !== b.id); return json(route, 200, { ok: true }); }
      return json(route, 400, { error: 'Bilinmeyen işlem' });
    }
    // ---- PostgREST ----
    const m = p.match(/^\/rest\/v1\/(\w+)$/);
    if (!m || !db[m[1]]) return json(route, 404, { message: 'not found' });
    const table = m[1];
    const uid = userFromReq(req);
    const single = (req.headers().accept || '').includes('vnd.pgrst.object');
    const prefer = req.headers().prefer || '';
    if (method === 'GET' || method === 'HEAD') {
      let rows = filterRows(table, url);
      // minimal visibility rules so the coach sees own students and students see own coach's videos
      if (table === 'profiles') { const me = db.profiles.find((x) => x.id === uid); rows = rows.filter((r) => r.id === uid || r.coach_id === uid || (me && r.id === me.coach_id)); }
      if (table === 'assignments') rows = rows.filter((a) => a.coach_id === uid || db.assignment_targets.some((t) => t.assignment_id === a.id && t.student_id === uid));
      if (table === 'videos') { const me = db.profiles.find((x) => x.id === uid); rows = rows.filter((v) => v.coach_id === uid || (me && v.coach_id === me.coach_id)); }
      if (table === 'reports') rows = rows.filter((r) => r.student_id === uid || db.profiles.some((x) => x.id === r.student_id && x.coach_id === uid));
      if (single) return rows.length ? json(route, 200, rows[0]) : json(route, 406, { code: 'PGRST116', message: 'no rows' });
      return json(route, 200, rows, { 'content-range': `0-${rows.length}/${rows.length}` });
    }
    if (method === 'POST') {
      let body = JSON.parse(req.postData() || '[]');
      if (!Array.isArray(body)) body = [body];
      const out = [];
      for (const row0 of body) {
        const row = { ...row0 };
        if (table === 'videos') { row.id = row.id || crypto.randomUUID(); row.coach_id = row.coach_id || uid; row.created_at = new Date().toISOString(); }
        if (table === 'assignments') row.created_at = new Date().toISOString();
        const keys = keyOf[table];
        const i = db[table].findIndex((r) => keys.every((k) => r[k] === row[k]));
        if (i >= 0) { if (prefer.includes('merge-duplicates')) db[table][i] = { ...db[table][i], ...row }; else return json(route, 409, { code: '23505', message: 'duplicate key' }); }
        else db[table].push(row);
        out.push(row);
      }
      return json(route, 201, prefer.includes('return=representation') ? out : undefined);
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(req.postData() || '{}');
      for (const r of filterRows(table, url)) Object.assign(r, patch);
      return json(route, 204);
    }
    if (method === 'DELETE') {
      const del = new Set(filterRows(table, url));
      db[table] = db[table].filter((r) => !del.has(r));
      return json(route, 204);
    }
    return json(route, 405, {});
  }

  function userObj(id) { const pr = db.profiles.find((x) => x.id === id); return { id, aud: 'authenticated', role: 'authenticated', email: `${pr ? pr.username : 'x'}@${DOMAIN}`, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }; }
  function session(id) {
    const access = crypto.randomUUID(), refresh = crypto.randomUUID();
    tokens.set(access, id); tokens.set(refresh, id);
    return { access_token: access, refresh_token: refresh, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: userObj(id) };
  }

  return { db, addUser, handle, attach: (ctx) => ctx.route('https://ajghkdqwgcgzscweckoo.supabase.co/**', handle) };
}
