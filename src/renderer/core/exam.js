// Exams inside assignment packages. The teacher's app turns the chosen material into fixed questions
// with their accepted answers, so every student gets the same exam and no engine is needed to grade it.
//   exam = { id, title, minutes, sections: { puzzles: [...], openings: [...], gtm: { game, questions } } }
// Student state in exams.json: { [examId]: { title, assignment, startedAt, answers: { key: bool }, finishedAt, score, sections } }
import { Chess } from 'chess.js';
import { gameFens, sideToMove } from './pgn.js';
import { unpackTree } from './pgntree.js';
import { winPct } from '../modules/gtm/scoring.js';

const api = window.api;
export const GTM_SKIP_PLIES = 10;   // the first 5 moves are opening theory, not asked
export const GTM_MAX_QUESTIONS = 25;
export const EQUIV_LOSS = 1.5;      // win-% points: an engine move this close to the master's also counts

// Seeded random so the teacher's choice is reproducible in tests.
export function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

// Opening questions: positions where the repertoire side is to move, answers = repertoire moves there.
export function openingQuestions(rep, count, random = Math.random) {
  const roots = rep.roots.map((r) => (r.packed ? unpackTree(r.packed, r.fen) : r));
  const byFen = new Map();
  const walk = (n, depth) => {
    if (sideToMove(n.fen) === rep.color && n.children.length && depth > 0) {
      const key = n.fen.split(' ').slice(0, 4).join(' ');
      const q = byFen.get(key) || { fen: n.fen, answers: new Set(), depth };
      n.children.forEach((c) => q.answers.add(c.uci));
      byFen.set(key, q);
    }
    n.children.forEach((c) => walk(c, depth + 1));
  };
  roots.forEach((r) => walk(r, rep.color === 'w' ? 1 : 0));
  // prefer deeper positions (the start position is too easy), then sample
  const all = [...byFen.values()].filter((q) => q.depth >= 2 || byFen.size < count * 2);
  const out = [];
  while (out.length < count && all.length) out.push(all.splice(Math.floor(random() * all.length), 1)[0]);
  return out.map((q) => ({ fen: q.fen, answers: [...q.answers] }));
}

// GTM questions from the teacher's analysis: the master's move, plus engine moves that lose at most EQUIV_LOSS.
export function gtmQuestions(game, analysis) {
  const fens = gameFens(game);
  const qs = [];
  for (let p = GTM_SKIP_PLIES; p < game.ucis.length && qs.length < GTM_MAX_QUESTIONS; p++) {
    if (sideToMove(fens[p]) !== game.userColor) continue;
    const a = analysis && analysis.plies && analysis.plies[p];
    const answers = new Set([game.ucis[p]]);
    if (a && a.master && a.top) for (const t of a.top) if (winPct(a.master.cp) - winPct(t.cp) <= EQUIV_LOSS) answers.add(t.uci);
    qs.push({ ply: p, fen: fens[p], answers: [...answers] });
  }
  return qs;
}

export function buildExam({ title, minutes, puzzles = [], opening = null, gtm = null }, random = Math.random) {
  const sections = {};
  if (puzzles.length) sections.puzzles = puzzles.map((p) => ({ id: p.id, fen: p.fen, moves: p.moves, rating: p.rating || null, themes: p.themes || [], firstAuto: p.firstAuto !== false }));
  if (opening && opening.rep && opening.count > 0) {
    const qs = openingQuestions(opening.rep, opening.count, random);
    if (qs.length) sections.openings = { name: opening.rep.name, color: opening.rep.color, questions: qs };
  }
  if (gtm && gtm.game) {
    const qs = gtmQuestions(gtm.game, gtm.analysis);
    if (qs.length) sections.gtm = { white: gtm.game.headers.White, black: gtm.game.headers.Black, userColor: gtm.game.userColor, startFen: gtm.game.startFen, ucis: gtm.game.ucis, questions: qs };
  }
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: title || 'Sınav', minutes: Math.max(5, Math.min(180, +minutes || 30)), sections };
}

// Flat list of questions in exam order, each with a stable key.
export function examItems(exam) {
  const s = exam.sections || {};
  const items = [];
  (s.puzzles || []).forEach((p, i) => items.push({ key: `p${i}`, kind: 'puzzle', puzzle: p }));
  ((s.openings && s.openings.questions) || []).forEach((q, i) => items.push({ key: `o${i}`, kind: 'opening', q, color: s.openings.color, name: s.openings.name }));
  ((s.gtm && s.gtm.questions) || []).forEach((q, i) => items.push({ key: `g${i}`, kind: 'gtm', q, gtm: s.gtm }));
  return items;
}

export const SECTION_NAMES = { puzzle: 'Bulmacalar', opening: 'Açılış', gtm: 'Hamleyi Tahmin Et' };

// Score: every section counts equally (0–100); unanswered questions are wrong.
export function gradeExam(exam, answers) {
  const items = examItems(exam);
  const sections = {};
  for (const it of items) {
    const s = (sections[it.kind] = sections[it.kind] || { ok: 0, total: 0 });
    s.total++;
    if (answers[it.key]) s.ok++;
  }
  const parts = Object.values(sections).filter((s) => s.total);
  const score = parts.length ? Math.round((100 * parts.reduce((a, s) => a + s.ok / s.total, 0)) / parts.length) : 0;
  return { score, sections };
}

// Is a move an accepted answer? (Final puzzle move: any mate counts, as in training.)
export function acceptPuzzleMove(puzzle, step, uci, fenAfter) {
  if (uci === puzzle.moves[step]) return true;
  return step === puzzle.moves.length - 1 && new Chess(fenAfter).isCheckmate();
}

export const examStore = {
  async all() { return api.read('exams', {}); },
  async get(id) { return (await this.all())[id] || null; },
  async put(id, st) { const all = await this.all(); all[id] = st; await api.write('exams', all); return st; },
};

export function remainingMs(exam, st, now = Date.now()) {
  if (!st || !st.startedAt) return exam.minutes * 60000;
  return Math.max(0, exam.minutes * 60000 - (now - st.startedAt));
}
