import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGame } from '../src/renderer/core/pgn.js';
import { parsePgnTree } from '../src/renderer/core/pgntree.js';
import { openingQuestions, gtmQuestions, buildExam, examItems, gradeExam, seeded, acceptPuzzleMove } from '../src/renderer/core/exam.js';

const GAME = `[White "Morphy"]\n[Black "Duke"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O 1-0`;
const REP = `1. e4 e5 2. Nf3 Nc6 (2... Nf6 3. Ng5) (2... d6 3. d4) 3. Bc4 Bc5 4. c3 Nf6 5. d4 *`;

test('açılış soruları: sıra repertuvar tarafında, cevaplar repertuvar hamleleri', () => {
  const rep = { name: 'İtalyan', color: 'w', roots: parsePgnTree(REP).roots };
  const qs = openingQuestions(rep, 10, seeded(7));
  assert.ok(qs.length >= 3);
  for (const q of qs) { assert.equal(q.fen.split(' ')[1], 'w'); assert.ok(q.answers.length >= 1); }
  const afterNf6 = qs.find((q) => q.answers.includes('f3g5'));
  assert.ok(afterNf6, '2...Nf6 sonrası 3.Ng5 sorulabilir');
});

test('tahmin soruları: ilk 5 hamle atlanır, eşdeğer motor hamlesi kabul edilir', () => {
  const g = parseGame(GAME, 'x');
  const analysis = { plies: { 10: { master: { uci: 'f1c4', cp: 120 }, top: [{ uci: 'f1c4', cp: 120 }, { uci: 'b1c3', cp: 110 }, { uci: 'h2h3', cp: -50 }] } } };
  const qs = gtmQuestions(g, analysis);
  assert.equal(qs[0].ply, 10);
  assert.deepEqual(qs[0].answers.sort(), ['b1c3', 'f1c4']);
  assert.ok(qs.every((q) => q.fen.split(' ')[1] === 'w'));
});

test('sınav notu: bölümler eşit ağırlıklı, boş cevap yanlış', () => {
  const g = parseGame(GAME, 'x');
  const exam = buildExam({ title: 'Deneme', minutes: 20,
    puzzles: [{ id: 'a', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', moves: ['a1a8'], firstAuto: false }, { id: 'b', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', moves: ['a1a8'], firstAuto: false }],
    opening: { rep: { name: 'İtalyan', color: 'w', roots: parsePgnTree(REP).roots }, count: 2 },
    gtm: { game: g, analysis: {} } }, seeded(3));
  const items = examItems(exam);
  assert.deepEqual([...new Set(items.map((i) => i.kind))], ['puzzle', 'opening', 'gtm']);
  const answers = { p0: true, p1: false, o0: true, o1: true };
  const r = gradeExam(exam, answers);
  assert.deepEqual(r.sections.puzzle, { ok: 1, total: 2 });
  assert.equal(r.sections.gtm.ok, 0);
  assert.equal(r.score, Math.round(100 * (0.5 + 1 + 0) / 3));
  assert.ok(acceptPuzzleMove(exam.sections.puzzles[0], 0, 'a1a8', '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'));
});
