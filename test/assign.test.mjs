// Öğretmen → öğrenci → öğretmen döngüsü: paket hazırla, içe aktar, çalış, rapor, Öğrencilerim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, newProfile } from '../src/renderer/core/store.js';
import { parseGame } from '../src/renderer/core/pgn.js';
import { parsePgnTree } from '../src/renderer/core/pgntree.js';
import { pdata, recordResult } from '../src/renderer/modules/puzzles/data.js';
import { odata, grade } from '../src/renderer/modules/openings/data.js';
import { newAttempt } from '../src/renderer/modules/gtm/session.js';
import { activity } from '../src/renderer/core/activity.js';
import { buildPackage, importPackage, assignments, assignmentProgress, buildReport, students, packageSummary } from '../src/renderer/core/assign.js';

const mem = globalThis.__mem;
const GAME = `[White "Morphy"]\n[Black "Duke"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 1-0`;
const REP = `[Event "Italyan"]\n\n1. e4 e5 2. Nf3 Nc6 (2... Nf6 3. Ng5) 3. Bc4 Bc5 4. c3 *`;

async function resetAs(name) {
  mem.clear();
  store.profile = newProfile(name); store.games = []; store.attempts = {}; store.settings = { ...store.settings, dailyGoal: null };
  pdata.history = []; pdata.sets = []; pdata.progress = {}; pdata.review = {}; pdata.seen = new Set();
  odata.reps = []; odata.trees.clear(); odata.srs.clear();
  activity.days = {};
}

let pkg;
test('öğretmen paket hazırlar', async () => {
  await resetAs('Hoca');
  const g = parseGame(GAME, 'Morphy'); store.games.push(g);
  await store.saveAnalysis(g.id, { plies: { 0: { depth: 18, master: { uci: 'e2e4', cp: 30 }, top: [], extra: {}, rating: 1400 } } });
  pdata.sets.push({ id: 's1', name: 'Çatallar', puzzles: [{ id: '1', fen: '8/8/8/8/8/8/8/K6k w - - 0 1', moves: ['a1a2'], src: 'set' }] });
  const id = await odata.add({ name: 'İtalyan', color: 'w', roots: parsePgnTree(REP).roots });
  pkg = await buildPackage({ title: 'Hafta 1', note: 'Kolay gelsin', due: Date.now() + 7 * 864e5, goal: { puzzles: 10, openings: 5 },
    gtmGameIds: [g.id], setIds: ['s1'], themeSets: [{ theme: 'fork', count: 6, min: 1200, max: 1600, name: 'Çatal seçkisi' }], repIds: [id] });
  assert.equal(pkg.format, 'koroglu-paket');
  assert.equal(pkg.sets.length, 2);
  const lich = pkg.sets[1].puzzles;
  assert.equal(lich.length, 6);
  assert.ok(lich.every((p) => p.themes.includes('fork') && p.rating >= 1125 && p.rating <= 1675));
  assert.ok(lich[0].rating < lich[5].rating, 'kolaydan zora');
  assert.equal(Object.keys(pkg.gtm.analysis).length, 1);
  assert.deepEqual(packageSummary(pkg), ['1 Tahmin Et oyunu (1 analizli)', '7 bulmaca (2 set)', '1 açılış repertuvarı']);
  pkg = JSON.parse(JSON.stringify(pkg)); // as if written to disk and read back
});

let report;
test('öğrenci paketi içe aktarır, çalışır, rapor hazırlar', async () => {
  await resetAs('Ayşe');
  const r = await importPackage(pkg);
  assert.equal(r.duplicate, false);
  assert.equal((await importPackage(pkg)).duplicate, true, 'aynı paket iki kez eklenmez');
  assert.equal(store.games.length, 1);
  assert.ok(await store.loadAnalysis(store.games[0].id), 'öğretmenin analizi geldi');
  assert.equal(pdata.sets.length, 2);
  assert.equal(odata.reps.length, 1);
  assert.equal(assignments.goal().puzzles, 10);

  // work: solve 2 puzzles of the lichess set (1 wrong), learn the repertoire, finish the GTM game
  const set = pdata.sets[1];
  pdata.progress[set.id] = { [set.puzzles[0].id]: 'ok', [set.puzzles[1].id]: 'fail' };
  recordResult({ ...set.puzzles[1], src: 'set', id: `${set.id}:${set.puzzles[1].id}` }, { ok: false, ms: 1000, rated: false });
  const srs = await odata.srsOf(odata.reps[0].id);
  for (const k of ['root', 'e2e4 e7e5', 'e2e4 e7e5 g1f3 b8c6', 'e2e4 e7e5 g1f3 g8f6', 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5']) grade(srs, k, true);
  const att = newAttempt(store.games[0], true); att.status = 'done'; att.finishedAt = Date.now();

  const a = assignments.list[0];
  const pr = await assignmentProgress(a);
  const by = Object.fromEntries(pr.parts.map((p) => [p.kind, `${p.done}/${p.total}`]));
  assert.deepEqual(by, { gtm: '1/1', sets: '2/7', reps: '5/5' });
  assert.ok(pr.pct > 0.7 && pr.pct < 0.8);

  report = JSON.parse(JSON.stringify(await buildReport()));
  assert.equal(report.student.name, 'Ayşe');
  assert.equal(report.assignments[0].title, 'Hafta 1');
  assert.equal(report.gtm.played, 1);
  assert.equal(report.puzzles.reviewTotal, 1, 'yanlış set bulmacası tekrara girdi');
  assert.equal(report.activity.days.length, 56);
  assert.equal(report.openings[0].learned, 5);
});

test('öğretmen raporu Öğrencilerim\'e ekler; eski rapor yenisini ezmez', async () => {
  await resetAs('Hoca');
  await students.load();
  const r1 = students.add(report);
  assert.equal(r1.older, false);
  const old = { ...report, createdAt: report.createdAt - 1000 };
  assert.equal(students.add(old).older, true);
  const newer = { ...report, createdAt: report.createdAt + 1000, ratings: { ...report.ratings, puzzles: { ...report.ratings.puzzles, r: 1700 } } };
  students.add(newer);
  const s = Object.values(students.map)[0];
  assert.equal(s.reports.length, 2);
  assert.equal(s.last.ratings.puzzles.r, 1700);
  assert.throws(() => students.add({ format: 'x' }), /raporu değil/);
});
