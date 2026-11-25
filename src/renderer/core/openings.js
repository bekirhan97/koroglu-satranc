// Opening book built from the lichess chess-openings database (~3,500 named lines).
let book = null;

export async function loadOpenings() {
  if (!book) book = await window.api.openings();
  return book;
}

export const epdOf = (fen) => fen.split(' ').slice(0, 4).join(' ');

export function inBook(fen) { return !!(book && book[epdOf(fen)]); }

// Name of the deepest book position reached by a list of FENs.
export function openingName(fens) {
  let found = null;
  for (const f of fens) {
    const e = book && book[epdOf(f)];
    if (e) found = e; else if (found) break;
  }
  return found ? { eco: found[0], name: found[1] } : null;
}
