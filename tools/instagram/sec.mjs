// Gönderi için konum seçer ve hazır carousel tarifi yazar (büyük JSON'ları okumaya gerek kalmaz).
// node sec.mjs strateji  [--seviye 2] [--bolum merkez] [--id st-…] [--adet 3] [--tarif t.json]
// node sec.mjs oyunsonu  [--seviye 1] [--bolum kale]   [--id eg-…] [--adet 3] [--tarif t.json] [--hepsi]
// node sec.mjs bulmaca   [--tema fork] [--puan 1200-1600] [--id 00CFp] [--adet 3] [--tarif t.json]
// --tarif verilince İLK adayın tarifi yazılır ve kimliği kullanilanlar.txt'ye eklenir (bir daha seçilmez).
// --handle "@hesap" tarifin alt satırına hesap adını koyar.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { THEME_TR } from '../../src/renderer/modules/puzzles/themes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const RES = join(HERE, '../../resources');
const USED = join(HERE, 'kullanilanlar.txt');
const LEVELS = ['', 'Başlangıç', 'Temel', 'Orta', 'İyi', 'İleri', 'Usta'];
const FOOTER = 'Cevap bir sonraki slaytta →';

const args = process.argv.slice(2);
const kind = args[0];
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const flag = (k) => args.includes('--' + k);
const n = Number(opt('adet') || 3), handle = opt('handle');
const used = new Set(existsSync(USED) ? readFileSync(USED, 'utf8').split(/\s+/).filter(Boolean) : []);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const TR = { K: 'Ş', Q: 'V', R: 'K', B: 'F', N: 'A' };
const trSan = (san) => san.replace(/[KQRBN]/g, (c) => TR[c]);
const side = (fen) => (fen.split(' ')[1] === 'w' ? 'Beyaz' : 'Siyah');

// UCI hamle dizisini "1.Ad5 Ad4 2.Axf6+" biçiminde Türkçe yazar.
function lineText(fen, ucis, max = 8) {
  const ch = new Chess(fen); let out = '';
  for (const u of ucis.slice(0, max)) {
    const num = ch.moveNumber(), white = ch.turn() === 'w';
    const mv = ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
    out += (white ? `${num}.` : out ? '' : `${num}...`) + trSan(mv.san) + ' ';
  }
  return out.trim();
}

function pick(items, idOf, filter) {
  const id = opt('id');
  if (id) return items.filter((x) => idOf(x) === id);
  return shuffle(items.filter((x) => !used.has(idOf(x)) && filter(x))).slice(0, n);
}

let picked = [], specsOf, idOf;

