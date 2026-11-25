import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGame } from '../src/renderer/core/pgn.js';

test('PGN varyantları ana hattın yanında saklanır', () => {
  const g = parseGame(`[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 (1... c5 2. Nf3 {Sicilya}) 2. Nf3 Nc6 (2... d6 3. d4 (3. Bc4) exd4) 3. Bb5 1-0`, 'x');
  assert.deepEqual(Object.keys(g.variations).map(Number), [1, 3]);
  assert.equal(g.variations[1][0].label, '1...c5 2.Nf3');
  assert.equal(g.variations[1][0].comment, 'Sicilya');
  assert.equal(g.variations[3][0].label, '2...d6 3.d4 exd4');
  assert.deepEqual(g.variations[3][0].ucis, ['d7d6', 'd2d4', 'e5d4']);
  assert.equal(g.sans.length, 5);
});
