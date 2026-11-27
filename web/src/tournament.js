// "Turnuva Maçları": students' over-the-board tournament games (entered by the student or a coach), Stockfish
// analysis + coach comments, and an opponent database (which openings each opponent plays) for preparation.
import { Chess } from 'chess.js';
import { supa } from './supa.js';
import { h, clear, modal, toast } from '../../src/renderer/core/dom.js';
import { Board, localSan } from '../../src/renderer/core/board.js';
import { loadOpenings, openingName } from '../../src/renderer/core/openings.js';
import { academyStudents, meta } from './coach.js';
import { mine } from '../../src/renderer/modules/puzzles/mygames.js';
import { odata } from '../../src/renderer/modules/openings/data.js';
import { parsePgnTree } from '../../src/renderer/core/pgntree.js';
import { prepLines, pgnLine, normName, displayName, parseTournamentPgn, playMoves, myScore, scoreText, classify, opponentStats, winPct, KIND_MARK, KIND_TR } from './tournament-core.js';

const api = window.api;
const RESULTS = [['1', 'Kazandı'], ['0.5', 'Berabere'], ['0', 'Kaybetti'], ['', 'Sonuç yok']];
const toResult = (score, color) => (score === '' ? '*' : score === '0.5' ? '1/2-1/2' : (score === '1') === (color === 'w') ? '1-0' : '0-1');
const fmtDay = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
function field(label, input, hint) { return h('label.form-row', h('span.form-l', label), input, hint ? h('span.muted.small', hint) : null); }
const seg = (items, value, onPick) => {
  const el = h('div.seg', items.map(([v, l]) => h('button' + (v === value ? '.active' : ''), { type: 'button', onclick: (e) => { [...el.children].forEach((b) => b.classList.remove('active')); e.target.classList.add('active'); onPick(v); } }, l)));
  return el;
};

