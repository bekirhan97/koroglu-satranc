// Teacher ↔ student exchange.
//  - Ödev paketi (.kpaket): Guess-the-Move games (+ the teacher's engine analysis), puzzle sets,
//    opening repertoires, a due date and a daily goal. The student imports it once.
//  - İlerleme raporu (.krapor): a snapshot of the student's ratings, puzzle theme analysis, opening
//    review state, games, study days and assignment progress. The teacher imports it in teacher mode.
// Both are gzip JSON files written by the main process (file:save / file:open).
import { store } from './store.js';
import { activity, goalProgress, streak, lastDays } from './activity.js';
import { pdata, themeAnalysis, pickFrom, dueReviews } from '../modules/puzzles/data.js';
import { odata, repSummary, treeStats } from '../modules/openings/data.js';
import { unpackTree } from './pgntree.js';
import { attemptsOf, attemptStats } from '../modules/gtm/session.js';
import { buildExam, examStore } from './exam.js';

const api = window.api;
export const PACKAGE_VERSION = 1;
export const REPORT_VERSION = 1;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- student side: received assignments ----------
export const assignments = {
  list: [],   // [{ id, title, teacher, note, due, goal, receivedAt, items: { gtm: [gameId], sets: [setId], reps: [repId] } }]
  async load() { this.list = await api.read('assignments', []); return this; },
  save() { return api.write('assignments', this.list); },
  // The daily goal of the newest assignment that has one; otherwise the student's own goal from Settings.
  goal() {
    const withGoal = this.list.filter((a) => a.goal && Object.values(a.goal).some((v) => v > 0)).sort((a, b) => b.receivedAt - a.receivedAt);
    if (withGoal.length) return { ...withGoal[0].goal, from: 'teacher', teacher: withGoal[0].teacher };
    const own = store.settings.dailyGoal;
    return own && Object.values(own).some((v) => v > 0) ? { ...own, from: 'self' } : null;
  },
};

// ---------- building a package (teacher) ----------
/**
 * @param {object} p
 * @param {string} p.title
 * @param {string} p.note
 * @param {number|null} p.due  timestamp (end of day)
 * @param {object|null} p.goal { puzzles, openings, gtmGames, playGames }
 * @param {string[]} p.gtmGameIds  teacher's GTM games to include (with cached analysis)
 * @param {string[]} p.setIds      teacher's puzzle sets
 * @param {object[]} p.themeSets   [{ theme, count, min, max, name }] → concrete Lichess puzzles picked now
 * @param {string[]} p.repIds      teacher's opening repertoires
 */
