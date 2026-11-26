// Turnuva maçları: pure helpers (PGN import, name matching, move classification, opponent statistics).
import { Chess } from 'chess.js';
import { splitPgn } from '../../src/renderer/core/pgn.js';

const TR_MAP = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u', é: 'e', á: 'a', ó: 'o', í: 'i', ñ: 'n', ä: 'a', ë: 'e' };
// "Yılmaz, Ayşe" and "Ayşe YILMAZ" → same key ("ayse yilmaz")
export function normName(name) {
  const s = String(name || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr').replace(/̇/g, '')
    .replace(/[çğıöşüâîûéáóíñäë]/g, (c) => TR_MAP[c] || c).replace(/[^a-z0-9 ]+/g, ' ').trim();
  return s.split(/\s+/).filter(Boolean).sort().join(' ');
}
// PGN style "Surname, Name" → "Name Surname"
export function displayName(pgnName) {
  const s = String(pgnName || '').trim().replace(/\s+/g, ' ');
  const m = s.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2]} ${m[1]}` : s;
}
// Which of our students is this PGN name? Exact token match first, then "all tokens of one name inside the other" (2+ tokens).
export function matchStudent(pgnName, students) {
  const key = normName(pgnName);
  if (!key) return null;
  const exact = students.find((s) => normName(s.display_name) === key);
  if (exact) return exact;
  const toks = new Set(key.split(' '));
  const cand = students.filter((s) => {
    const st = normName(s.display_name).split(' ');
    if (st.length < 2 && toks.size < 2) return false;
    const [a, b] = st.length <= toks.size ? [st, toks] : [[...toks], new Set(st)];
    return a.every((t) => b.has(t));
  });
  return cand.length === 1 ? cand[0] : null;
}

const pgnDate = (d) => { const m = String(d || '').match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})$/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
const elo = (v) => { const n = parseInt(v, 10); return n > 0 && n < 3500 ? n : null; };

// Moves of a game as SAN separated by spaces (what we store), and the positions.
export function playMoves(startFen, movesText) {
  const c = startFen ? new Chess(startFen) : new Chess();
  const fens = [c.fen()], sans = [], ucis = [];
  const toks = String(movesText || '').replace(/\{[^}]*\}/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\$\d+/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ').replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, ' ').split(/\s+/).filter(Boolean);
  for (const t of toks) {
    let mv;
    try { mv = c.move(t.replace(/[!?]+$/, ''), { strict: false }); } catch (e) { return { error: `"${t}" hamlesi oynanamadı (${sans.length + 1}. yarım hamle)`, fens, sans, ucis }; }
    sans.push(mv.san); ucis.push(mv.from + mv.to + (mv.promotion || '')); fens.push(c.fen());
  }
  return { fens, sans, ucis };
}

// One multi-game PGN file → rows ready to save (student matched by name when possible).
export function parseTournamentPgn(text, students) {
  const out = [];
  for (const g of splitPgn(text)) {
    const c = new Chess();
    try { c.loadPgn(g, { strict: false }); } catch (e) { out.push({ error: e.message, raw: g.slice(0, 80) }); continue; }
    const H = c.getHeaders();
    const verbose = c.history({ verbose: true });
    if (!verbose.length) continue;
    const ws = matchStudent(H.White, students), bs = matchStudent(H.Black, students);
    const me = ws || bs, color = ws ? 'w' : bs ? 'b' : null;
    out.push({
      white: displayName(H.White), black: displayName(H.Black),
      studentId: me ? me.id : null, color,
      opponentName: color === 'w' ? displayName(H.Black) : color === 'b' ? displayName(H.White) : null,
      opponentRating: color === 'w' ? elo(H.BlackElo) : color === 'b' ? elo(H.WhiteElo) : null,
      studentRating: color === 'w' ? elo(H.WhiteElo) : color === 'b' ? elo(H.BlackElo) : null,
      opponentFide: (color === 'w' ? H.BlackFideId : color === 'b' ? H.WhiteFideId : '') || null,
      tournament: H.Event && H.Event !== '?' ? H.Event.slice(0, 120) : null,
      round: H.Round && H.Round !== '?' && H.Round !== '-' ? String(H.Round).slice(0, 20) : null,
      playedOn: pgnDate(H.Date) || pgnDate(H.EventDate),
      result: ['1-0', '0-1', '1/2-1/2'].includes(H.Result) ? H.Result : '*',
      timeControl: H.TimeControl && H.TimeControl !== '?' ? H.TimeControl.slice(0, 40) : null,
      startFen: H.FEN && H.SetUp !== '0' ? H.FEN : null,
      moves: verbose.map((m) => m.san).join(' '),
      plies: verbose.length,
    });
  }
  return out;
}

// Result from our student's point of view: 1 / 0.5 / 0 (null = unfinished)
export function myScore(game) {
  if (game.result === '1/2-1/2') return 0.5;
  if (game.result === '1-0') return game.color === 'w' ? 1 : 0;
  if (game.result === '0-1') return game.color === 'b' ? 1 : 0;
  return null;
}
export const scoreText = (s) => (s === 1 ? 'Kazandı' : s === 0 ? 'Kaybetti' : s === 0.5 ? 'Berabere' : 'Sonuç yok');

// ---- analysis ----
// evals[i] = engine score of the position BEFORE ply i (and evals[n] after the last move), from White's side, in cp
// (mate = ±(10000 - n)). Lichess-style win% and move classes.
export const winPct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1500, Math.min(1500, cp)))) - 1);
export function classify(evals, startColor = 'w') {
  const moves = [];
  for (let i = 0; i + 1 < evals.length; i++) {
    if (evals[i] == null || evals[i + 1] == null) { moves.push(null); continue; }
    const side = (i % 2 === 0) === (startColor === 'w') ? 'w' : 'b';
    const pov = (cp) => (side === 'w' ? cp : -cp);
    const drop = winPct(pov(evals[i])) - winPct(pov(evals[i + 1]));
    const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, drop)) - 3.1669));
    // a "blunder" needs the position to have been at least not lost before; missing a mate is always serious
    const kind = drop >= 30 ? 'blunder' : drop >= 20 ? 'mistake' : drop >= 10 ? 'inaccuracy' : null;
    moves.push({ side, drop: Math.round(drop * 10) / 10, acc: Math.round(acc), kind });
  }
  const sum = (side) => {
    const ms = moves.filter((m) => m && m.side === side);
    return {
      accuracy: ms.length ? Math.round(ms.reduce((a, m) => a + m.acc, 0) / ms.length) : null,
      blunder: ms.filter((m) => m.kind === 'blunder').length,
      mistake: ms.filter((m) => m.kind === 'mistake').length,
      inaccuracy: ms.filter((m) => m.kind === 'inaccuracy').length,
    };
  };
  return { moves, w: sum('w'), b: sum('b') };
}
export const KIND_MARK = { blunder: '??', mistake: '?', inaccuracy: '?!' };
export const KIND_TR = { blunder: 'Büyük hata', mistake: 'Hata', inaccuracy: 'Belirsiz hamle' };

// ---- opponent database ----
// Openings an opponent played, per colour: [{ eco, name, games, score }] (score = opponent's points), plus first moves.
export function opponentStats(games) {
  const out = { games: games.length, ourScore: 0, scored: 0, w: { openings: [], first: [] }, b: { openings: [], first: [] } };
  const acc = { w: {}, b: {} }, first = { w: {}, b: {} };
  for (const g of games) {
    const s = myScore(g);
    if (s != null) { out.ourScore += s; out.scored++; }
    const oc = g.color === 'w' ? 'b' : 'w'; // the opponent's colour
    const key = (g.eco || '') + '|' + (g.opening || 'Bilinmeyen açılış');
    const a = (acc[oc][key] = acc[oc][key] || { eco: g.eco || '', name: g.opening || 'Bilinmeyen açılış', games: 0, score: 0, scored: 0, ids: [] });
    a.games++; a.ids.push(g.id);
    if (s != null) { a.score += 1 - s; a.scored++; }
    const sans = (g.moves || '').split(' ').filter(Boolean);
    // the opponent's first move (white) or reply to our first move (black)
    const fm = oc === 'w' ? sans[0] && `1.${sans[0]}` : sans[1] && `1.${sans[0]} ${sans[1]}`;
    if (fm) first[oc][fm] = (first[oc][fm] || 0) + 1;
  }
  for (const c of ['w', 'b']) {
    out[c].openings = Object.values(acc[c]).sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, 'tr'));
    out[c].first = Object.entries(first[c]).map(([move, n]) => ({ move, n })).sort((a, b) => b.n - a.n);
  }
  return out;
}
