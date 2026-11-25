// Yanlış bulmaca tekrarı, tema analizi, çalışma günlüğü ve seri.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pdata, addToReview, dueReviews, gradeReview, themeAnalysis, GRADUATE_LEVEL } from '../src/renderer/modules/puzzles/data.js';
import { INTERVALS } from '../src/renderer/core/srs.js';
import { streak, goalProgress, dayKey } from '../src/renderer/core/activity.js';

const P = { id: 'abc', src: 'lichess', fen: 'x', moves: ['e2e4'], rating: 1500, themes: ['fork'], firstAuto: true };

test('kaçırılan bulmaca 4 saat sonra gelir, doğru çözdükçe aralık uzar, 2 haftada öğrenilir', () => {
  pdata.review = {}; pdata.graduated = 0;
  const t0 = Date.UTC(2026, 10, 25, 9);
  addToReview(P, t0);
  assert.equal(dueReviews(t0 + 3600e3).length, 0);
  assert.equal(dueReviews(t0 + INTERVALS[1]).length, 1);
  let t = t0 + INTERVALS[1];
  const levels = [];
  for (let i = 0; i < 10 && pdata.review.abc; i++) { const r = gradeReview('abc', true, t); levels.push(r.graduated ? 'ok' : r.lv); t += INTERVALS[r.lv || 1]; }
  assert.deepEqual(levels, [2, 3, 4, 5, 'ok']);
  assert.equal(pdata.graduated, 1);
});

test('tekrarda yanlış: 4 saate geri döner', () => {
  pdata.review = {};
  const t0 = Date.UTC(2026, 10, 25, 9);
  addToReview(P, t0);
  gradeReview('abc', true, t0 + INTERVALS[1]);
  const r = gradeReview('abc', false, t0 + 2 * 86400e3);
  assert.equal(r.lv, 1); assert.equal(r.lapses, 1);
  assert.ok(GRADUATE_LEVEL === 5);
});

test('tema analizi: zorluğa göre performans, az veri ayrı', () => {
  const h = [];
  const add = (theme, r, ok, n) => { for (let i = 0; i < n; i++) h.push({ rated: true, r, ok, t: 1, themes: [theme, 'short'] }); };
  add('fork', 1500, true, 4); add('fork', 1500, false, 4);      // %50 at own level → normal
  add('pin', 1500, false, 5); add('pin', 1500, true, 1);        // weak
  add('skewer', 1700, true, 6);                                  // strong
  add('zugzwang', 1500, false, 2);                               // too few
  const a = themeAnalysis(h, 1500);
  const v = Object.fromEntries(a.rows.map((r) => [r.theme, r.verdict]));
  assert.deepEqual(v, { fork: 'normal', pin: 'zayif', skewer: 'guclu', zugzwang: 'az' });
  assert.deepEqual(a.weakest, ['pin']);
  assert.ok(!('short' in v), 'uzunluk temaları sayılmaz');
});

test('seri ve günlük hedef', () => {
  const k = (d) => dayKey(new Date(2026, 10, d, 12).getTime());
  const days = { [k(20)]: { puzzles: 3 }, [k(22)]: { puzzles: 10 }, [k(23)]: { puzzles: 2, reviews: 8 }, [k(24)]: { openings: 5 } };
  assert.deepEqual(streak(days, null, k(25)), { current: 3, best: 3, todayDone: false });
  const goal = { puzzles: 10 };
  assert.deepEqual(streak(days, goal, k(25)), { current: 0, best: 2, todayDone: false });
  assert.equal(goalProgress(goal, days[k(23)]).met, true, 'tekrarlar bulmaca hedefine sayılır');
  assert.equal(goalProgress({ puzzles: 10, openings: 5 }, days[k(22)]).met, false);
});
