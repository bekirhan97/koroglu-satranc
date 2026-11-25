import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLichessNdjson, findMistakes, SKIP_PLIES } from '../src/renderer/modules/puzzles/mygames.js';

const line = (o) => JSON.stringify(o);
const NDJSON = [
  line({ id: 'g1', variant: 'standard', speed: 'blitz', createdAt: 1, status: 'mate', winner: 'black', players: { white: { user: { name: 'Ayse' }, rating: 1500 }, black: { user: { name: 'Rakip' }, rating: 1520 } }, moves: 'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3#' }),
  line({ id: 'g2', variant: 'chess960', players: { white: { user: { name: 'Ayse' } }, black: { user: { name: 'X' } } }, moves: 'e4 e5' }),
  line({ id: 'g3', variant: 'standard', players: { white: { user: { name: 'Y' } }, black: { user: { name: 'Z' } } }, moves: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6' }),
  'bozuk satır',
].join('\n');

test('Lichess ndjson: yalnızca standart ve öğrencinin oyunları, hamleler UCI', () => {
  const gs = parseLichessNdjson(NDJSON, 'ayse');
  assert.equal(gs.length, 1);
  assert.equal(gs[0].color, 'w');
  assert.equal(gs[0].result, '0-1');
  assert.equal(gs[0].ucis[6], 'f3e5');
  assert.equal(gs[0].ucis.length, 14);
});

test('hata bulma: öğrencinin büyük kaybı bulmaca olur, zaten kayıp pozisyonlar ve ilk hamleler atlanır', () => {
  const game = { color: 'w', ucis: Array.from({ length: 20 }, (_, i) => 'a2a3') };
  const cps = Array(21).fill(0);
  cps[10] = 150; cps[11] = 300;   // white (ply 10) was +1.5, after its move black is +3 → big mistake
  cps[12] = -600; cps[13] = 700;  // white already lost at ply 12 → ignored
  cps[4] = 200; cps[5] = 400;     // inside the first plies → ignored
  const m = findMistakes(game, cps, []);
  assert.deepEqual(m.map((x) => x.ply), [10]);
  assert.ok(m[0].loss > 30);
  assert.ok(SKIP_PLIES > 4);
  assert.deepEqual(findMistakes(game, cps, { 10: { uci: 'a2a3' } }), [], 'motorun en iyisini oynadıysa hata değil');
});
