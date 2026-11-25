import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { StormRun, stormPuzzles } from '../src/renderer/modules/puzzles/storm.js';

const db = JSON.parse(fs.readFileSync(new URL('../resources/puzzles.json', import.meta.url), 'utf8'));

test('Storm bulmacaları kolaydan zora, tekrarsız', () => {
  const l = stormPuzzles(db, 60);
  assert.equal(l.length, 60);
  assert.equal(new Set(l.map((p) => p.id)).size, 60);
  const avg = (a) => a.reduce((x, p) => x + p.rating, 0) / a.length;
  assert.ok(avg(l.slice(0, 10)) < 1000 && avg(l.slice(50)) > 2700 - 700, 'zorlaşıyor');
  assert.ok(l[0].rating < 800);
});

test('Storm saati: yanlış −10 sn, seri bonusu, süre bitince biter', () => {
  const t0 = 1e6;
  const r = new StormRun(3, t0);
  const p = { id: 'x', rating: 900 };
  for (let i = 0; i < 4; i++) assert.equal(r.solved(p, t0), 0);
  assert.equal(r.solved(p, t0), 3000, '5. doğruda +3 sn');
  assert.equal(r.left, 183000);
  r.wrong(p, t0);
  assert.equal(r.left, 173000); assert.equal(r.combo, 0); assert.equal(r.errors, 1);
  r.tick(t0 + 173000);
  assert.ok(r.over);
  const s = r.summary();
  assert.equal(s.score, 5); assert.equal(s.bestCombo, 5);
});
