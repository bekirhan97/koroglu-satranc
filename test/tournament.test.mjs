import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normName, displayName, matchStudent, parseTournamentPgn, playMoves, myScore, classify, opponentStats, winPct } from '../web/src/tournament-core.js';

const students = [{ id: 's1', display_name: 'Ayşe Yılmaz' }, { id: 's2', display_name: 'Kerem İlter Ören' }, { id: 's3', display_name: 'Can Öz' }];

test('İsim eşleştirme: PGN "Soyad, Ad", büyük harf, Türkçe harf', () => {
  assert.equal(normName('Yılmaz, Ayşe'), normName('AYŞE YILMAZ'));
  assert.equal(displayName('Yilmaz, Ayse'), 'Ayse Yilmaz');
  assert.equal(matchStudent('Yilmaz, Ayse', students).id, 's1');
  assert.equal(matchStudent('Oren, Kerem', students).id, 's2'); // two of three names
  assert.equal(matchStudent('Demir, Ali', students), null);
});

test('Turnuva PGN dosyası: öğrenci, renk, rakip, puanlar', () => {
  const pgn = `[Event "İzmir Yıldızlar 2026"]
[Round "3"]
[Date "2026.11.21"]
[White "Demir, Ali"]
[Black "Yilmaz, Ayse"]
[WhiteElo "1450"]
[BlackElo "1390"]
[WhiteFideId "34567890"]
[Result "0-1"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 0-1

[Event "Başka"]
[White "X, Y"]
[Black "Z, Q"]
[Result "1-0"]

1. d4 d5 1-0
`;
  const r = parseTournamentPgn(pgn, students);
  assert.equal(r.length, 2);
  assert.equal(r[0].studentId, 's1'); assert.equal(r[0].color, 'b');
  assert.equal(r[0].opponentName, 'Ali Demir'); assert.equal(r[0].opponentRating, 1450); assert.equal(r[0].studentRating, 1390);
  assert.equal(r[0].opponentFide, '34567890'); assert.equal(r[0].round, '3'); assert.equal(r[0].playedOn, '2026-11-21');
  assert.equal(r[0].moves, 'e4 c5 Nf3 d6 d4 cxd4');
  assert.equal(myScore({ result: r[0].result, color: r[0].color }), 1);
  assert.equal(r[1].studentId, null);
});

test('Hamle metni: numaralı/numarasız, ünlemler, yorumlar', () => {
  const p = playMoves(null, '1.e4 e5 2.Nf3!? {yorum} Nc6 3.Bb5 a6?! 1/2-1/2');
  assert.deepEqual(p.sans, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  assert.equal(p.fens.length, 7);
  assert.ok(playMoves(null, '1.e4 e5 2.Ke3').error);
});

test('Hata sınıflandırması ve isabet', () => {
  // white blunders on ply 2 (0 → -600), black inaccurate on ply 3
  const c = classify([20, 20, 30, -600, -400]);
  assert.equal(c.moves[2].kind, 'blunder'); assert.equal(c.moves[2].side, 'w');
  assert.equal(c.moves[0].kind, null);
  assert.equal(c.w.blunder, 1);
  assert.ok(c.w.accuracy < c.b.accuracy);
  assert.ok(winPct(0) === 50 && winPct(10000) > 99);
});

test('Rakip istatistiği: renk renk açılışlar ve ilk hamleler', () => {
  const games = [
    { id: 'g1', color: 'b', result: '1-0', eco: 'B90', opening: 'Sicilian Defense: Najdorf', moves: 'e4 c5 Nf3' },
    { id: 'g2', color: 'b', result: '1/2-1/2', eco: 'B90', opening: 'Sicilian Defense: Najdorf', moves: 'e4 c5 Nf3' },
    { id: 'g3', color: 'w', result: '1-0', eco: 'D06', opening: "Queen's Gambit", moves: 'd4 d5 c4' },
  ];
  const s = opponentStats(games);
  assert.equal(s.games, 3); assert.equal(s.ourScore, 1.5);
  assert.equal(s.w.openings[0].games, 2); assert.equal(s.w.openings[0].score, 1.5); // opponent had white in g1, g2
  assert.equal(s.w.first[0].move, '1.e4');
  assert.equal(s.b.first[0].move, '1.d4 d5');
});

test('Hazırlık çizgileri: ilk hatamızdan önce kesilir, yerine motorun hamlesi', async () => {
  const { prepLines, pgnLine } = await import('../web/src/tournament-core.js');
  // we are black; at ply 3 (our 2nd move) we blunder; engine preferred Nc6 (b8c6)
  const g = { color: 'b', moves: 'e4 e5 Nf3 f6 Nxe5 fxe5', analysis: { evals: [20, 30, 30, 30, 500, 500, 500], best: [null, null, null, 'b8c6', null, null] } };
  const ls = prepLines([g], 'w');
  assert.equal(ls.length, 1);
  assert.deepEqual(ls[0].sans, ['e4', 'e5', 'Nf3', 'Nc6']); assert.equal(ls[0].fixed, true);
  assert.equal(pgnLine(ls[0].sans), '1.e4 e5 2.Nf3 Nc6');
  assert.equal(prepLines([g], 'b').length, 0); // opponent never had black against us
});
