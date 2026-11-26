// Static board picture as SVG (no images needed): reports, PDFs and lesson thumbnails.
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
// Static board picture for PDFs and previews (no images needed).
export function fenSvg(fen, size = 240, flip = false) {
  const rows = fen.split(' ')[0].split('/');
  const sq = size / 8;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      const x = (flip ? 7 - f : f) * sq, y = (flip ? 7 - r : r) * sq;
      const white = ch === ch.toUpperCase();
      out += `<text x="${x + sq / 2}" y="${y + sq * 0.84}" font-size="${sq * 0.95}" text-anchor="middle" font-family="'Segoe UI Symbol','DejaVu Sans','Noto Sans Symbols2',serif" fill="${white ? '#fff' : '#1b1714'}" stroke="${white ? '#1b1714' : 'none'}" stroke-width="${white ? sq * 0.03 : 0}">${GLYPH[ch.toLowerCase()]}</text>`;
      f++;
    }
  }
  let bg = '';
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) bg += `<rect x="${f * sq}" y="${r * sq}" width="${sq}" height="${sq}" fill="${(r + f) % 2 ? '#b58863' : '#f0d9b5'}"/>`;
  return out.replace('>', '>' + bg) + `<rect x="0" y="0" width="${size}" height="${size}" fill="none" stroke="#6b5a4a"/></svg>`;
}
