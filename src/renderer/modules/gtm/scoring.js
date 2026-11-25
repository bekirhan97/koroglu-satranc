// Guess-the-Move scoring, modelled on ChessTempo's system and calibrated against a real
// ChessTempo review (37 moves). All evals are centipawns from the mover's point of view.
//
//   10   = master's move (or an equally good move, or a main-line book move)
//   10-12= a move clearly better than the master's (bonus up to +2)
//   <10  = based on how much winning chance is lost compared with the master's move
//   0    = a potentially game-losing blunder

export const K = 0.006;                 // logistic steepness (centipawns -> expected score)
export const WIN_CP = 150;              // outcome class thresholds (ChessTempo: +1.49 was not "winning")

export const winPct = (cp) => 100 / (1 + Math.exp(-K * Math.max(-3000, Math.min(3000, cp))));

export function outcomeClass(cp) {
  if (cp >= WIN_CP) return 'win';
  if (cp <= -WIN_CP) return 'loss';
  return 'even';
}

const EQUAL_LOSS = 0.6;     // win% lost that still counts as "as good as the master's move"
const BONUS_FROM = 3;       // win% gained over master before any bonus is given
const BONUS_FULL = 13;      // win% gained for the full +2 bonus

/**
 * @param {object} p
 * @param {string} p.played  uci of the user's move
 * @param {number} p.playedCp
 * @param {string} p.master  uci of the master's move
 * @param {number} p.masterCp
 * @param {number} p.bestCp  eval of the engine's best move
 * @param {boolean} p.isBook resulting position is in the opening book
 * @returns {{score:number, type:string, loss:number, gain:number}}
 */
export function scoreMove({ played, playedCp, master, masterCp, bestCp, isBook }) {
  if (played === master) return { score: 10, type: 'master', loss: 0, gain: 0 };
  const loss = winPct(masterCp) - winPct(playedCp);
  const gain = -loss;

  if (isBook && loss <= 8) return { score: 10, type: 'opening', loss, gain };

  if (gain >= BONUS_FROM) {
    const bonus = Math.min(2, ((gain - BONUS_FROM) / (BONUS_FULL - BONUS_FROM)) * 2);
    return { score: round1(10 + bonus), type: 'bonus', loss, gain };
  }
  if (loss <= EQUAL_LOSS) return { score: 10, type: 'equal', loss, gain };

  let score = 8.6 - 0.6 * loss;
  // Keeping a winning position winning is never a disaster.
  if (outcomeClass(masterCp) === 'win' && outcomeClass(playedCp) === 'win') {
    score = Math.max(score, 4.5 + 5 * Math.max(0, 1 - loss / 12));
  } else if (masterCp >= 100 && playedCp >= 20) {
    // Advantage spoiled but still slightly better: small consolation (fades when the master was crushing).
    score = Math.max(score, 3 - Math.max(0, masterCp - 300) / 100);
  }
  score = Math.max(0, Math.min(9.5, score));
  return { score: round1(score), type: 'other', loss, gain };
}

const round1 = (x) => Math.round(x * 10) / 10;

export function scoreLabel(score, type) {
  if (type === 'bonus') return { text: 'Harika Hamle!', cls: 'great' };
  if (score >= 9.5) return { text: 'İyi Hamle', cls: 'good' };
  if (score >= 6) return { text: 'Fena Değil', cls: 'ok' };
  if (score >= 4.5) return { text: 'Ortalama', cls: 'avg' };
  if (score >= 3.5) return { text: 'Zayıf Hamle', cls: 'poor' };
  return { text: 'Kötü Hamle', cls: 'bad' };
}

export function scoreClass(score) {
  if (score > 10) return 'great';
  if (score >= 9.5) return 'good';
  if (score >= 6) return 'ok';
  if (score >= 4.5) return 'avg';
  if (score >= 3.5) return 'poor';
  return 'bad';
}

/**
 * Difficulty rating of a position (used as the "opponent" in the rating update).
 * ChessTempo derives this from thousands of users' results; with a single user we estimate it
 * from the engine's view: how many reasonable moves would also score well, and whether the
 * master's move is an obvious recapture.
 */
export function positionRating({ top, masterCp, masterUci, legalCount, isRecapture, isBook }) {
  if (legalCount <= 1) return 800;
  let good = 0;
  for (const l of top) {
    const s = l.uci === masterUci ? 10 : scoreMove({ played: l.uci, playedCp: l.cp, master: masterUci, masterCp, bestCp: top[0].cp, isBook: false }).score;
    if (s >= 7) good++;
  }
  const n = Math.min(top.length, legalCount);
  const ratio = n ? good / n : 1;
  let r = 1950 - 900 * ratio;          // 1 good move of 4 -> ~1725, all good -> ~1050
  if (isRecapture) r -= 350;
  if (legalCount <= 3) r -= 200;
  // A position where even the master's move loses ground is easier to "match or beat".
  if (top[0] && top[0].uci !== masterUci && winPct(top[0].cp) - winPct(masterCp) > 5) r -= 150;
  // Book positions: many moves are known theory, so they are easy (ChessTempo: ~1050-1350).
  if (isBook) r = Math.min(1350, 1000 + (r - 1000) * 0.4);
  return Math.round(Math.max(800, Math.min(2400, r)));
}
