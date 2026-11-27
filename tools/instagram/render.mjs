// Köroğlu Satranç — Instagram görseli: JSON tarif → PNG (1080×1350 gönderi, 1080×1920 hikâye, 1080×1080 kare).
// Kullanım: node render.mjs tarif.json [çıktı-klasörü]
// Tarif tek nesne ya da nesne dizisi (carousel) olabilir. Alanlar README.md'de.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import { Chess } from 'chess.js';
import opentype from 'opentype.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export const BRAND = {
  bordo: '#7a1426', bordoDark: '#4a0c17', gold: '#d9a84b', ink: '#17110f', cream: '#f5ead2', muted: '#bfae95',
  light: '#f0dfbd', dark: '#a9616a', green: '#3d8b5a', red: '#c0392b',
};
const SIZES = { post: [1080, 1350], story: [1080, 1920], square: [1080, 1080] };
const FONT_FILES = ['Inter-Regular.otf', 'Inter-SemiBold.otf', 'Inter-ExtraBold.otf'].map((f) => join(HERE, 'fonts', f));
const loadFont = (f) => { const b = readFileSync(f); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const FONTS = { 400: loadFont(FONT_FILES[0]), 600: loadFont(FONT_FILES[1]), 800: loadFont(FONT_FILES[2]) };

// Taş resimleri: chessground'un cburnett takımı (uygulamada da kullanılan takım).
const PIECES = (() => {
  const css = readFileSync(require.resolve('chessground/assets/chessground.cburnett.css'), 'utf8');
  const map = {};
  const re = /piece\.(\w+)\.(white|black)\s*\{\s*background-image:\s*url\(['"]?(data:image\/svg\+xml;base64,[^'")]+)/g;
  for (let m; (m = re.exec(css));) map[m[2][0] + m[1]] = m[3];
  return map;
})();
const ROLE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const LOGO = 'data:image/png;base64,' + readFileSync(join(HERE, '../../build-src/logo.png')).toString('base64');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Genişlik harf harf (Inter'in ccmp özelliği opentype.js şekillendiricisini bozduğu için).
const width = (text, size, w = 400) => { const f = FONTS[w]; let a = 0; for (const c of text) a += f.charToGlyph(c).advanceWidth; return a * size / f.unitsPerEm; };

export function wrap(text, size, maxW, w = 400) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + ' ' + word : word;
      if (line && width(t, size, w) > maxW) { lines.push(line); line = word; } else line = t;
    }
    lines.push(line);
  }
  return lines;
}

const textBlock = (lines, x, y, size, lh, w, fill, anchor = 'start') =>
  lines.map((l, i) => `<text x="${x}" y="${y + i * lh}" font-family="Inter" font-weight="${w}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${esc(l)}</text>`).join('');

const sqXY = (sq, flip) => {
  const f = sq.charCodeAt(0) - 97, r = Number(sq[1]) - 1;
  return flip ? [7 - f, r] : [f, 7 - r];
};

function boardSvg(fen, x, y, size, { flip = false, lastMove = null, marks = [], arrows = [] } = {}) {
  const s = size / 8;
  let out = `<rect x="${x - 8}" y="${y - 8}" width="${size + 16}" height="${size + 16}" rx="10" fill="${BRAND.gold}"/>`;
  const hl = new Set(lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : []);
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const file = flip ? 7 - f : f, rank = flip ? r : 7 - r;
    const sq = String.fromCharCode(97 + file) + (rank + 1);
    const light = (file + rank) % 2 === 1;
    out += `<rect x="${x + f * s}" y="${y + r * s}" width="${s}" height="${s}" fill="${light ? BRAND.light : BRAND.dark}"/>`;
    if (hl.has(sq)) out += `<rect x="${x + f * s}" y="${y + r * s}" width="${s}" height="${s}" fill="${BRAND.gold}" fill-opacity="0.55"/>`;
    if (marks.includes(sq)) out += `<circle cx="${x + f * s + s / 2}" cy="${y + r * s + s / 2}" r="${s * 0.44}" fill="none" stroke="${BRAND.green}" stroke-width="${s * 0.07}"/>`;
    const cc = light ? BRAND.dark : BRAND.light, fs = s * 0.2;
    if (f === 0) out += `<text x="${x + s * 0.06}" y="${y + r * s + fs * 1.05}" font-family="Inter" font-weight="600" font-size="${fs}" fill="${cc}">${rank + 1}</text>`;
    if (r === 7) out += `<text x="${x + f * s + s * 0.94}" y="${y + 8 * s - s * 0.06}" font-family="Inter" font-weight="600" font-size="${fs}" fill="${cc}" text-anchor="end">${String.fromCharCode(97 + file)}</text>`;
  }
  fen.split(' ')[0].split('/').forEach((row, ri) => {
    let fi = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { fi += Number(ch); continue; }
      const [cx, cy] = sqXY(String.fromCharCode(97 + fi) + (8 - ri), flip);
      const key = (ch === ch.toUpperCase() ? 'w' : 'b') + ROLE[ch.toLowerCase()];
      out += `<image href="${PIECES[key]}" x="${x + cx * s}" y="${y + cy * s}" width="${s}" height="${s}"/>`;
      fi++;
    }
  });
  for (const a of arrows) {
    const [from, to, color = 'gold'] = Array.isArray(a) ? a : [a.slice(0, 2), a.slice(2, 4)];
    const c = BRAND[color] || color;
    const [fx, fy] = sqXY(from, flip), [tx, ty] = sqXY(to, flip);
    const x1 = x + fx * s + s / 2, y1 = y + fy * s + s / 2, x2 = x + tx * s + s / 2, y2 = y + ty * s + s / 2;
    const ang = Math.atan2(y2 - y1, x2 - x1), head = s * 0.42, sw = s * 0.17;
    const ex = x2 - Math.cos(ang) * head * 0.9, ey = y2 - Math.sin(ang) * head * 0.9;
    const p = (d, k) => `${x2 - Math.cos(ang) * head + Math.cos(ang + d) * k},${y2 - Math.sin(ang) * head + Math.sin(ang + d) * k}`;
    out += `<g opacity="0.88"><line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>` +
      `<polygon points="${x2},${y2} ${p(Math.PI / 2, head * 0.55)} ${p(-Math.PI / 2, head * 0.55)}" fill="${c}"/></g>`;
  }
  return out;
}

