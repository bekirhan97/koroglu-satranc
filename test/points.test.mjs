import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POINTS, DAY_MAX, dayPoints, pointsSummary } from '../src/renderer/core/points.js';

test('Çalışma puanı: günlük sınırlar ve toplam', () => {
  assert.equal(dayPoints({ puzzles: 100, videos: 1, gtmGames: 5, lichessGames: 2 }), 60 + 10 + 45 + 20); // same as SQL private.day_points
  assert.equal(dayPoints({}), 0);
  assert.equal(dayPoints(Object.fromEntries(POINTS.map(([k]) => [k, 999]))), DAY_MAX);
  assert.equal(DAY_MAX, 325);
  const s = pointsSummary({ '2026-11-25': { puzzles: 10, endgames: 2 }, '2026-11-26': { puzzles: 70, videos: 1 } });
  assert.equal(s.total, 10 + 10 + 60 + 10);
  assert.equal(s.by.puzzles, 80); assert.equal(s.by.videos, 1); assert.equal(s.by.lichessGames, 0);
});