export const isLichessUrl = (u) => /^https:\/\/lichess\.org\/[\w\-/#?=&.]+$/.test(String(u || '').trim());

export async function buildPackage({ title, note = '', due = null, goal = null, gtmGameIds = [], setIds = [], themeSets = [], repIds = [], links = [], exam = null, videos = [] }) {
  const games = store.games.filter((g) => gtmGameIds.includes(g.id));
  const analysis = {};
  for (const g of games) { const a = await store.loadAnalysis(g.id); if (a && Object.keys(a.plies || {}).length) analysis[g.id] = a; }
  const sets = pdata.sets.filter((s) => setIds.includes(s.id)).map((s) => ({ name: s.name, puzzles: s.puzzles }));
  if (themeSets.length) {
    const db = await pdata.loadDb();
    for (const t of themeSets) {
      const seen = new Set();
      const puzzles = [];
      for (let i = 0; i < t.count; i++) {
        const target = t.min + ((t.max - t.min) * (i + 0.5)) / t.count; // spread from easy to hard
        const p = pickFrom(db, { target, theme: t.theme, seen });
        if (!p) break;
        seen.add(p.id);
        puzzles.push({ id: p.id, fen: p.fen, moves: p.moves, rating: p.rating, themes: p.themes, firstAuto: true, title: `Lichess #${p.id}` });
      }
      if (puzzles.length) sets.push({ name: t.name, puzzles, lichess: true });
    }
  }
  let examObj = null;
  if (exam) {
    // exam = { title, minutes, puzzles: { theme, count, min, max } | { setId, count }, gtmGameId, repId, openingCount }
    let puzzles = [];
    if (exam.puzzles && exam.puzzles.setId) {
      const s = pdata.sets.find((x) => x.id === exam.puzzles.setId);
      if (s) puzzles = s.puzzles.slice(0, exam.puzzles.count || s.puzzles.length);
    } else if (exam.puzzles && exam.puzzles.count) {
      const db = await pdata.loadDb();
      const seen = new Set();
      for (let i = 0; i < exam.puzzles.count; i++) {
        const t = exam.puzzles;
        const p = pickFrom(db, { target: t.min + ((t.max - t.min) * (i + 0.5)) / t.count, theme: t.theme || undefined, seen });
        if (!p) break;
        seen.add(p.id); puzzles.push({ ...p, firstAuto: true });
      }
    }
    let gtm = null;
    const gg = exam.gtmGameId && store.games.find((g) => g.id === exam.gtmGameId);
    if (gg) gtm = { game: gg, analysis: await store.loadAnalysis(gg.id) };
    let opening = null;
    const rr = exam.repId && odata.reps.find((x) => x.id === exam.repId);
    if (rr) opening = { rep: { name: rr.name, color: rr.color, roots: (await api.read('openings/tree-' + rr.id, { roots: [] })).roots }, count: exam.openingCount || 10 };
    examObj = buildExam({ title: exam.title, minutes: exam.minutes, puzzles, opening, gtm });
    if (!Object.keys(examObj.sections).length) examObj = null;
  }
  const reps = [];
  for (const r of odata.reps.filter((x) => repIds.includes(x.id))) {
    const tree = await api.read('openings/tree-' + r.id, { roots: [] });
    reps.push({ name: r.name, color: r.color, roots: tree.roots });
  }
  return {
    format: 'koroglu-paket', v: PACKAGE_VERSION, id: uid(), title, note, due, goal,
    teacher: store.profile.name, createdAt: Date.now(),
    gtm: { games, analysis }, sets, reps,
    links: links.filter((l) => isLichessUrl(l.url)).map((l) => ({ title: String(l.title || 'Lichess turnuvası').slice(0, 80), url: l.url.trim() })),
    exam: examObj,
    videos: videos.filter((v) => /^[A-Za-z0-9_-]{11}$/.test(v.youtubeId)).map((v) => ({ id: v.id, title: String(v.title).slice(0, 160), youtubeId: v.youtubeId })),
  };
}

export function packageSummary(pkg) {
  const parts = [];
  if (pkg.gtm && pkg.gtm.games.length) parts.push(`${pkg.gtm.games.length} Tahmin Et oyunu` + (Object.keys(pkg.gtm.analysis || {}).length ? ` (${Object.keys(pkg.gtm.analysis).length} analizli)` : ''));
  const pz = (pkg.sets || []).reduce((a, s) => a + s.puzzles.length, 0);
  if (pz) parts.push(`${pz} bulmaca (${pkg.sets.length} set)`);
  if (pkg.reps && pkg.reps.length) parts.push(`${pkg.reps.length} açılış repertuvarı`);
  if (pkg.links && pkg.links.length) parts.push(`${pkg.links.length} Lichess bağlantısı`);
  if (pkg.videos && pkg.videos.length) parts.push(`${pkg.videos.length} video`);
  if (pkg.exam) parts.push(`Sınav: ${pkg.exam.title || 'sınav'}`);
  return parts;
}

// ---------- importing a package (student) ----------
export async function importPackage(pkg) {
  if (!pkg || pkg.format !== 'koroglu-paket') throw new Error('Bu bir ödev paketi değil.');
  if (pkg.v > PACKAGE_VERSION) throw new Error('Bu paket daha yeni bir sürümle hazırlanmış. Lütfen uygulamayı güncelleyin.');
  await assignments.load();
  if (assignments.list.some((a) => a.id === pkg.id)) return { duplicate: true };
  const items = { gtm: [], sets: [], reps: [] };
  const collection = pkg.title;

  // Guess the Move games (keep the student's own copy if they already have the same game)
  const known = new Set(store.games.map((g) => g.id));
  for (const g of (pkg.gtm && pkg.gtm.games) || []) {
    if (!known.has(g.id)) { store.games.push({ ...g, collection, addedAt: Date.now(), assignment: pkg.id }); known.add(g.id); }
    const a = pkg.gtm.analysis && pkg.gtm.analysis[g.id];
    if (a && !(await store.loadAnalysis(g.id))) await store.saveAnalysis(g.id, a);
    items.gtm.push(g.id);
  }
  if (items.gtm.length) await store.saveGames();

  // Puzzle sets
  (pkg.sets || []).forEach((s, i) => {
    const id = `${pkg.id}-${i}`;
    if (!pdata.sets.some((x) => x.id === id)) pdata.sets.push({ id, name: `${s.name}`, addedAt: Date.now(), puzzles: s.puzzles, assignment: pkg.id });
    items.sets.push(id);
  });
  if (items.sets.length) await pdata.saveSets();

  // Opening repertoires
  await odata.load();
  for (const [i, r] of (pkg.reps || []).entries()) {
    const id = `${pkg.id}-${i}`;
    if (!odata.reps.some((x) => x.id === id)) {
      await api.write('openings/tree-' + id, { roots: r.roots });
      const roots = r.roots.map((x) => unpackTree(x.packed, x.fen));
      const st = treeStats(roots, r.color);
      odata.reps.push({ id, name: r.name, color: r.color, addedAt: Date.now(), lines: st.lines, cards: st.cards, nodes: st.nodes, assignment: pkg.id });
      odata.trees.delete(id);
    }
    items.reps.push(id);
  }
  if (items.reps.length) await odata.saveIndex();

  const links = (pkg.links || []).filter((l) => isLichessUrl(l.url));
  assignments.list.push({ id: pkg.id, title: pkg.title, teacher: pkg.teacher, note: pkg.note || '', due: pkg.due || null, goal: pkg.goal || null, createdAt: pkg.createdAt, receivedAt: Date.now(), items, links, exam: pkg.exam || null, videos: pkg.videos || [] });
  await assignments.save();
  return { duplicate: false, items };
}

// The teacher withdrew an assignment (web): remove it and the material that came with it.
export async function removeAssignment(id) {
  await assignments.load();
  const a = assignments.list.find((x) => x.id === id);
  if (!a) return false;
  assignments.list = assignments.list.filter((x) => x.id !== id);
  await assignments.save();
  await pdata.ensure();
  const setIds = new Set(pdata.sets.filter((s) => s.assignment === id).map((s) => s.id));
  if (setIds.size) { pdata.sets = pdata.sets.filter((s) => !setIds.has(s.id)); for (const k of setIds) delete pdata.progress[k]; await pdata.saveSets(); await pdata.saveProgress(); }
  const games = store.games.filter((g) => g.assignment === id).length;
  if (games) { store.games = store.games.filter((g) => g.assignment !== id); await store.saveGames(); }
  await odata.load();
  for (const r of odata.reps.filter((x) => x.assignment === id)) await odata.remove(r.id);
  return true;
}

// Progress of one assignment: fraction done for each part and overall.
export async function assignmentProgress(a) {
  await pdata.ensure();
  const parts = [];
  if (a.items.gtm.length) {
    const done = a.items.gtm.filter((id) => attemptsOf(id).some((x) => x.status === 'done')).length;
    parts.push({ kind: 'gtm', label: 'Tahmin Et oyunu', done, total: a.items.gtm.length });
  }
  if (a.items.sets.length) {
    let done = 0, ok = 0, total = 0;
    for (const id of a.items.sets) {
      const s = pdata.sets.find((x) => x.id === id);
      if (!s) continue;
      const pr = pdata.progress[id] || {};
      total += s.puzzles.length;
      done += s.puzzles.filter((p) => pr[p.id]).length;
      ok += s.puzzles.filter((p) => pr[p.id] === 'ok').length;
    }
    parts.push({ kind: 'sets', label: 'bulmaca', done, total, ok });
  }
  if (a.items.reps.length) {
    let done = 0, total = 0;
    await odata.load();
    for (const id of a.items.reps) {
      const rep = odata.reps.find((x) => x.id === id);
      if (!rep) continue;
      const s = repSummary(rep, await odata.tree(id), await odata.srsOf(id));
      done += s.learned; total += s.total;
    }
    parts.push({ kind: 'reps', label: 'açılış pozisyonu', done, total });
  }
  if (a.videos && a.videos.length) {
    const watched = await api.read('videos/watched', {});
    parts.push({ kind: 'videos', label: 'video', done: a.videos.filter((v) => watched[v.id]).length, total: a.videos.length });
  }
  if (a.exam) {
    const st = await examStore.get(a.exam.id);
    parts.push({ kind: 'exam', label: st && st.finishedAt ? `sınav (${st.score} puan)` : 'sınav', done: st && st.finishedAt ? 1 : 0, total: 1 });
  }
  const fr = parts.filter((p) => p.total).map((p) => p.done / p.total);
  const pct = fr.length ? fr.reduce((x, y) => x + y, 0) / fr.length : 1;
  return { parts, pct, complete: pct >= 1, overdue: !!(a.due && Date.now() > a.due && pct < 1) };
}

// ---------- the progress report (student → teacher) ----------
const thin = (hist, max = 150) => { if (hist.length <= max) return hist; const step = hist.length / max; const out = []; for (let i = 0; i < max; i++) out.push(hist[Math.floor(i * step)]); out.push(hist[hist.length - 1]); return out; };

export async function buildReport() {
  await pdata.ensure();
  await activity.load();
  await assignments.load();
  const p = store.profile;
  const goal = assignments.goal();
  const pz = store.profile.ratings.puzzles;
  const hist = pdata.history;
  const rated = hist.filter((x) => x.rated);
  const ta = themeAnalysis(hist, pz.r);
  const since7 = Date.now() - 7 * 86400e3;

  await odata.load();
  const reps = [];
  for (const r of odata.reps) { const s = repSummary(r, await odata.tree(r.id), await odata.srsOf(r.id)); reps.push({ name: r.name, color: r.color, ...s, assignment: r.assignment || null }); }

  const gtmGames = [];
  for (const g of store.games) {
    const done = attemptsOf(g.id).filter((a) => a.status === 'done');
    if (!done.length) continue;
    const last = done[done.length - 1];
    const st = attemptStats(last);
    gtmGames.push({ id: g.id, white: g.headers.White, black: g.headers.Black, side: g.userColor, at: last.finishedAt, avg: Math.round(st.avg * 10) / 10,
      master: st.played ? Math.round((100 * st.master) / st.played) : 0, change: Math.round(st.ratingChange), rated: last.rated, assignment: g.assignment || null });
  }
  gtmGames.sort((a, b) => b.at - a.at);

  const playGames = (await api.read('play/games', [])).filter((g) => g.status === 'done' && g.result && g.result !== '*');
  const res = { w: 0, d: 0, l: 0 };
  for (const g of playGames) { if (g.result === '1/2-1/2') res.d++; else if ((g.result === '1-0') === (g.userColor === 'w')) res.w++; else res.l++; }

  const asg = [];
  for (const a of assignments.list) { const pr = await assignmentProgress(a); asg.push({ id: a.id, title: a.title, due: a.due, receivedAt: a.receivedAt, pct: pr.pct, parts: pr.parts }); }

  return {
    format: 'koroglu-rapor', v: REPORT_VERSION,
    student: { id: p.id, name: p.name },
    createdAt: Date.now(),
    appVersion: (await api.appInfo()).version,
    ratings: {
      puzzles: { r: Math.round(pz.r), rd: Math.round(pz.rd), history: thin(pz.history) },
      gtm: { r: Math.round(store.profile.ratings.gtm.r), rd: Math.round(store.profile.ratings.gtm.rd), history: thin(store.profile.ratings.gtm.history) },
    },
    puzzles: {
      total: hist.length, rated: rated.length, ok: hist.filter((x) => x.ok).length,
      last7: hist.filter((x) => x.t >= since7).length, last7ok: hist.filter((x) => x.t >= since7 && x.ok).length,
      themes: ta.rows.map((r) => ({ theme: r.theme, n: r.n, ok: r.ok, diff: Math.round(r.diff), verdict: r.verdict })), weakest: ta.weakest,
      reviewDue: dueReviews().length, reviewTotal: Object.keys(pdata.review).length, graduated: pdata.graduated,
    },
    openings: reps,
    gtm: { games: gtmGames.slice(0, 40), played: gtmGames.length },
    play: { ...res, total: playGames.length, recent: playGames.slice(-10).reverse().map((g) => ({ t: g.t, opp: g.opp, result: g.result, side: g.userColor, reason: g.reason, tc: g.tc || null })) },
    activity: { days: lastDays(activity.days, 56), streak: streak(activity.days, goal), goal },
    assignments: asg,
    badges: await api.read('badges', {}),
    exams: await api.read('exams', {}),
    videos: await api.read('videos/watched', {}),
  };
}

// ---------- teacher side: students' reports ----------
export const students = {
  map: {},     // id -> { id, name, reports: [report summaries…], last: full latest report }
  async load() { this.map = await api.read('teacher/students', {}); return this; },
  save() { return api.write('teacher/students', this.map); },
  add(report) {
    if (!report || report.format !== 'koroglu-rapor') throw new Error('Bu bir ilerleme raporu değil.');
    const id = report.student.id || report.student.name;
    const s = (this.map[id] = this.map[id] || { id, name: report.student.name, reports: [] });
    if (s.last && s.last.createdAt >= report.createdAt) return { older: true, student: s };
    s.name = report.student.name;
    s.last = report;
    s.reports.push({ t: report.createdAt, puzzles: report.ratings.puzzles.r, gtm: report.ratings.gtm.r, solved: report.puzzles.total });
    this.save();
    return { older: false, student: s };
  },
  remove(id) { delete this.map[id]; return this.save(); },
};

export const sentPackages = {
  list: [],
  async load() { this.list = await api.read('teacher/packages', []); return this; },
  add(pkg) { this.list.push({ id: pkg.id, title: pkg.title, createdAt: pkg.createdAt, due: pkg.due, summary: packageSummary(pkg) }); return api.write('teacher/packages', this.list); },
};
