// Exam screen (opened from an assignment on the home page). One attempt; the clock keeps running
// from the start even if the app is closed; answers are saved after every question.
// No right/wrong feedback during the exam; results are shown at the end.
import { Chess } from 'chess.js';
import { h, clear, modal, toast, fmtDate } from '../../core/dom.js';
import { Board, localSan } from '../../core/board.js';
import { store } from '../../core/store.js';
import { examItems, gradeExam, acceptPuzzleMove, examStore, remainingMs, SECTION_NAMES } from '../../core/exam.js';
import { uciToSan, moveNumberLabel } from '../../core/pgn.js';

const fmtLeft = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const san = (fen, uci) => { try { return localSan(uciToSan(fen, uci), store.settings.turkishNotation !== false); } catch { return uci; } };

export async function mountExam(root, { assignment, go }) {
  const exam = assignment.exam;
  const items = examItems(exam);
  let st = await examStore.get(exam.id);
  let timer = null, board = null, destroyed = false;
  const cleanup = () => { destroyed = true; if (timer) clearInterval(timer); if (board) board.destroy(); };

  const counts = {};
  items.forEach((it) => { counts[it.kind] = (counts[it.kind] || 0) + 1; });

  function intro() {
    clear(root).append(h('div.exam-intro',
      h('div.storm-bolt', '📝'), h('h2', exam.title), h('div.muted', `${assignment.title} · ${assignment.teacher || ''}`),
      h('div.cards', h('div.card', h('div.card-k', 'Süre'), h('div.card-v', `${exam.minutes} dk`)),
        Object.entries(counts).map(([k, n]) => h('div.card', h('div.card-k', SECTION_NAMES[k]), h('div.card-v', n), h('div.muted', 'soru')))),
      h('div.panel.exam-rules', h('ul',
        h('li', 'Sınava yalnızca bir kez girebilirsiniz.'),
        h('li', 'Süre başladıktan sonra uygulamayı kapatsanız da işlemeye devam eder.'),
        h('li', 'Her soruda tek hamle hakkınız var; ipucu yok. Sınav sırasında doğru ya da yanlış gösterilmez.'),
        h('li', 'Süre biterse cevaplanmayan sorular yanlış sayılır.'))),
      h('div.btn-row', h('button.btn.big', { onclick: () => go('home') }, 'Vazgeç'),
        h('button.btn.primary.big', { onclick: async () => {
          st = await examStore.put(exam.id, { title: exam.title, assignment: assignment.id, startedAt: Date.now(), answers: {} });
          next();
        } }, 'Sınavı başlat'))));
  }

  // ---------- running ----------
  const clock = h('div.storm-clock');
  const progress = h('div.exam-progress');
  const prompt = h('div.exam-prompt');
  const boardHost = h('div.board-host');
  const note = h('div.exam-note.muted');

  function layout() {
    clear(root).append(h('div.storm-layout',
      h('div.gtm-center', prompt, boardHost),
      h('div.storm-side', clock, progress, note,
        h('button.btn.ghost', { onclick: () => modal({ title: 'Sınavı bitir?', body: h('p', 'Cevaplanmayan sorular yanlış sayılır.'), actions: [{ label: 'Devam et' }, { label: 'Bitir', primary: true, onClick: () => finish() }] }) }, 'Sınavı bitir'))));
    board = new Board(boardHost, { onMove: (m) => onMove && onMove(m) });
    timer = setInterval(() => {
      if (destroyed || !root.isConnected) return cleanup();
      const left = remainingMs(exam, st);
      clock.textContent = fmtLeft(left);
      clock.classList.toggle('low', left < 60000);
      if (left <= 0) finish();
    }, 250);
  }

  let onMove = null;
  async function answer(key, ok) {
    st.answers[key] = !!ok;
    await examStore.put(exam.id, st);
    note.textContent = 'Cevabınız kaydedildi.';
    setTimeout(() => { if (!destroyed) note.textContent = ''; }, 900);
    next();
  }

  function next() {
    if (destroyed) return;
    if (remainingMs(exam, st) <= 0) return finish();
    const i = items.findIndex((it) => !(it.key in st.answers));
    if (i < 0) return finish();
    if (!board) layout();
    const it = items[i];
    window.__examItem = it; // used by automated tests
    clear(progress).append(h('div.storm-label', `Soru ${i + 1} / ${items.length}`), h('div.storm-combo-bar', h('span', { style: { width: `${(100 * i) / items.length}%` } })),
      h('div.muted.small', SECTION_NAMES[it.kind]));
    if (it.kind === 'puzzle') askPuzzle(it);
    else if (it.kind === 'opening') askOpening(it);
    else askGtm(it);
  }

  function askPuzzle(it) {
    const p = it.puzzle;
    const fens = [p.fen];
    const c = new Chess(p.fen);
    for (const u of p.moves) { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); fens.push(c.fen()); }
    const solver = p.firstAuto ? (p.fen.split(' ')[1] === 'w' ? 'b' : 'w') : p.fen.split(' ')[1];
    let step = 0;
    clear(prompt).append(h('b', 'Bulmaca: '), `${solver === 'w' ? 'Beyaz' : 'Siyah'} oynar ve kazanır.`);
    board.setOrientation(solver === 'w' ? 'white' : 'black');
    board.setPosition(p.fen, { animate: false });
    const yourTurn = () => board.setPosition(fens[step], { lastMove: step ? p.moves[step - 1] : undefined, interactive: true, animate: false });
    if (p.firstAuto) setTimeout(() => { if (destroyed) return; board.setPosition(fens[1], { lastMove: p.moves[0] }); step = 1; yourTurn(); }, 500);
    else yourTurn();
    onMove = ({ uci, fenAfter }) => {
      board.setInteractive(false);
      if (!acceptPuzzleMove(p, step, uci, fenAfter)) return answer(it.key, false);
      step++;
      if (step >= p.moves.length) return answer(it.key, true);
      board.setPosition(fenAfter, { lastMove: uci });
      setTimeout(() => { if (destroyed) return; board.setPosition(fens[step + 1], { lastMove: p.moves[step] }); step++; yourTurn(); }, 400);
    };
  }

  function askOpening(it) {
    clear(prompt).append(h('b', 'Açılış: '), `"${it.name}" repertuvarınızda burada hangi hamleyi oynarsınız?`);
    board.setOrientation(it.color === 'w' ? 'white' : 'black');
    board.setPosition(it.q.fen, { interactive: true, animate: false });
    onMove = ({ uci }) => { board.setInteractive(false); answer(it.key, it.q.answers.includes(uci)); };
  }

  function askGtm(it) {
    const g = it.gtm;
    const prev = g.ucis[it.q.ply - 1];
    clear(prompt).append(h('b', 'Hamleyi Tahmin Et: '), `${g.white} – ${g.black}. Ustanın ${moveNumberLabel(it.q.fen)} hamlesini tahmin edin.`);
    board.setOrientation(g.userColor === 'w' ? 'white' : 'black');
    board.setPosition(it.q.fen, { lastMove: prev, interactive: true, animate: false });
    onMove = ({ uci }) => { board.setInteractive(false); answer(it.key, it.q.answers.includes(uci)); };
  }

  let finishing = false;
  async function finish() {
    if (finishing) return;
    finishing = true;
    if (timer) clearInterval(timer);
    if (board) { board.destroy(); board = null; }
    st = st || { answers: {} };
    if (!st.finishedAt) {
      const g = gradeExam(exam, st.answers);
      st.finishedAt = Date.now(); st.score = g.score; st.sections = g.sections;
      await examStore.put(exam.id, st);
    }
    result();
  }

  function result() {
    const g = gradeExam(exam, st.answers);
    const answerText = (it) => {
      if (it.kind === 'puzzle') return san(it.puzzle.firstAuto ? (() => { const c = new Chess(it.puzzle.fen); const u = it.puzzle.moves[0]; c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); return c.fen(); })() : it.puzzle.fen, it.puzzle.moves[it.puzzle.firstAuto ? 1 : 0]);
      return it.q.answers.slice(0, 3).map((u) => san(it.q.fen, u)).join(' / ');
    };
    clear(root).append(h('div.exam-intro',
      h('div.storm-bolt', g.score >= 90 ? '🏆' : g.score >= 60 ? '🎓' : '📝'), h('h2', `${exam.title}: ${g.score} puan`),
      h('div.muted', `Bitiş: ${fmtDate(st.finishedAt)} · süre: ${fmtLeft(Math.min(exam.minutes * 60000, st.finishedAt - st.startedAt))}`),
      h('div.cards', Object.entries(g.sections).map(([k, s]) => h('div.card', h('div.card-k', SECTION_NAMES[k]), h('div.card-v', `${s.ok}/${s.total}`), h('div.muted', `%${Math.round((100 * s.ok) / s.total)}`)))),
      h('div.panel', h('div.panel-title', 'Sorular'),
        h('table.kv.exam-review', items.map((it, i) => h('tr',
          h('td', `${i + 1}.`), h('td', SECTION_NAMES[it.kind]),
          h('td', st.answers[it.key] ? h('span.ok-text', '✓ doğru') : it.key in st.answers ? h('span.bad-text', '✗ yanlış') : h('span.muted', '– boş')),
          h('td.muted', 'Doğru cevap: ', h('b', answerText(it))))))),
      h('button.btn.primary.big', { onclick: () => go('home') }, 'Ana sayfaya dön')));
  }

  if (st && st.finishedAt) result();
  else if (st && st.startedAt) { if (remainingMs(exam, st) <= 0) finish(); else next(); }
  else intro();
  return { unmount: cleanup };
}
