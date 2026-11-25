// In-memory stand-in for the Supabase project, for UI tests with Playwright (page.route).
// Covers what the web app uses: password login, /auth/v1/user, PostgREST select/insert/upsert/update/delete
// with eq filters, and the "hesap" function. No RLS: tests only check the UI flows.
import crypto from 'node:crypto';

export function createMock() {
  const db = { profiles: [], kv: [], assignments: [], assignment_targets: [], reports: [], videos: [], lichess_accounts: [], announcements: [], student_coaches: [] };
  const users = new Map(); // email -> { id, password }
  const tokens = new Map(); // token -> user id
  const DOMAIN = 'kullanici.koroglu-satranc.app';
  const keyOf = { kv: ['user_id', 'key'], reports: ['student_id'], profiles: ['id'], assignments: ['id'], videos: ['id'], assignment_targets: ['assignment_id', 'student_id'], announcements: ['id'], lichess_accounts: ['user_id'] };

  const prof = (id) => db.profiles.find((x) => x.id === id);
  const academyOf = (p) => (p ? (p.role === 'coach' && !p.coach_id ? p.id : p.coach_id) : null);
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
      if (b.action === 'ogrenci_ac' || b.action === 'antrenor_ac') {
        const username = String(b.username).toLowerCase();
        if (db.profiles.some((x) => x.username === username)) return json(route, 400, { error: 'Bu kullanıcı adı zaten kullanılıyor.' });
        if (b.action === 'antrenor_ac') { if (me.coach_id) return json(route, 403, { error: 'yalnızca başantrenör' }); const id = addUser(username, b.password, { role: 'coach', display_name: b.display_name, coach_id: me.id }); return json(route, 200, { ok: true, id, username }); }
        const id = addUser(username, b.password, { role: 'student', display_name: b.display_name, coach_id: academyOf(me), group_name: b.group_name || null, lesson_type: b.lesson_type || 'grup' });
        for (const c of (b.coach_ids && b.coach_ids.length ? b.coach_ids : [me.id])) db.student_coaches.push({ student_id: id, coach_id: c });
        return json(route, 200, { ok: true, id, username });
      }
      if (b.action === 'ogrenci_guncelle') { const st = db.profiles.find((x) => x.id === b.id); for (const k of ['display_name', 'group_name', 'lesson_type']) if (k in b) st[k] = b[k];
        if (b.coach_ids) { db.student_coaches = db.student_coaches.filter((x) => x.student_id !== b.id); for (const c of b.coach_ids) db.student_coaches.push({ student_id: b.id, coach_id: c }); } return json(route, 200, { ok: true }); }
      if (b.action === 'ogrenci_sil') { db.profiles = db.profiles.filter((x) => x.id !== b.id); db.reports = db.reports.filter((x) => x.student_id !== b.id); return json(route, 200, { ok: true }); }
      return json(route, 400, { error: 'Bilinmeyen işlem' });
    }
    // ---- RPC ----
    if (p === '/rest/v1/rpc/set_lichess_username') {
      const uid = userFromReq(req); const me = db.profiles.find((x) => x.id === uid);
      const { uname } = JSON.parse(req.postData() || '{}');
      db.lichess_accounts = db.lichess_accounts.filter((x) => x.user_id !== uid);
      if (uname) db.lichess_accounts.push({ user_id: uid, coach_id: academyOf(me), display_name: me.display_name, username: uname });
      return json(route, 204);
    }
    if (p === '/rest/v1/rpc/set_leaderboard_ok') { const b = JSON.parse(req.postData() || '{}'); const st = db.profiles.find((x) => x.id === b.student); st.leaderboard_ok = b.ok; return json(route, 204); }
    if (p === '/rest/v1/rpc/leaderboard') {
      const uid = userFromReq(req); const me = db.profiles.find((x) => x.id === uid);
      const team = db.profiles.filter((x) => x.role === 'student' && x.coach_id === academyOf(me) && (me.role === 'coach' || x.group_name === me.group_name) && (x.leaderboard_ok || x.id === uid));
      return json(route, 200, team.map((t) => { const r = (db.reports.find((x) => x.student_id === t.id) || {}).report; const days = r ? r.activity.days.slice(-7) : [];
        return { name: t.display_name.split(' ')[0] + ' ' + t.display_name.split(' ').pop()[0] + '.', is_me: t.id === uid, group_name: t.group_name, week_puzzles: days.reduce((a, d) => a + (d.puzzles || 0) + (d.reviews || 0), 0), streak: r ? r.activity.streak.current : 0, rating: r ? r.ratings.puzzles.r : 1500 }; }));
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
      const meP = prof(uid), acad = academyOf(meP), isCoach = meP && meP.role === 'coach';
      // minimal visibility rules so the coach sees own students and students see own coach's videos
      if (table === 'profiles') { rows = rows.filter((r) => r.id === uid || (meP && r.id === meP.coach_id) || (isCoach && academyOf(r) === acad));
        if ((url.searchParams.get('select') || '').includes('student_coaches')) rows = rows.map((r) => ({ ...r, student_coaches: db.student_coaches.filter((x) => x.student_id === r.id).map((x) => ({ coach_id: x.coach_id })) })); }
      if (table === 'assignments') rows = rows.filter((a) => a.coach_id === uid || (isCoach && academyOf(prof(a.coach_id)) === acad) || db.assignment_targets.some((t) => t.assignment_id === a.id && t.student_id === uid));
      if (table === 'videos') rows = rows.filter((v) => academyOf(prof(v.coach_id)) === acad);
      if (table === 'announcements') rows = rows.filter((a) => a.coach_id === uid || (meP && meP.role === 'student' && (a.coach_id === acad || db.student_coaches.some((x) => x.student_id === uid && x.coach_id === a.coach_id)) && (!a.group_name || a.group_name === meP.group_name)));
      if (table === 'assignments' && url.searchParams.get('select') && url.searchParams.get('select').includes('assignment_targets')) rows = rows.map((a) => ({ ...a, assignment_targets: db.assignment_targets.filter((t) => t.assignment_id === a.id).map((t) => ({ student_id: t.student_id })) }));
      if (table === 'lichess_accounts') rows = rows.filter((r) => r.user_id === uid || r.coach_id === acad);
      if (table === 'reports') rows = rows.filter((r) => r.student_id === uid || (isCoach && prof(r.student_id) && prof(r.student_id).coach_id === acad));
      if (single) return rows.length ? json(route, 200, rows[0]) : json(route, 406, { code: 'PGRST116', message: 'no rows' });
      return json(route, 200, rows, { 'content-range': `0-${rows.length}/${rows.length}` });
    }
    if (method === 'POST') {
      let body = JSON.parse(req.postData() || '[]');
      if (!Array.isArray(body)) body = [body];
      const out = [];
      for (const row0 of body) {
        const row = { ...row0 };
        if (table === 'announcements') { row.id = crypto.randomUUID(); row.coach_id = uid; row.created_at = new Date().toISOString(); }
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