if (kind === 'strateji') {
  const db = JSON.parse(readFileSync(join(RES, 'strategy.json'), 'utf8'));
  const chName = Object.fromEntries(db.chapters.map((c) => [c.id, c.name]));
  const lv = opt('seviye'), ch = opt('bolum');
  idOf = (x) => x.id;
  picked = pick(db.items, idOf, (x) => (!lv || x.level === Number(lv)) && (!ch || x.ch === ch));
  for (const x of picked) {
    const ok = x.choices.find((c) => c.ok);
    console.log(`\n[${x.id}] ${chName[x.ch]} · Seviye ${x.level} (${LEVELS[x.level]}) · ${side(x.fen)} oynar\n  FEN: ${x.fen}\n  Seçenekler: ${x.choices.map((c, i) => `${i + 1}) ${c.san}${c.ok ? ' ✓' : ''}`).join('  ')}\n  Doğru: ${ok.san} — ${ok.why}\n  Devam: ${lineText(x.fen, x.line)}`);
  }
  specsOf = (x) => {
    const ok = x.choices.find((c) => c.ok);
    const base = { tag: `Strateji · ${chName[x.ch]}`, fen: x.fen, level: `Seviye ${x.level} · ${LEVELS[x.level]}`, handle };
    return [
      { ...base, out: '1-soru.png', title: 'Sen olsan ne oynardın?', choices: x.choices.map((c) => ({ label: c.san })), footer: FOOTER },
      { ...base, out: '2-cevap.png', title: `Doğru cevap: ${ok.san}`, arrows: [[ok.m.slice(0, 2), ok.m.slice(2, 4), 'green']],
        choices: x.choices.map((c) => ({ label: c.san, state: c.ok ? 'ok' : 'bad' })), text: ok.why, textSize: 32 },
    ];
  };
} else if (kind === 'oyunsonu') {
  const db = JSON.parse(readFileSync(join(RES, 'endgames.json'), 'utf8'));
  const chap = Object.fromEntries(db.chapters.map((c) => [c.id, c]));
  const lv = opt('seviye'), ch = opt('bolum');
  idOf = (x) => x.id;
  // Varsayılan: açıklaması konuma özel olanlar ("Konumu tut…" gibi 8'den çok konumda tekrarlanan genel metinler hariç; --hepsi ile dahil).
  const tc = {}; for (const l of db.lessons) tc[l.text] = (tc[l.text] || 0) + 1;
  picked = pick(db.lessons, idOf, (x) => (!lv || x.level === Number(lv)) && (!ch || x.ch === ch) && !x.oppFirst && (flag('hepsi') || tc[x.text] <= 8));
  const goal = (x) => `${side(x.fen)} oynar ve ${x.goal === 'mate' ? 'mat eder' : x.goal === 'win' ? 'kazanır' : 'beraberliği tutar'}`;
  for (const x of picked) console.log(`\n[${x.id}] ${chap[x.ch].name} › ${x.topic} · Seviye ${x.level} (${LEVELS[x.level]})\n  Hedef: ${goal(x)}\n  FEN: ${x.fen}\n  Plan: ${x.text}`);
  specsOf = (x) => {
    const base = { tag: `Oyunsonu · ${x.topic}`, fen: x.fen, level: `Seviye ${x.level} · ${LEVELS[x.level]}`, handle };
    return [
      { ...base, out: '1-soru.png', title: goal(x) + '. Nasıl?', footer: 'Plan bir sonraki slaytta →' },
      { ...base, out: '2-plan.png', title: 'Plan', text: x.text },
    ];
  };
} else if (kind === 'bulmaca') {
  const db = JSON.parse(readFileSync(join(RES, 'puzzles.json'), 'utf8'));
  const tema = opt('tema'); const [lo, hi] = (opt('puan') || '0-9999').split('-').map(Number);
  const ti = tema ? db.themes.indexOf(tema) : -1;
  if (tema && ti < 0) { console.error('Bilinmeyen tema: ' + tema + '\nTemalar: ' + db.themes.join(' ')); process.exit(1); }
  idOf = (p) => p[0];
  picked = pick(db.puzzles, idOf, (p) => p[3] >= lo && p[3] <= hi && (ti < 0 || p[4].includes(ti)));
  const info = (p) => {
    const [id, fen0, mv, rating, th] = p; const moves = mv.split(' ');
    const ch = new Chess(fen0); ch.move({ from: moves[0].slice(0, 2), to: moves[0].slice(2, 4), promotion: moves[0][4] || 'q' });
    const fen = ch.fen(); const themes = th.map((i) => db.themes[i]);
    const mate = themes.find((t) => /^mateIn\d/.test(t));
    const motif = themes.map((t) => THEME_TR[t]).filter((t) => t && !/hamlede mat|^Mat$|Kısa|Uzun|Çok uzun|Avantaj|Ezici|Oyun ortası|Oyun sonu|Açılış|Tek hamle|Usta|GM/.test(t));
    const title = mate ? `${side(fen)} oynar, ${mate.slice(6)} hamlede mat eder` : `${side(fen)} oynar ve kazanır`;
    return { id, fen0, moves, rating, fen, title, motif, sol: lineText(fen, moves.slice(1)) };
  };
  for (const p of picked) { const x = info(p); console.log(`\n[${x.id}] Puan ${x.rating} · ${x.motif.join(', ') || '-'}\n  ${x.title}\n  FEN (sıra çözende): ${x.fen}\n  Çözüm: ${x.sol}`); }
  specsOf = (p) => {
    const x = info(p);
    const base = { tag: `Bulmaca · ${x.motif[0] || 'Taktik'}`, fen: x.fen0, move: x.moves[0], level: `Puan ${x.rating}`, handle };
    return [
      { ...base, out: '1-soru.png', title: x.title, footer: FOOTER },
      { ...base, out: '2-cevap.png', title: `Çözüm: ${x.sol.split(' ')[0].replace(/^\d+\.+/, '')}`, arrows: [[x.moves[1].slice(0, 2), x.moves[1].slice(2, 4), 'green']],
        text: `${x.sol}${x.motif.length ? '\nMotif: ' + x.motif.join(', ') : ''}` },
    ];
  };
} else {
  console.error('Tür: strateji | oyunsonu | bulmaca'); process.exit(1);
}

const out = opt('tarif');
if (!picked.length) console.log('Uygun konum bulunamadı.');
else if (out) {
  writeFileSync(out, JSON.stringify(specsOf(picked[0]), null, 2));
  appendFileSync(USED, idOf(picked[0]) + '\n');
  console.log(`\nTarif yazıldı: ${out} (${idOf(picked[0])} kullanilanlar.txt'ye eklendi)`);
}
