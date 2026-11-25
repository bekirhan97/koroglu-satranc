import test from 'node:test';
import assert from 'node:assert/strict';
import { SeqRun, rampPuzzles, rampTarget, MODES } from '../src/renderer/modules/puzzles/rush.js';

test('Rush: 3 can, üçüncü yanlışta biter', () => {
  const r = new SeqRun('rush3', 0);
  const p = { id: 'a', rating: 900 };
  r.solved(p, 1000); r.wrong(p, 2000); r.wrong(p, 3000);
  assert.equal(r.over, false); assert.equal(r.lives, 1);
  r.wrong(p, 4000);
  assert.equal(r.over, true); assert.equal(r.score, 1);
});
test('Rush: süre dolunca biter, Hayatta kal süresiz', () => {
  const r = new SeqRun('rush3', 0);
  r.tick(180001); assert.equal(r.over, true);
  const s = new SeqRun('survival', 0);
  s.tick(1e9); assert.equal(s.over, false);
});
test('Streak: ilk yanlışta biter, bir atlama hakkı', () => {
  const r = new SeqRun('streak', 0);
  const p = { id: 'a', rating: 900 };
  assert.equal(r.skip(p), true); assert.equal(r.skip(p), false);
  r.solved(p); r.wrong(p);
  assert.equal(r.over, true); assert.equal(r.score, 1);
});
test('Rampa: tekrarsız ve artan zorlukta', () => {
  const puzzles = [];
  for (let i = 0; i < 400; i++) puzzles.push([`p${i}`, 'fen', 'e2e4 e7e5', 400 + i * 7, []]);
  const db = { themes: [], puzzles };
  const list = rampPuzzles(db, MODES.streak, 40);
  assert.equal(new Set(list.map((p) => p.id)).size, list.length);
  assert.ok(list[30].rating > list[0].rating + 500);
});
test('Rampa: başta hızlı, sonra yavaş artar', () => {
  for (const m of Object.values(MODES)) {
    const d = (i) => rampTarget(m, i + 1) - rampTarget(m, i);
    assert.ok(d(0) > d(10) && d(10) > d(40) && d(40) > 0);
  }
  assert.equal(rampTarget(MODES.rush3, 0), 600);
});
