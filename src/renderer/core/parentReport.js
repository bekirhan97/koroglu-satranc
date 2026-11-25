// One-page A4 report for parents, built from a student's progress report (.krapor) in teacher mode.
// Returns a self-contained HTML document; the main process prints it to PDF.
import { themeName } from '../modules/puzzles/themes.js';
import { BADGES } from './badges.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const dateTR = (t) => new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const DAY = 86400e3;

function lineChart(points, { w = 330, h = 120 } = {}) {
  if (points.length < 2) return '<div class="none">Yeterli veri yok</div>';
  const xs = points.map((p) => p.t), ys = points.map((p) => p.r);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - 20, y1 = Math.max(...ys) + 20;
  const X = (t) => 30 + ((t - x0) / Math.max(1, x1 - x0)) * (w - 40), Y = (r) => 10 + (1 - (r - y0) / Math.max(1, y1 - y0)) * (h - 30);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.r).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <text x="2" y="${Y(y1 - 20) + 4}" class="ax">${Math.round(y1 - 20)}</text><text x="2" y="${Y(y0 + 20) + 4}" class="ax">${Math.round(y0 + 20)}</text>
    <line x1="30" x2="${w - 10}" y1="${h - 20}" y2="${h - 20}" class="base"/>
    <path d="${d}" class="line"/><circle cx="${X(last.t)}" cy="${Y(last.r)}" r="3.5" class="dot"/>
    <text x="30" y="${h - 5}" class="ax">${new Date(x0).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</text>
    <text x="${w - 10}" y="${h - 5}" class="ax" text-anchor="end">${new Date(x1).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</text></svg>`;
}

function dayBars(days, { w = 330, h = 120 } = {}) {
  const val = (d) => (d.puzzles || 0) + (d.reviews || 0) + (d.openings || 0) + (d.gtmMoves || 0) / 5 + (d.playGames || 0) * 3;
  const max = Math.max(1, ...days.map(val));
  const bw = (w - 10) / days.length;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${days.map((d, i) => {
    const v = val(d), bh = v ? 4 + ((h - 30) * v) / max : 0;
    return `<rect x="${5 + i * bw + 1}" y="${h - 20 - bh}" width="${bw - 2}" height="${bh}" rx="2" class="bar"/>`;
  }).join('')}<line x1="5" x2="${w - 5}" y1="${h - 20}" y2="${h - 20}" class="base"/>
  <text x="5" y="${h - 5}" class="ax">${new Date(days[0].key).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</text>
  <text x="${w - 5}" y="${h - 5}" class="ax" text-anchor="end">bugün</text></svg>`;
}

export function parentReportHtml(r, { note = '', teacher = '', logo = '' } = {}) {
  const now = r.createdAt;
  const days = r.activity.days.slice(-28);
  const studied = days.filter((d) => (d.puzzles || 0) + (d.reviews || 0) + (d.openings || 0) + (d.gtmMoves || 0) + (d.playGames || 0) > 0).length;
  const solved28 = days.reduce((a, d) => a + (d.puzzles || 0) + (d.reviews || 0), 0);
  const ph = (r.ratings.puzzles.history || []).filter((p) => p.t >= now - 90 * DAY);
  const before = (r.ratings.puzzles.history || []).filter((p) => p.t <= now - 28 * DAY).pop();
  const change = before ? r.ratings.puzzles.r - Math.round(before.r) : null;
  const strong = r.puzzles.themes.filter((t) => t.verdict === 'guclu').sort((a, b) => b.diff - a.diff).slice(0, 3);
  const weak = r.puzzles.themes.filter((t) => t.verdict === 'zayif').sort((a, b) => a.diff - b.diff).slice(0, 3);
  const exams = Object.values(r.exams || {}).filter((e) => e.finishedAt).sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 3);
  const badges = BADGES.filter((b) => (r.badges || {})[b.id]);
  const asg = (r.assignments || []).slice(-4);
  const card = (k, v, sub) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Inter, Arial, sans-serif; color: #2a2420; font-size: 11.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; height: 297mm; padding: 14mm 15mm 12mm; display: flex; flex-direction: column; gap: 5mm; }
  header { display: flex; align-items: center; gap: 5mm; border-bottom: 2px solid #d9a84b; padding-bottom: 4mm; }
  header img { width: 26mm; height: 26mm; object-fit: contain; }
  header h1 { margin: 0; font-size: 17pt; color: #7a1426; }
  header .sub { color: #6d625a; font-size: 10.5pt; margin-top: 1mm; }
  header .who { margin-left: auto; text-align: right; }
  header .who b { font-size: 15pt; display: block; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; }
  .card { border: 1px solid #e6ddcf; border-radius: 3mm; padding: 3mm; background: #fbf8f2; }
  .card .k { font-size: 9pt; color: #6d625a; }
  .card .v { font-size: 19pt; font-weight: 800; color: #7a1426; }
  .card .s { font-size: 9pt; color: #6d625a; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: .6px; color: #6d625a; margin: 0 0 2mm; }
  .box { border: 1px solid #e6ddcf; border-radius: 3mm; padding: 3mm 4mm; }
  svg .line { fill: none; stroke: #7a1426; stroke-width: 2.2; } svg .dot { fill: #7a1426; }
  svg .bar { fill: #d9a84b; } svg .base { stroke: #cfc5b6; } svg .ax { font-size: 9px; fill: #8a8078; }
  ul { margin: 0; padding-left: 5mm; } li { margin: .8mm 0; }
  .good { color: #2f7d4f; } .bad { color: #a33a2c; } .none { color: #8a8078; font-size: 10pt; }
  .note { border-left: 3px solid #d9a84b; background: #faf5ea; padding: 3mm 4mm; border-radius: 2mm; white-space: pre-wrap; }
  .badges span { display: inline-block; margin: 0 2mm 1.5mm 0; padding: .8mm 2.5mm; border: 1px solid #d9a84b; border-radius: 3mm; background: #fff8e8; font-size: 9.5pt; }
  .bar2 { display: inline-block; width: 30mm; height: 2.4mm; background: #efe9df; border-radius: 1.2mm; vertical-align: middle; margin-left: 2mm; overflow: hidden; }
  .bar2 i { display: block; height: 100%; background: #7a1426; }
  footer { margin-top: auto; font-size: 8.5pt; color: #8a8078; display: flex; justify-content: space-between; border-top: 1px solid #e6ddcf; padding-top: 2mm; }
  </style></head><body><div class="page">
  <header>${logo ? `<img src="${logo}">` : ''}<div><h1>Veli Bilgilendirme Raporu</h1><div class="sub">Köroğlu Satranç Akademi · ${dateTR(now)} · son 4 hafta</div></div>
    <div class="who"><b>${esc(r.student.name)}</b>${teacher ? `<span class="sub">Öğretmen: ${esc(teacher)}</span>` : ''}</div></header>
  <div class="cards">
    ${card('Bulmaca puanı', r.ratings.puzzles.r, change == null ? '' : `<span class="${change >= 0 ? 'good' : 'bad'}">${change >= 0 ? '▲ +' : '▼ '}${change}</span> son 4 haftada`)}
    ${card('Çalıştığı gün', `${studied}<span style="font-size:11pt">/28</span>`, `en uzun seri ${r.activity.streak.best} gün`)}
    ${card('Çözülen bulmaca', solved28, 'son 4 haftada')}
    ${card('Usta oyunu tahmini', r.ratings.gtm.r, `${r.gtm.played} oyun tamamlandı`)}
  </div>
  <div class="row">
    <div class="box"><h2>Bulmaca puanı gelişimi</h2>${lineChart(ph)}</div>
    <div class="box"><h2>Günlük çalışma (son 28 gün)</h2>${dayBars(days)}</div>
  </div>
  <div class="row">
    <div class="box"><h2>Güçlü olduğu konular</h2>${strong.length ? `<ul>${strong.map((t) => `<li class="good">${esc(themeName(t.theme))}</li>`).join('')}</ul>` : '<div class="none">Henüz belirgin değil.</div>'}</div>
    <div class="box"><h2>Üzerinde çalışılacak konular</h2>${weak.length ? `<ul>${weak.map((t) => `<li class="bad">${esc(themeName(t.theme))}</li>`).join('')}</ul>` : '<div class="none">Belirgin bir zayıf konu yok.</div>'}</div>
  </div>
  <div class="row">
    <div class="box"><h2>Ödevler</h2>${asg.length ? `<ul>${asg.map((a) => `<li>${esc(a.title)} <span class="bar2"><i style="width:${Math.round(100 * a.pct)}%"></i></span> %${Math.round(100 * a.pct)}</li>`).join('')}</ul>` : '<div class="none">Bu dönemde ödev yok.</div>'}
      ${exams.length ? `<h2 style="margin-top:3mm">Sınavlar</h2><ul>${exams.map((e) => `<li>${esc(e.title)}: <b>${e.score}</b> puan</li>`).join('')}</ul>` : ''}</div>
    <div class="box"><h2>Rozetler (${badges.length}/${BADGES.length})</h2>${badges.length ? `<div class="badges">${badges.map((b) => `<span>${b.icon} ${esc(b.name)}</span>`).join('')}</div>` : '<div class="none">Henüz rozet yok.</div>'}</div>
  </div>
  ${note ? `<div><h2>Öğretmenin notu</h2><div class="note">${esc(note)}</div></div>` : ''}
  <footer><span>Bu rapor Köroğlu Satranç uygulamasında öğrencinin ${dateTR(now)} tarihli ilerleme raporundan hazırlanmıştır.</span><span>Köroğlu Satranç Akademi</span></footer>
  </div></body></html>`;
}
