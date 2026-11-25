// UI pieces shared by the play and review screens.
import { h, fmtTime, fmtEval } from '../../core/dom.js';
import { store } from '../../core/store.js';
import { localSan } from '../../core/board.js';
import { uciToSan } from '../../core/pgn.js';
import { attemptStats, pct } from './session.js';
import { scoreLabel } from './scoring.js';

export const tr = () => store.settings.turkishNotation !== false;
export const san = (s) => localSan(s, tr());

// Convert a mover-POV eval to White's POV for display.
export const whiteCp = (cp, moverColor) => (cp == null ? null : moverColor === 'w' ? cp : -cp);

export function statsPanel(att, { title }) {
  const st = attemptStats(att);
  const rating = store.profile.ratings.gtm.r;
  const sign = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
  const rows = [
    ['Puan', att.rated ? `${rating.toFixed(1)} (${sign(st.ratingChange)})` : `${rating.toFixed(1)} (puansız)`],
    ['Usta ile aynı', pct(st.master, st.played)],
    ['Motor ile aynı', pct(st.engine, st.played)],
    ['Bonus hamle', st.bonus],
    ['Oynanan hamle', st.played],
    ['Kazançtan kayba', pct(st.winToLoss, st.winTotal)],
    ['Kazançtan eşitliğe', pct(st.winToEven, st.winTotal)],
    ['Eşitlikten kayba', pct(st.evenToLoss, st.evenTotal)],
    ['Toplam süre', fmtTime(st.totalMs)],
    ['Ortalama skor', st.avg.toFixed(2)],
  ];
  return h('div.panel.stats-panel',
    h('div.panel-title', title),
    h('table.kv', rows.map(([k, v]) => h('tr', h('td', k), h('td', v)))));
}

// Feedback box shown after a guess (and in review for a selected move).
export function feedbackBox({ move, entry, fen, color }) {
  const lab = scoreLabel(move.score, move.type);
  const playedSan = san(move.san);
  const masterSan = san(uciToSan(fen, move.masterUci));
  const best = entry && entry.top && entry.top[0];
  let engineLine;
  if (move.uci === move.bestUci) engineLine = 'Motorun en iyi hamlesini buldunuz';
  else if (move.masterUci === move.bestUci) engineLine = 'Usta motorun en iyi hamlesini oynadı';
  else engineLine = `Motorun en iyi hamlesinin değerlendirmesi: ${fmtEval(whiteCp(best ? best.cp : move.bestCp, color))}`;
  const typeNote = move.type === 'opening' ? ' (Açılış)' : move.type === 'equal' ? ' (eşdeğer)' : '';
  const sign = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
  return h('div.feedback.' + lab.cls,
    h('div.fb-head', `${lab.text} – Skor: ${move.score.toFixed(1)}${typeNote}`),
    h('div.fb-body',
      move.uci === move.masterUci
        ? h('div', h('b', 'Usta hamlesini buldunuz: '), `${playedSan} (${fmtEval(whiteCp(move.cp, color))})`)
        : h('div', h('b', 'Sizin: '), `${playedSan} (${fmtEval(whiteCp(move.cp, color))})  `, h('b', ' Usta: '), `${masterSan} (${fmtEval(whiteCp(move.masterCp, color))})`),
      h('div', engineLine),
      h('div.fb-ratings',
        h('span', move.rated ? `Oyuncu: ${move.ratingAfter.toFixed(1)} (${sign(move.ratingDelta)})` : `Oyuncu: puansız [${sign(move.ratingDelta)}]`),
        h('span', `Pozisyon zorluğu: ${move.posRating}`))));
}

export function playerBar(game, color) {
  const name = color === 'w' ? game.headers.White : game.headers.Black;
  const elo = color === 'w' ? game.headers.WhiteElo : game.headers.BlackElo;
  return h('div.player-bar.' + (color === 'w' ? 'white' : 'black'), name + (elo ? ` (${elo})` : ''));
}

export function gameTitle(game) {
  const H = game.headers;
  return `${H.White} – ${H.Black}${H.Date ? ', ' + H.Date.slice(0, 4) : ''}`;
}
