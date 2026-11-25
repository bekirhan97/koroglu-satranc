// Glicko-1 rating update for a single "game" (one move vs one position).
// s is the result in [0,1]: 0 = loss, 0.5 = draw, 1 = win.
const Q = Math.log(10) / 400;
const g = (rd) => 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));

export const RD_MIN = 60;   // keeps ratings responsive (ChessTempo-like move-by-move swings)
export const RD_MAX = 350;

export function expected(r, rj, rdj) {
  return 1 / (1 + Math.pow(10, (-g(rdj) * (r - rj)) / 400));
}

export function glickoUpdate(r, rd, rj, rdj, s) {
  const gj = g(rdj);
  const E = expected(r, rj, rdj);
  const d2 = 1 / (Q * Q * gj * gj * E * (1 - E));
  const denom = 1 / (rd * rd) + 1 / d2;
  const newR = r + (Q / denom) * gj * (s - E);
  const newRd = Math.max(RD_MIN, Math.min(RD_MAX, Math.sqrt(1 / denom)));
  return { r: newR, rd: newRd, delta: newR - r, expected: E };
}

// Rating deviation grows back slowly with inactivity (Glicko's "c" constant, per day).
export function inflateRd(rd, lastTime, now = Date.now()) {
  if (!lastTime) return rd;
  const days = Math.max(0, (now - lastTime) / 86400000);
  const c = 15;
  return Math.min(RD_MAX, Math.sqrt(rd * rd + c * c * days));
}
