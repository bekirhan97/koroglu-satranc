// Spaced repetition ladder shared by opening review and missed-puzzle review.
const H = 3600 * 1000, D = 24 * H;
// level -> interval until the next review
export const INTERVALS = [0, 4 * H, 1 * D, 3 * D, 7 * D, 14 * D, 30 * D, 90 * D, 180 * D];
export const LEVEL_NAMES = ['Yeni', '4 saat', '1 gün', '3 gün', '1 hafta', '2 hafta', '1 ay', '3 ay', '6 ay'];

// Correct: one level up. Wrong: back to level 1 (4 hours).
export function gradeCard(card, correct, now = Date.now()) {
  const s = card || { lv: 0, reps: 0, lapses: 0 };
  s.reps++;
  if (correct) s.lv = Math.min(INTERVALS.length - 1, s.lv + 1);
  else { s.lv = 1; s.lapses++; }
  s.due = now + INTERVALS[s.lv];
  s.last = now;
  return s;
}
