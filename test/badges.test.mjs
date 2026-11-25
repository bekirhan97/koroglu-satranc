import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, BADGES } from '../src/renderer/core/badges.js';

test('rozetler: eşik ve ilerleme', () => {
  const ctx = { pzOk: 120, strongThemes: 0, graduated: 3, stormBest: 16, bestStreak: 7, gtmDone: 1, gtmBestMaster: 45, openings: 30, wins: 2, beatMaia1900: 0, beatSf6: 1, hwDone: 0, examBest: 0 };
  const r = Object.fromEntries(evaluate(ctx).map((b) => [b.id, b]));
  assert.ok(r.pz1.earned && r.pz100.earned && !r.pz500.earned);
  assert.equal(Math.round(r.pz500.progress * 100), 24);
  assert.ok(r.storm15.earned && !r.storm30.earned);
  assert.ok(r.streak7.earned && !r.streak30.earned);
  assert.ok(r.sf6.earned && !r.maia1900.earned);
  assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length, 'kimlikler benzersiz');
});
