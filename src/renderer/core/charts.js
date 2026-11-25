// Small SVG/HTML charts shared by module statistics pages.
import { h, fmtDate } from './dom.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  kids.flat().forEach((k) => k && el.append(k instanceof Node ? k : document.createTextNode(k)));
  return el;
};

export function ratingChart(history) {
  const W = 760, H = 240, P = { l: 48, r: 16, t: 16, b: 28 };
  if (history.length < 2) return h('div.empty.small', 'Grafik için en az birkaç puanlı hamle gerekiyor.');
  // downsample to at most 400 points
  const step = Math.ceil(history.length / 400);
  const pts = history.filter((_, i) => i % step === 0 || i === history.length - 1);
  const ys = pts.map((p) => p[1]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const pad = Math.max(20, (hi - lo) * 0.1); lo -= pad; hi += pad;
  const x = (i) => P.l + (i / (pts.length - 1)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const ticks = 4;
  const grid = [];
  for (let i = 0; i <= ticks; i++) {
    const v = lo + ((hi - lo) * i) / ticks;
    grid.push(s('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'grid' }));
    grid.push(s('text', { x: P.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' }, Math.round(v)));
  }
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' },
    grid,
    s('path', { d, class: 'line' }),
    s('circle', { cx: x(pts.length - 1), cy: y(last[1]), r: 4, class: 'dot' }),
    s('text', { x: P.l, y: H - 8, class: 'axis' }, fmtDate(pts[0][0])),
    s('text', { x: W - P.r, y: H - 8, 'text-anchor': 'end', class: 'axis' }, fmtDate(last[0])));
}

export function barChart(rows, { max, fmt = (v) => v.toFixed(1) }) {
  return h('div.bars', rows.map((r) => h('div.bar-row',
    h('span.bar-label', r.label),
    h('span.bar-track', h('span.bar-fill', { style: { width: `${max ? (100 * r.value) / max : 0}%` } })),
    h('span.bar-val', r.n ? `${fmt(r.value)} (${r.n})` : '–'))));
}

