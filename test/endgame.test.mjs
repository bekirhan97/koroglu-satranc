import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { LESSONS, CHAPTERS } from '../src/renderer/modules/endgame/curriculum.js';
import { norm, flip, probe, stars, pieceCount } from '../src/renderer/modules/endgame/judge.js';

test('Oyunsonu müfredatı: geçerli konumlar, en çok 7 taş, tekil kimlikler', () => {
  const ids = new Set();
  for (const l of LESSONS) {
    assert.ok(!ids.has(l.id), 'tekrar: ' + l.id); ids.add(l.id);
    assert.ok(CHAPTERS.some(([c]) => c === l.ch), l.id);
    assert.ok(['mate', 'win', 'draw'].includes(l.goal), l.id);
    const c = new Chess(l.fen); // throws if invalid
    assert.ok(!c.isGameOver(), l.id + ' oyun bitmiş');
    assert.ok(pieceCount(l.fen) <= 7, l.id + ' 7 taştan fazla');
    assert.ok(l.text && l.text.length > 20, l.id + ' açıklama');
  }
  assert.ok(LESSONS.length >= 45);
});

test('Tablebase yorumu ve yıldızlar', async () => {
  assert.equal(norm('syzygy-win'), 'win'); assert.equal(norm('cursed-win'), 'draw'); assert.equal(norm('maybe-loss'), 'loss');
  assert.equal(flip('win'), 'loss');
  const fen = '8/8/8/4k3/8/8/8/3QK3 w - - 0 1';
  const fake = async () => ({ ok: true, json: async () => ({ category: 'win', dtm: 19, moves: [{ uci: 'd1d4', san: 'Qd4+', category: 'loss' }, { uci: 'd1d2', san: 'Qd2', category: 'draw' }] }) });
  const p = await probe(fen, { fetchFn: fake });
  assert.equal(p.result, 'win'); assert.equal(p.dtm, 10); assert.equal(p.best[0].result, 'win'); assert.equal(p.best[1].result, 'draw');
  assert.equal(stars({ mistakes: 0, hints: 0, moves: 10, par: 15 }), 3);
  assert.equal(stars({ mistakes: 0, hints: 0, moves: 20, par: 15 }), 2);
  assert.equal(stars({ mistakes: 2, hints: 1, moves: 9, par: null }), 1);
});
