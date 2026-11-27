// Öne çıkan hikâye kapakları (1080×1920; Instagram ortadaki daireyi gösterir).
// node kapak.mjs [çıktı-klasörü]  → kapak-kayit.png, kapak-basarilar.png, kapak-bulmacalar.png, kapak-hocalarimiz.png
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { BRAND, PIECES, FONT_FILES } from './render.mjs';

const KAPAKLAR = [['kayit', 'bknight', 'KAYIT'], ['basarilar', 'bking', 'BAŞARILAR'], ['bulmacalar', 'bqueen', 'BULMACA'], ['hocalarimiz', 'brook', 'HOCALAR']];
const out = process.argv[2] || 'out';
mkdirSync(out, { recursive: true });
for (const [ad, tas, yazi] of KAPAKLAR) {
  const cx = 540, cy = 960, R = 400;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
<defs><radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="${BRAND.bordo}"/><stop offset="1" stop-color="${BRAND.ink}"/></radialGradient></defs>
<rect width="1080" height="1920" fill="url(#g)"/>
<circle cx="${cx}" cy="${cy}" r="${R}" fill="${BRAND.bordoDark}" stroke="${BRAND.gold}" stroke-width="22"/>
<circle cx="${cx}" cy="${cy}" r="${R - 40}" fill="none" stroke="${BRAND.gold}" stroke-width="4" stroke-opacity="0.6"/>
<circle cx="${cx}" cy="${cy - 40}" r="215" fill="${BRAND.gold}"/>
<image href="${PIECES[tas]}" x="${cx - 190}" y="${cy - 230}" width="380" height="380"/>
<text x="${cx}" y="${cy + 270}" font-family="Inter" font-weight="800" font-size="62" fill="${BRAND.gold}" text-anchor="middle" letter-spacing="4">${yazi}</text>
</svg>`;
  const png = new Resvg(svg, { font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Inter' } }).render().asPng();
  const f = join(out, `kapak-${ad}.png`);
  writeFileSync(f, png);
  console.log(f);
}