// Seçenekler 1-2-3-4 ile numaralanır (A harfi Türkçe notasyonda "at" olduğu için harf kullanılmaz).
function pills(choices, y, W) {
  const n = choices.length, gap = 18, pw = (W - 120 - gap * (n - 1)) / n, ph = 78;
  return choices.map((c, i) => {
    const x = 60 + i * (pw + gap), st = c.state || 'neutral';
    const fill = st === 'ok' ? BRAND.green : st === 'bad' ? '#2a1f1b' : BRAND.bordoDark;
    const stroke = st === 'ok' ? '#7fd39f' : st === 'bad' ? '#4a3b34' : BRAND.gold;
    const txt = st === 'bad' ? BRAND.muted : BRAND.cream;
    return `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="39" fill="${fill}" stroke="${stroke}" stroke-width="3"/>` +
      `<circle cx="${x + 40}" cy="${y + ph / 2}" r="24" fill="${st === 'ok' ? '#ffffff' : BRAND.gold}" fill-opacity="${st === 'bad' ? 0.35 : 1}"/>` +
      `<text x="${x + 40}" y="${y + ph / 2 + 10}" font-family="Inter" font-weight="800" font-size="28" fill="${st === 'ok' ? BRAND.green : BRAND.ink}" text-anchor="middle">${st === 'ok' ? '✓' : i + 1}</text>` +
      `<text x="${x + 48 + (pw - 40) / 2}" y="${y + ph / 2 + 13}" font-family="Inter" font-weight="800" font-size="36" fill="${txt}" text-anchor="middle"${st === 'bad' ? ' text-decoration="line-through"' : ''}>${esc(c.label)}</text>`;
  }).join('');
}