// ---------- data ----------
const store = {
  games: [], opponents: [], loaded: false,
  async load(force) {
    if (this.loaded && !force) return;
    const [g, o] = await Promise.all([
      supa.from('tournament_games').select('*').order('played_on', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(1000),
      supa.from('opponents').select('*').order('name'),
    ]);
    if (g.error) throw g.error; if (o.error) throw o.error;
    this.games = g.data; this.opponents = o.data; this.loaded = true;
  },
  opp(id) { return this.opponents.find((o) => o.id === id) || null; },
};

// Find or create the opponent by name (same name = same person; spelling variants can be merged by a coach).
async function ensureOpponent(me, { name, rating, fide, club }) {
  const n = displayName(name).trim();
  const key = normName(n);
  if (key.length < 2) throw new Error('Rakibin adını yazın');
  let o = store.opponents.find((x) => x.norm_name === key);
  if (!o) {
    const { data, error } = await supa.from('opponents').insert({ academy_id: me.coach_id || me.id, name: n, norm_name: key, rating: rating || null, fide_id: fide || null, club: club || null, created_by: me.id }).select('*').single();
    if (error) {
      // created meanwhile by someone else
      const { data: again } = await supa.from('opponents').select('*').eq('norm_name', key).maybeSingle();
      if (!again) throw error;
      o = again;
    } else o = data;
    store.opponents.push(o);
  } else if ((rating && rating !== o.rating) || (fide && !o.fide_id) || (club && !o.club)) {
    const patch = { ...(rating ? { rating } : {}), ...(fide && !o.fide_id ? { fide_id: fide } : {}), ...(club && !o.club ? { club } : {}) };
    const { error } = await supa.from('opponents').update(patch).eq('id', o.id);
    if (!error) Object.assign(o, patch);
  }
  return o;
}

async function openingOf(startFen, sans) {
  try {
    await loadOpenings();
    const p = playMoves(startFen, sans.join(' '));
    return openingName(p.fens) || {};
  } catch (e) { return {}; }
}

async function saveGame(me, row, existingId) {
  const p = playMoves(row.start_fen, row.moves);
  if (p.error) throw new Error(p.error);
  const op = await openingOf(row.start_fen, p.sans);
  const full = { ...row, moves: p.sans.join(' '), eco: op.eco || null, opening: op.name || null, updated_at: new Date().toISOString() };
  if (existingId) {
    const old = store.games.find((g) => g.id === existingId);
    if (old && old.moves !== full.moves) full.analysis = null; // moves changed → old analysis is wrong
    const { data, error } = await supa.from('tournament_games').update(full).eq('id', existingId).select('*').single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supa.from('tournament_games').insert({ ...full, academy_id: me.coach_id || me.id, created_by: me.id }).select('*').single();
  if (error) throw error;
  return data;
}

// ---------- analysis (in the browser, Stockfish) ----------
function whiteCp(line, fen) {
  const stm = fen.split(' ')[1];
  const cp = line.mate != null ? (line.mate > 0 ? 10000 - line.mate : -10000 - line.mate) : line.cp;
  return stm === 'w' ? cp : -cp;
}
async function analyseGame(game, onProgress) {
  const p = playMoves(game.start_fen, game.moves);
  const evals = [], best = [];
  for (let i = 0; i < p.fens.length; i++) {
    const c = new Chess(p.fens[i]);
    if (c.isCheckmate()) { evals.push(c.turn() === 'w' ? -10000 : 10000); best.push(null); continue; }
    if (c.isStalemate() || c.isInsufficientMaterial()) { evals.push(0); best.push(null); continue; }
    const r = await api.analyse({ fen: p.fens[i], depth: 13, movetime: 450, tag: 'tg' }, 1);
    if (!r || r.error || !r.lines || !r.lines[0]) throw new Error((r && r.error) || 'Motor yanıt vermedi');
    evals.push(whiteCp(r.lines[0], p.fens[i])); best.push(r.lines[0].uci);
    onProgress && onProgress(i + 1, p.fens.length);
  }
  return { evals, best, depth: 13, at: new Date().toISOString() };
}

// ---------- my mistakes → personal puzzles (Bulmacalar → Oyunlarım) ----------
// Only the student's own device can write them (their own data). Returns how many are in the puzzle list.
export async function mistakesToPuzzles(g, opponentName) {
  if (!g.analysis || !g.analysis.evals) return 0;
  const p = playMoves(g.start_fen, g.moves);
  const startColor = p.fens[0].split(' ')[1];
  const cls = classify(g.analysis.evals, startColor);
  const d = await mine.load();
  d.games = d.games || {}; d.puzzles = d.puzzles || {};
  let n = 0;
  cls.moves.forEach((m, i) => {
    if (!m || m.side !== g.color || !(m.kind === 'blunder' || m.kind === 'mistake') || i < 6) return;
    const best = g.analysis.best[i];
    if (!best || best === p.ucis[i]) return;
    const ev = g.analysis.evals[i];
    const stmCp = startColor === 'w' ? (i % 2 === 0 ? ev : -ev) : (i % 2 === 0 ? -ev : ev);
    if (winPct(stmCp) < 35) return; // already lost: not a useful puzzle
    const id = `tg-${g.id}-${i}`;
    if (!d.puzzles[id]) {
      d.puzzles[id] = { id, gameId: 'tg-' + g.id, ply: i, fen: p.fens[i], played: p.ucis[i], lastMove: p.ucis[i - 1], best, pv: [best], bestCp: stmCp,
        loss: Math.round(m.drop), kind: m.kind === 'blunder' ? 'Büyük hata' : 'Hata', color: g.color, opponent: `${opponentName} (turnuva)`,
        date: g.played_on ? Date.parse(g.played_on + 'T12:00:00') : Date.now(), status: null };
    }
    n++;
  });
  d.games['tg-' + g.id] = { id: 'tg-' + g.id, white: g.color === 'w' ? 'Ben' : opponentName, black: g.color === 'b' ? 'Ben' : opponentName, color: g.color,
    createdAt: g.played_on ? Date.parse(g.played_on) : Date.now(), result: g.result, speed: 'turnuva', mistakes: n };
  await mine.save();
  return n;
}

// ---------- views ----------
export default {
  id: 'turnuva',
  title: 'Turnuva Maçları',
  icon: '♜',
  description: 'Turnuvada oynanan maçlar: analiz, hoca yorumları ve rakiplerin açılış veritabanı.',
  ready: true,
  async mount(root, opts = {}) {
    const me = window.__me || {};
    const isCoach = me.role === 'coach';
    const body = h('div.module-body');
    const tabs = h('div.tabs');
    const head = h('div.module-head', h('h2', this.title), tabs);
    clear(root).append(h('div.module.tg', head, body));
    let board = null;
    const stopBoard = () => { if (board) { board.destroy(); board = null; } };
    const setTabs = (active) => clear(tabs).append(...[['games', 'Maçlar'], ['opps', 'Rakipler']].map(([k, l]) =>
      h('button.tab' + (k === active ? '.active' : ''), { onclick: () => (k === 'games' ? showGames() : showOpponents()) }, l)));
    const loading = () => clear(body).append(h('div.empty', 'Yükleniyor…'));
    let students = [];
    const studentName = (id) => (id === me.id ? me.display_name : (meta.students[id] && meta.students[id].display_name) || 'Takım arkadaşın');
    const filt = { student: isCoach ? '' : me.id, q: '' };

    async function ensureData(force) {
      await store.load(force);
      if (isCoach && !students.length) students = await academyStudents().catch(() => Object.values(meta.students));
    }

    // ----- games list -----
    async function showGames() {
      stopBoard(); setTabs('games'); loading();
      try { await ensureData(true); } catch (e) { clear(body).append(h('div.empty', 'Maçlar alınamadı: ' + e.message)); return; }
      const list = h('div');
      const draw = () => {
        const q = normName(filt.q);
        const gs = store.games.filter((g) => (!filt.student || g.student_id === filt.student)
          && (!q || normName([studentName(g.student_id), (store.opp(g.opponent_id) || {}).name, g.tournament, g.opening].join(' ')).includes(q) || q.split(' ').every((t) => normName([studentName(g.student_id), (store.opp(g.opponent_id) || {}).name, g.tournament, g.opening].join(' ')).split(' ').some((w) => w.startsWith(t)))));
        if (!gs.length) { clear(list).append(h('div.empty', store.games.length ? 'Bu seçimde maç yok.' : 'Henüz maç girilmedi. "+ Maç ekle" ile ilk turnuva maçını gir.')); return; }
        const tot = gs.reduce((a, g) => { const s = myScore(g); if (s != null) { a.p += s; a.n++; } return a; }, { p: 0, n: 0 });
        clear(list).append(
          h('div.muted.small.tg-sum', `${gs.length} maç · ${tot.n ? `${tot.p}/${tot.n} puan` : ''}`),
          h('div.tg-list', gs.map((g) => {
            const o = store.opp(g.opponent_id); const s = myScore(g);
            const an = g.analysis && g.analysis.evals ? classify(g.analysis.evals, (g.start_fen || 'x w').split(' ')[1] === 'b' ? 'b' : 'w')[g.color] : null;
            return h('button.tg-row', { onclick: () => showGame(g.id) },
              h('span.tg-res.r' + String(s).replace('.', '')),
              h('div.tg-main',
                h('div.tg-title', h('span.tg-color.' + g.color), isCoach || filt.student !== me.id ? h('b', studentName(g.student_id) + ' ') : null, '– ', o ? o.name : 'Rakip', g.opponent_rating ? h('span.muted', ` (${g.opponent_rating})`) : null),
                h('div.muted.small', [g.tournament, g.round ? `${g.round}. tur` : null, fmtDay(g.played_on)].filter(Boolean).join(' · '))),
              h('div.tg-side', h('div.tg-score', scoreText(s)), h('div.muted.small', g.opening ? (g.eco ? g.eco + ' ' : '') + g.opening.split(':')[0] : ''),
                an ? h('div.small', `İsabet %${an.accuracy}`, an.blunder ? h('span.bad-text', ` · ${an.blunder}??`) : null) : h('div.muted.small', 'Analiz yok')));
          })));
      };
      const stSel = isCoach
        ? h('select.filter-sel', { onchange: (e) => { filt.student = e.target.value; draw(); } }, h('option', { value: '' }, 'Bütün öğrenciler'), students.map((s) => h('option', { value: s.id, selected: s.id === filt.student }, s.display_name)))
        : h('select.filter-sel', { onchange: (e) => { filt.student = e.target.value; draw(); } }, h('option', { value: me.id, selected: filt.student === me.id }, 'Benim maçlarım'), h('option', { value: '', selected: !filt.student }, 'Akademinin bütün maçları'));
      const search = h('input.search', { placeholder: 'Ara: rakip, turnuva, açılış…', value: filt.q, oninput: (e) => { filt.q = e.target.value; draw(); } });
      clear(body).append(
        h('div.tg-toolbar', stSel, search,
          h('button.btn.primary', { onclick: () => gameDialog(null) }, '+ Maç ekle'),
          h('button.btn', { onclick: importDialog }, '⇪ PGN dosyası')),
        list);
      draw();
    }

    // ----- add / edit -----
    function gameDialog(g) {
      const o = g ? store.opp(g.opponent_id) : null;
      let color = g ? g.color : 'w';
      let score = g ? (myScore(g) == null ? '' : String(myScore(g))) : '1';
      const stSel = isCoach ? h('select', students.map((s) => h('option', { value: s.id, selected: g ? g.student_id === s.id : false }, s.display_name))) : null;
      const oppName = h('input', { value: o ? o.name : '', placeholder: 'Rakibin adı soyadı', list: 'tg-opps', autocomplete: 'off' });
      const dl = h('datalist#tg-opps', store.opponents.map((x) => h('option', { value: x.name }, x.club || '')));
      const oppRating = h('input', { type: 'number', min: 0, max: 3500, value: g && g.opponent_rating ? g.opponent_rating : '', placeholder: 'Örn. 1450' });
      const myRating = h('input', { type: 'number', min: 0, max: 3500, value: g && g.student_rating ? g.student_rating : '', placeholder: 'Örn. 1400' });
      const fide = h('input', { value: o && o.fide_id ? o.fide_id : '', placeholder: 'FIDE ID (varsa)', inputmode: 'numeric' });
      const club = h('input', { value: o && o.club ? o.club : '', placeholder: 'Kulübü (varsa)' });
      oppName.addEventListener('change', () => { const x = store.opponents.find((y) => y.norm_name === normName(oppName.value)); if (x) { if (!oppRating.value && x.rating) oppRating.value = x.rating; if (!fide.value && x.fide_id) fide.value = x.fide_id; if (!club.value && x.club) club.value = x.club; } });
      const tour = h('input', { value: g ? g.tournament || '' : (store.games[0] && store.games[0].tournament) || '', placeholder: 'Örn. İzmir Küçükler Şampiyonası 2026', list: 'tg-tours' });
      const tdl = h('datalist#tg-tours', [...new Set(store.games.map((x) => x.tournament).filter(Boolean))].map((t) => h('option', { value: t })));
      const round = h('input', { value: g ? g.round || '' : '', placeholder: 'Örn. 3', style: { maxWidth: '90px' } });
      const date = h('input', { type: 'date', value: g ? g.played_on || '' : new Date().toISOString().slice(0, 10) });
      const tc = h('input', { value: g ? g.time_control || '' : '', placeholder: 'Örn. 60+30' });
      const moves = h('textarea.paste', { rows: 5, placeholder: 'Hamleler: PGN yapıştırın ya da yazın (1.e4 e5 2.Nf3 …). İngilizce harflerle: N=At, B=Fil, R=Kale, Q=Vezir, K=Şah. Ya da "Tahtada gir".' }, g ? numbered(g.moves, g.start_fen) : '');
      const err = h('div.bad-text.small');
      modal({ title: g ? 'Maçı düzenle' : 'Turnuva maçı ekle', wide: true,
        body: h('div.form-col', dl, tdl,
          stSel ? field('Öğrenci', stSel) : null,
          h('div.form-grid', field('Renk', seg([['w', '♔ Beyaz'], ['b', '♚ Siyah']], color, (v) => { color = v; })), field('Sonuç', seg(RESULTS, score, (v) => { score = v; })), field('Kendi puanı (ELO/UKD)', myRating)),
          h('div.form-grid', field('Rakip', oppName), field('Rakibin puanı', oppRating), field('FIDE ID', fide), field('Kulübü', club)),
          h('div.form-grid', field('Turnuva', tour), field('Tur', round), field('Tarih', date), field('Süre', tc)),
          field('Hamleler', moves), h('div.btn-row', h('button.btn.small', { type: 'button', onclick: () => boardEntry(moves.value, (txt) => { moves.value = txt; }) }, '♟ Tahtada gir')), err),
        actions: [{ label: 'Vazgeç' }, { label: g ? 'Kaydet' : 'Maçı kaydet', primary: true, onClick: () => {
          err.textContent = '';
          const pm = playMoves(g ? g.start_fen : null, moves.value);
          if (pm.error) { err.textContent = pm.error; return false; }
          if (!oppName.value.trim()) { err.textContent = 'Rakibin adını yazın.'; return false; }
          (async () => {
            try {
              const op = await ensureOpponent(me, { name: oppName.value, rating: +oppRating.value || null, fide: fide.value.trim() || null, club: club.value.trim() || null });
              const row = { student_id: isCoach ? stSel.value : me.id, color, opponent_id: op.id, opponent_rating: +oppRating.value || null, student_rating: +myRating.value || null,
                tournament: tour.value.trim() || null, round: round.value.trim() || null, played_on: date.value || null, result: toResult(score, color), time_control: tc.value.trim() || null,
                start_fen: g ? g.start_fen : null, moves: pm.sans.join(' ') };
              const saved = await saveGame(me, row, g && g.id);
              toast('Kaydedildi', 'ok');
              await store.load(true);
              showGame(saved.id);
            } catch (e) { toast('Kaydedilemedi: ' + e.message, 'error'); }
          })();
        } }] });
      setTimeout(() => oppName.focus(), 60);
    }

    function numbered(sans, startFen) {
      const black = startFen && startFen.split(' ')[1] === 'b';
      let n = startFen ? +startFen.split(' ')[5] || 1 : 1;
      const out = [];
      (sans || '').split(' ').filter(Boolean).forEach((s, i) => {
        const white = (i % 2 === 0) !== black;
        if (white) out.push(`${n}.${s}`); else { out.push(i === 0 ? `${n}...${s}` : s); n++; }
      });
      return out.join(' ');
    }

    // Play the moves on a board (both sides); "Geri al" removes the last move.
    function boardEntry(text, done) {
      const host = h('div.tg-entry-board');
      const listEl = h('div.tg-entry-moves.small');
      let p = playMoves(null, text);
      if (p.error) p = playMoves(null, '');
      const sans = [...p.sans];
      let b;
      const redraw = () => {
        const q = playMoves(null, sans.join(' '));
        b.setPosition(q.fens[q.fens.length - 1], { lastMove: q.ucis[q.ucis.length - 1], interactive: true });
        listEl.textContent = numbered(sans.join(' '), null) || 'Beyazın ilk hamlesini oynayın.';
      };
      modal({ title: 'Hamleleri tahtada gir', wide: true, body: h('div.tg-entry', host, h('div', listEl, h('div.btn-row', h('button.btn.small', { type: 'button', onclick: () => { sans.pop(); redraw(); } }, '↶ Geri al'), h('button.btn.small', { type: 'button', onclick: () => b.flip() }, '⇅ Çevir')))),
        actions: [{ label: 'Vazgeç' }, { label: 'Bitti', primary: true, onClick: () => done(numbered(sans.join(' '), null)) }] });
      b = new Board(host, { onMove: (m) => { sans.push(m.san); redraw(); } });
      redraw();
    }

    function importDialog() {
      const ta = h('textarea.paste', { rows: 8, placeholder: 'Turnuvanın PGN dosyasını seçin ya da yapıştırın (chess-results, turnuva hakemi, Lichess…). Bütün maçlar arasından öğrencilerimizin maçları adlarından bulunur.' });
      const file = h('input', { type: 'file', accept: '.pgn,text/plain', onchange: async (e) => { const f = e.target.files[0]; if (f) ta.value = await f.text(); } });
      const out = h('div');
      let rows = [];
      const pool = isCoach ? students : [{ id: me.id, display_name: me.display_name }];
      modal({ title: 'PGN dosyasından maç ekle', wide: true,
        body: h('div.form-col', file, ta, h('div.btn-row', h('button.btn', { type: 'button', onclick: () => {
          rows = parseTournamentPgn(ta.value, pool).filter((r) => !r.error);
          const mine = rows.filter((r) => r.studentId);
          clear(out).append(!rows.length ? h('div.bad-text', 'PGN içinde maç bulunamadı.') : h('div',
            h('div.muted.small', `${rows.length} maç bulundu · ${mine.length} tanesi öğrencimizin. İşaretli olanlar eklenecek.`),
            h('table.tg-tbl.small', h('tbody', rows.map((r, i) => h('tr',
              h('td', h('input', { type: 'checkbox', checked: !!r.studentId, disabled: !r.studentId, onchange: (e) => { r.skip = !e.target.checked; } })),
              h('td', r.white, ' – ', r.black), h('td', r.result), h('td.muted', r.round ? `${r.round}. tur` : ''),
              h('td', r.studentId ? h('span.ok-text', `${(pool.find((s) => s.id === r.studentId) || {}).display_name} (${r.color === 'w' ? 'beyaz' : 'siyah'})`) : h('span.muted', 'öğrencimiz değil'))))))));
        } }, 'Maçları bul')), out),
        actions: [{ label: 'Vazgeç' }, { label: 'Seçilenleri ekle', primary: true, onClick: () => {
          const pick = rows.filter((r) => r.studentId && !r.skip);
          if (!pick.length) { toast('Eklenecek maç yok', 'error'); return false; }
          (async () => {
            let n = 0;
            for (const r of pick) {
              try {
                const op = await ensureOpponent(me, { name: r.opponentName, rating: r.opponentRating, fide: r.opponentFide });
                const dup = store.games.find((g) => g.student_id === r.studentId && g.opponent_id === op.id && g.tournament === r.tournament && g.round === r.round);
                if (dup) continue;
                await saveGame(me, { student_id: r.studentId, color: r.color, opponent_id: op.id, opponent_rating: r.opponentRating, student_rating: r.studentRating, tournament: r.tournament,
                  round: r.round, played_on: r.playedOn, result: r.result, time_control: r.timeControl, start_fen: r.startFen, moves: r.moves });
                n++;
              } catch (e) { toast(`${r.white} – ${r.black}: ${e.message}`, 'error'); }
            }
            toast(`${n} maç eklendi`, 'ok');
            showGames();
          })();
        } }] });
    }

    // ----- one game: board, moves, analysis, coach comments -----
    async function showGame(id) {
      stopBoard(); setTabs('games'); loading();
      try { await ensureData(); } catch (e) { clear(body).append(h('div.empty', e.message)); return; }
      let g = store.games.find((x) => x.id === id);
      if (!g) { showGames(); return; }
      const o = store.opp(g.opponent_id);
      const p = playMoves(g.start_fen, g.moves);
      const startColor = p.fens[0].split(' ')[1];
      const canEdit = isCoach || g.student_id === me.id;
      let comments = {};
      try { const { data } = await supa.from('game_comments').select('*').eq('game_id', g.id); for (const c of data || []) comments[c.ply] = c; } catch (e) { /* none */ }
      let cls = g.analysis && g.analysis.evals ? classify(g.analysis.evals, startColor) : null;
      let ply = 0;
      const boardHost = h('div.tg-board');
      const moveList = h('div.tg-moves');
      const info = h('div.tg-info');
      const graph = h('div.tg-graph');
      const anaBox = h('div.tg-ana');
      const comBox = h('div.tg-comment');
      const white = g.color === 'w' ? studentName(g.student_id) : (o ? o.name : 'Rakip');
      const black = g.color === 'b' ? studentName(g.student_id) : (o ? o.name : 'Rakip');
      clear(body).append(h('div.tg-game',
        h('div.tg-top', h('button.egp-back', { onclick: showGames }, '◂ Maçlar'),
          h('div.tg-head', h('b', `${white} – ${black}`), h('span.muted', `  ${g.result === '1/2-1/2' ? '½–½' : g.result}`),
            h('div.muted.small', [g.tournament, g.round ? `${g.round}. tur` : null, fmtDay(g.played_on), g.time_control, g.eco ? `${g.eco} ${g.opening || ''}` : null].filter(Boolean).join(' · '))),
          h('div.btn-row',
            o ? h('button.btn.small', { onclick: () => showOpponent(o.id) }, '👤 Rakip: ' + o.name) : null,
            h('button.btn.small', { onclick: () => { navigator.clipboard?.writeText(pgnOf(g, white, black)); toast('PGN kopyalandı', 'ok'); } }, 'PGN kopyala'),
            canEdit ? h('button.btn.small', { onclick: () => gameDialog(g) }, 'Düzenle') : null,
            canEdit ? h('button.btn.small', { onclick: () => modal({ title: 'Maç silinsin mi?', body: h('p', 'Maç, analizi ve hoca yorumları silinir.'), actions: [{ label: 'Vazgeç' }, { label: 'Sil', primary: true, onClick: () => { supa.from('tournament_games').delete().eq('id', g.id).then(({ error }) => { if (error) toast(error.message, 'error'); else { toast('Silindi', 'ok'); store.load(true).then(showGames); } }); } }] }) }, 'Sil') : null)),
        h('div.tg-grid', h('div', boardHost, h('div.tg-nav',
          h('button.btn.small', { onclick: () => go(0) }, '⏮'), h('button.btn.small', { onclick: () => go(ply - 1) }, '◀'),
          h('button.btn.small', { onclick: () => go(ply + 1) }, '▶'), h('button.btn.small', { onclick: () => go(p.sans.length) }, '⏭'),
          h('button.btn.small', { onclick: () => board.flip() }, '⇅')), graph),
          h('div.tg-panel', info, anaBox, comBox, moveList))));
      board = new Board(boardHost, { orientation: g.color === 'b' ? 'black' : 'white' });
      document.onkeydown = (e) => { if (!document.body.contains(boardHost)) { document.onkeydown = null; return; } if (e.key === 'ArrowLeft') go(ply - 1); if (e.key === 'ArrowRight') go(ply + 1); };

      function go(n) {
        ply = Math.max(0, Math.min(p.sans.length, n));
        board.setPosition(p.fens[ply], { lastMove: ply ? p.ucis[ply - 1] : undefined });
        // after a classified move: show what was better
        const m = ply && cls ? cls.moves[ply - 1] : null;
        const bestUci = m && m.kind && g.analysis.best[ply - 1];
        board.setArrows(bestUci && bestUci !== p.ucis[ply - 1] ? [{ orig: bestUci.slice(0, 2), dest: bestUci.slice(2, 4), brush: 'green' }] : []);
        drawMoves(); drawComment(); drawGraph();
      }
      function drawMoves() {
        const items = [];
        p.sans.forEach((s, i) => {
          const white = (i % 2 === 0) === (startColor === 'w');
          const no = (startColor === 'b' ? Math.floor((i + 1) / 2) : Math.floor(i / 2)) + +(p.fens[0].split(' ')[5] || 1);
          if (white || i === 0) items.push(h('span.tg-no', white ? `${no}.` : `${no}...`));
          const m = cls && cls.moves[i];
          items.push(h('button.tg-mv' + (i + 1 === ply ? '.cur' : '') + (m && m.kind ? '.' + m.kind : ''), { onclick: () => go(i + 1) },
            localSan(s), m && m.kind ? KIND_MARK[m.kind] : '', comments[i + 1] ? ' 💬' : ''));
        });
        clear(moveList).append(...items);
        const cur = moveList.querySelector('.cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
      }
      function drawComment() {
        const c = comments[ply];
        const m = ply && cls ? cls.moves[ply - 1] : null;
        const parts = [];
        if (m && m.kind) {
          const bu = g.analysis.best[ply - 1];
          parts.push(h('div.tg-verdict.' + m.kind, `${KIND_MARK[m.kind]} ${KIND_TR[m.kind]}`, bu ? h('span.muted.small', ` — daha iyisi: ${uciSan(p.fens[ply - 1], bu)}`) : null));
        }
        if (c) parts.push(h('div.tg-coach-note', h('b', '💬 Hoca: '), c.body));
        if (isCoach && ply > 0) {
          const ta = h('textarea', { rows: 2, placeholder: 'Bu hamleye yorum yaz (öğrenci görür)…' }, c ? c.body : '');
          parts.push(h('div.tg-com-edit', ta, h('div.btn-row',
            h('button.btn.small.primary', { onclick: async () => {
              const t = ta.value.trim();
              if (!t) return;
              const { data, error } = await supa.from('game_comments').upsert({ game_id: g.id, ply, body: t, coach_id: me.id }, { onConflict: 'game_id,ply' }).select('*').single();
              if (error) { toast(error.message, 'error'); return; }
              comments[ply] = data; toast('Yorum kaydedildi', 'ok'); drawMoves(); drawComment();
            } }, 'Yorumu kaydet'),
            c ? h('button.btn.small', { onclick: async () => { await supa.from('game_comments').delete().eq('id', c.id); delete comments[ply]; drawMoves(); drawComment(); } }, 'Yorumu sil') : null)));
        }
        clear(comBox).append(...parts);
      }
      function drawGraph() {
        if (!g.analysis || !g.analysis.evals) { clear(graph); return; }
        const ev = g.analysis.evals, W = 600, H = 70, n = ev.length - 1 || 1;
        const pts = ev.map((e, i) => `${(i / n * W).toFixed(1)},${(H - winPct(e) / 100 * H).toFixed(1)}`).join(' ');
        const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="tg-svg"><rect width="${W}" height="${H}" fill="#3a3a3a"/><polygon points="0,${H} ${pts} ${W},${H}" fill="#f2f2f2"/><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#999" stroke-dasharray="3 3"/><line x1="${ply / n * W}" y1="0" x2="${ply / n * W}" y2="${H}" stroke="#c0392b" stroke-width="2"/>${cls.moves.map((m, i) => m && (m.kind === 'blunder' || m.kind === 'mistake') ? `<circle cx="${((i + 1) / n * W).toFixed(1)}" cy="${(H - winPct(ev[i + 1]) / 100 * H).toFixed(1)}" r="3.5" fill="${m.kind === 'blunder' ? '#d32f2f' : '#f57c00'}"/>` : '').join('')}</svg>`;
        graph.innerHTML = svg;
        graph.onclick = (e) => { const r = graph.getBoundingClientRect(); go(Math.round((e.clientX - r.left) / r.width * n)); };
      }
      function drawInfo() {
        const side = (c) => (cls ? cls[c] : null);
        const row = (c, name) => { const s = side(c); return h('div.tg-acc', h('span.tg-color.' + c), h('b', name), s ? h('span', ` · İsabet %${s.accuracy} · `, h('span.bad-text', `${s.blunder} ??`), ' ', h('span.warn-text', `${s.mistake} ?`), ' ', h('span.muted', `${s.inaccuracy} ?!`)) : null); };
        clear(info).append(row('w', white), row('b', black));
        if (!cls) {
          const btn = h('button.btn.primary', { onclick: async () => {
            btn.disabled = true;
            try {
              const a = await analyseGame(g, (i, n) => { btn.textContent = `Analiz ediliyor… %${Math.round(i / n * 100)}`; });
              g.analysis = a; cls = classify(a.evals, startColor);
              const { error } = await supa.from('tournament_games').update({ analysis: a }).eq('id', g.id);
              if (error && canEdit) toast('Analiz kaydedilemedi: ' + error.message, 'error');
              drawInfo(); go(ply);
            } catch (e) { toast('Analiz yapılamadı: ' + e.message, 'error'); btn.disabled = false; btn.textContent = 'Stockfish ile analiz et'; }
          } }, 'Stockfish ile analiz et');
          clear(anaBox).append(btn, h('div.muted.small', 'Her hamle motorla değerlendirilir; büyük hatalar (??), hatalar (?) ve belirsiz hamleler (?!) işaretlenir. Telefonda 1–2 dakika sürebilir.'));
        } else {
          const crit = cls.moves.map((m, i) => ({ m, i })).filter(({ m }) => m && (m.kind === 'blunder' || m.kind === 'mistake') && m.side === g.color);
          const puzzNote = h('div.small');
          if (g.student_id === me.id && crit.length) {
            mistakesToPuzzles(g, o ? o.name : 'Rakip').then((n) => {
              if (n) clear(puzzNote).append('🧩 Bu maçtaki ', h('b', `${n} hatan`), ' bulmaca oldu: ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); window.goTo && window.goTo('puzzles:mine'); } }, 'Bulmacalar → Oyunlarım'));
            }).catch(() => {});
          }
          clear(anaBox).append(puzzNote, crit.length ? h('div.tg-crit', h('div.small', h('b', g.student_id === me.id ? 'Kritik anlar (senin hataların): ' : 'Kritik anlar (öğrencinin hataları): ')), crit.map(({ m, i }) => h('button.btn.small.' + m.kind, { onclick: () => go(i + 1) }, `${KIND_MARK[m.kind]} ${p.sans[i] ? localSan(p.sans[i]) : ''}`))) : h('div.ok-text.small', 'Büyük hata yok 👏'));
        }
      }
      drawInfo(); go(0);
    }
    function uciSan(fen, uci) {
      try { return localSan(new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' }).san); } catch (e) { return uci; }
    }
    function pgnOf(g, white, black) {
      return `[Event "${g.tournament || '?'}"]\n[Round "${g.round || '?'}"]\n[Date "${(g.played_on || '????.??.??').replace(/-/g, '.')}"]\n[White "${white}"]\n[Black "${black}"]\n[Result "${g.result}"]\n${g.start_fen ? `[SetUp "1"]\n[FEN "${g.start_fen}"]\n` : ''}\n${numbered(g.moves, g.start_fen)} ${g.result}\n`;
    }

    // ----- opponents -----
    async function showOpponents() {
      stopBoard(); setTabs('opps'); loading();
      try { await ensureData(true); } catch (e) { clear(body).append(h('div.empty', e.message)); return; }
      const list = h('div');
      let q = '';
      const draw = () => {
        const k = normName(q);
        const rows = store.opponents.map((o) => ({ o, gs: store.games.filter((g) => g.opponent_id === o.id) }))
          .filter(({ o }) => !k || k.split(' ').every((t) => o.norm_name.split(' ').some((w) => w.startsWith(t))) || (o.club && normName(o.club).includes(k)))
          .sort((a, b) => b.gs.length - a.gs.length || a.o.name.localeCompare(b.o.name, 'tr'));
        clear(list).append(rows.length ? h('div.tg-list', rows.map(({ o, gs }) => {
          const s = opponentStats(gs);
          return h('button.tg-row', { onclick: () => showOpponent(o.id) },
            h('div.tg-main', h('div.tg-title', h('b', o.name), o.rating ? h('span.muted', ` (${o.rating})`) : null), h('div.muted.small', [o.club, o.fide_id ? 'FIDE ' + o.fide_id : null].filter(Boolean).join(' · '))),
            h('div.tg-side', h('div.small', `${gs.length} maç`), s.scored ? h('div.muted.small', `Bizim puan: ${s.ourScore}/${s.scored}`) : null));
        })) : h('div.empty', store.opponents.length ? 'Bulunamadı.' : 'Henüz rakip yok. Maç ekledikçe rakipler burada birikir.'));
      };
      clear(body).append(h('div.tg-toolbar', h('input.search', { placeholder: 'Rakip ara (ad, kulüp)…', oninput: (e) => { q = e.target.value; draw(); } })),
        h('p.muted.small', 'Turnuvada eşleştiğin rakibi ara: daha önce akademimizden kimlerle oynadığını, beyazla ve siyahla hangi açılışları oynadığını gör.'), list);
      draw();
    }

    async function showOpponent(id) {
      stopBoard(); setTabs('opps'); loading();
      try { await ensureData(); } catch (e) { clear(body).append(h('div.empty', e.message)); return; }
      const o = store.opp(id);
      if (!o) { showOpponents(); return; }
      const gs = store.games.filter((g) => g.opponent_id === id);
      const s = opponentStats(gs);
      const opTable = (c) => s[c].openings.length ? h('table.tg-tbl.small', h('thead', h('tr', h('th', 'Açılış'), h('th', 'Maç'), h('th', 'Rakibin puanı'))),
        h('tbody', s[c].openings.map((x) => h('tr', h('td', x.eco ? h('span.muted', x.eco + ' ') : null, x.name), h('td', x.games), h('td', x.scored ? `${x.score}/${x.scored}` : '–'))))) : h('div.muted.small', 'Bu renkle maçı yok.');
      const firsts = (c) => s[c].first.length ? h('div.small', s[c].first.map((f) => h('span.chip', `${localSanLine(f.move)} × ${f.n}`))) : null;
      clear(body).append(h('div.tg-opp',
        h('div.tg-top', h('button.egp-back', { onclick: showOpponents }, '◂ Rakipler'),
          h('div.tg-head', h('h3', o.name, o.rating ? h('span.muted', ` (${o.rating})`) : null),
            h('div.muted.small', [o.club, o.fide_id ? h('a', { href: `https://ratings.fide.com/profile/${o.fide_id}`, target: '_blank', rel: 'noopener' }, 'FIDE profili') : null].filter(Boolean).reduce((a, x, i) => (i ? [...a, ' · ', x] : [x]), []))),
          h('div.btn-row', h('button.btn.small.primary', { onclick: () => prepDialog(o, gs) }, '♟ Hazırlık: Açılış Tekrarı\'na ekle'),
            isCoach || o.created_by === me.id ? h('button.btn.small', { onclick: () => editOpponent(o) }, 'Düzenle') : null,
            isCoach ? h('button.btn.small.ghost', { onclick: () => deleteOpponent(o, gs.length) }, 'Sil') : null)),
        o.note ? h('div.panel.small', h('b', '📝 Not: '), o.note) : null,
        h('div.tg-stats', h('div.tg-stat', h('div.tg-stat-n', gs.length), h('div.muted.small', 'maç')), h('div.tg-stat', h('div.tg-stat-n', s.scored ? `${s.ourScore}/${s.scored}` : '–'), h('div.muted.small', 'bizim puanımız'))),
        h('div.tg-cols',
          h('div.panel', h('h4', '♔ Beyazla oynadıkları'), firsts('w'), opTable('w')),
          h('div.panel', h('h4', '♚ Siyahla oynadıkları'), firsts('b'), opTable('b'))),
        h('h4', 'Maçları'),
        h('div.tg-list', gs.map((g) => h('button.tg-row', { onclick: () => showGame(g.id) },
          h('span.tg-res.r' + String(myScore(g)).replace('.', '')),
          h('div.tg-main', h('div.tg-title', 'Rakip ', g.color === 'w' ? 'siyah' : 'beyaz', ' · ', h('b', studentName(g.student_id))), h('div.muted.small', [g.tournament, g.round ? `${g.round}. tur` : null, fmtDay(g.played_on)].filter(Boolean).join(' · '))),
          h('div.tg-side', h('div.small', scoreText(myScore(g))), h('div.muted.small', g.opening || '')))))));
    }
    // Opponent's lines → one repertoire per colour in the viewer's own Açılış Tekrarı
    function prepDialog(o, gs) {
      const sets = [['w', 'b'], ['b', 'w']].map(([oppColor, ours]) => ({ oppColor, ours, lines: prepLines(gs, oppColor) })).filter((x) => x.lines.length);
      if (!sets.length) { toast('Bu rakiple hazırlık çıkaracak maç yok', 'error'); return; }
      const noAna = gs.filter((g) => !g.analysis).length;
      modal({ title: `Hazırlık: ${o.name}`, body: h('div.form-col',
        h('p', 'Bu rakibin akademimize karşı oynadığı açılışlar, ', h('b', 'Açılış Tekrarı'), '\'na senin repertuvarın olarak eklenir; aralıklı tekrarla çalışırsın.'),
        h('ul', sets.map((x) => h('li', `Rakip ${x.oppColor === 'w' ? 'beyazken' : 'siyahken'}: ${x.lines.length} çizgi → "${o.name} – sen ${x.ours === 'w' ? 'beyazla' : 'siyahla'}"`,
          x.lines.some((l) => l.fixed) ? h('span.muted.small', ` (${x.lines.filter((l) => l.fixed).length} çizgide hata yaptığımız yerde motorun önerdiği hamle var)`) : null))),
        noAna ? h('div.warn-box', `${noAna} maç analiz edilmemiş: onlarda hatalı hamleler düzeltilemez. Önce maçları analiz etmek daha iyi olur.`) : null,
        isCoach ? h('div.muted.small', 'Senin Açılış Tekrarı\'na eklenir; öğrenciye "Ödev ver → Açılış repertuvarları"ndan gönderebilirsin.') : null),
      actions: [{ label: 'Vazgeç' }, { label: 'Ekle', primary: true, onClick: () => {
        (async () => {
          try {
            await odata.load();
            for (const x of sets) {
              const pgn = x.lines.map((l) => `[Event "Hazırlık"]\n\n${pgnLine(l.sans)} *`).join('\n\n');
              const { roots } = parsePgnTree(pgn, { maxPlies: 30 });
              if (roots.length) await odata.add({ name: `${o.name} – sen ${x.ours === 'w' ? 'beyazla' : 'siyahla'}`, color: x.ours, roots });
            }
            toast('Açılış Tekrarı\'na eklendi', 'ok');
          } catch (e) { toast('Eklenemedi: ' + e.message, 'error'); }
        })();
      } }] });
    }
    function localSanLine(s) { return s.replace(/([KQRBN])/g, (m) => ({ K: 'Ş', Q: 'V', R: 'K', B: 'F', N: 'A' })[m]); }

    // Coach-only (RLS opp_delete). Games keep existing; their opponent link is cleared (FK ON DELETE SET NULL).
    async function deleteOpponent(o, nGames) {
      const msg = nGames
        ? `"${o.name}" silinsin mi?\n\nBu rakibe bağlı ${nGames} maç silinmez ama rakip bilgisi boş kalır. Bu işlem geri alınamaz.`
        : `"${o.name}" silinsin mi? Bu işlem geri alınamaz.`;
      if (!confirm(msg)) return;
      const { error } = await supa.from('opponents').delete().eq('id', o.id);
      if (error) { toast(error.message, 'error'); return; }
      toast('Rakip silindi', 'ok'); await store.load(true); showOpponents();
    }

    function editOpponent(o) {
      const name = h('input', { value: o.name }), rating = h('input', { type: 'number', value: o.rating || '' }), fide = h('input', { value: o.fide_id || '' }), club = h('input', { value: o.club || '' });
      const note = h('textarea', { rows: 3, placeholder: 'Örn. Süreye düşüyor, Sicilya Najdorf hazırlığı var…' }, o.note || '');
      const others = store.opponents.filter((x) => x.id !== o.id);
      const merge = isCoach && others.length ? h('select', h('option', { value: '' }, '— birleştirme yok —'), others.map((x) => h('option', { value: x.id }, x.name))) : null;
      modal({ title: 'Rakibi düzenle', body: h('div.form-col', field('Ad soyad', name), field('Puanı', rating), field('FIDE ID', fide), field('Kulübü', club), field('Not (öğrenciler de görür)', note),
        merge ? field('Bu kişiyle aynı (birleştir)', merge, 'Adı farklı yazılmış aynı rakip: seçilen kişinin maçları bu rakibe taşınır ve o kayıt silinir.') : null),
      actions: [{ label: 'Vazgeç' }, { label: 'Kaydet', primary: true, onClick: () => {
        (async () => {
          const patch = { name: name.value.trim(), norm_name: normName(name.value), rating: +rating.value || null, fide_id: fide.value.trim() || null, club: club.value.trim() || null, note: note.value.trim() || null };
          const { error } = await supa.from('opponents').update(patch).eq('id', o.id);
          if (error) { toast(error.message, 'error'); return; }
          if (merge && merge.value) {
            const { error: e2 } = await supa.from('tournament_games').update({ opponent_id: o.id }).eq('opponent_id', merge.value);
            if (e2) { toast(e2.message, 'error'); return; }
            await supa.from('opponents').delete().eq('id', merge.value);
          }
          toast('Kaydedildi', 'ok'); await store.load(true); showOpponent(o.id);
        })();
      } }] });
    }

    if (opts.game) showGame(opts.game); else showGames();
  },
};