export function renderSvg(spec) {
  const [W, H] = SIZES[spec.size || 'post'];
  let fen = spec.fen, lastMove = null;
  if (spec.move) { // "önce şu hamle(ler)i oyna, sonra göster" (bulmacada rakibin ilk hamlesi)
    const ch = new Chess(fen);
    for (const m of [].concat(spec.move)) { ch.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] || 'q' }); lastMove = m; }
    fen = ch.fen();
  }
  if (spec.lastMove) lastMove = spec.lastMove;
  const stm = fen.split(' ')[1];
  const flip = (spec.orient || (stm === 'b' ? 'black' : 'white')) === 'black'; // tahta sırası gelenin gözünden
  const turn = spec.turn === false ? '' : spec.turn || (stm === 'w' ? 'Beyaz oynar' : 'Siyah oynar');
  const turnWhite = spec.turn ? !/siyah/i.test(spec.turn) : stm === 'w';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><radialGradient id="g" cx="50%" cy="0%" r="90%"><stop offset="0" stop-color="${BRAND.bordo}"/><stop offset="0.55" stop-color="#2a0d12"/><stop offset="1" stop-color="${BRAND.ink}"/></radialGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#g)"/>` +
    `<image href="${LOGO}" x="48" y="34" width="120" height="120"/>` +
    `<text x="184" y="86" font-family="Inter" font-weight="800" font-size="30" fill="${BRAND.gold}" letter-spacing="1.5">KÖROĞLU SATRANÇ AKADEMİ</text>`;
  if (spec.tag) svg += `<text x="184" y="126" font-family="Inter" font-weight="600" font-size="25" fill="${BRAND.cream}" letter-spacing="2">${esc(spec.tag.toLocaleUpperCase('tr'))}</text>`;
  let y = 196;
  if (spec.title) {
    const ts = spec.titleSize || 54, lines = wrap(spec.title, ts, W - 120, 800);
    svg += textBlock(lines, 60, y + ts, ts, ts * 1.18, 800, BRAND.cream);
    y += ts * 1.18 * lines.length + 22;
  }
  const textSize = spec.textSize || 34, textLines = spec.text ? wrap(spec.text, textSize, W - 120) : [];
  const below = (spec.choices ? 112 : 0) + (textLines.length ? textLines.length * textSize * 1.35 + 30 : 0);
  const footerH = spec.footer || spec.handle ? 70 : 30, turnH = turn ? 56 : 0;
  const boardSize = Math.min(spec.size === 'story' ? 960 : 860, H - y - turnH - below - footerH - 40);
  const bx = (W - boardSize) / 2;
  if (turn) {
    svg += `<circle cx="${bx + 16}" cy="${y + 20}" r="15" fill="${turnWhite ? '#ffffff' : '#111111'}" stroke="${BRAND.gold}" stroke-width="3"/>` +
      `<text x="${bx + 44}" y="${y + 31}" font-family="Inter" font-weight="600" font-size="31" fill="${BRAND.cream}">${esc(turn)}</text>`;
    if (spec.level) svg += `<text x="${bx + boardSize}" y="${y + 31}" font-family="Inter" font-weight="600" font-size="28" fill="${BRAND.gold}" text-anchor="end">${esc(spec.level)}</text>`;
    y += turnH;
  }
  svg += boardSvg(fen, bx, y + 8, boardSize, { flip, lastMove, marks: spec.marks || [], arrows: spec.arrows || [] });
  y += boardSize + 42;
  if (spec.choices) { svg += pills(spec.choices, y, W); y += 112; }
  if (textLines.length) svg += textBlock(textLines, 60, y + textSize, textSize, textSize * 1.35, 400, BRAND.cream);
  if (spec.footer) svg += `<text x="60" y="${H - 40}" font-family="Inter" font-weight="600" font-size="30" fill="${BRAND.gold}">${esc(spec.footer)}</text>`;
  if (spec.handle) svg += `<text x="${W - 60}" y="${H - 40}" font-family="Inter" font-weight="600" font-size="28" fill="${BRAND.muted}" text-anchor="end">${esc(spec.handle)}</text>`;
  return svg + '</svg>';
}

export const renderPng = (spec) =>
  new Resvg(renderSvg(spec), { font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Inter' } }).render().asPng();

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, outDir = 'out'] = process.argv.slice(2);
  if (!file) { console.error('Kullanım: node render.mjs tarif.json [çıktı-klasörü]'); process.exit(1); }
  mkdirSync(outDir, { recursive: true });
  [].concat(JSON.parse(readFileSync(file, 'utf8'))).forEach((s, i) => {
    const out = join(outDir, s.out || `slayt-${i + 1}.png`);
    writeFileSync(out, renderPng(s));
    console.log(out);
  });
}
