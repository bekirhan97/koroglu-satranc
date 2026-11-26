import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodRange, studentRow, summarize, groupRows, toCsv } from '../web/src/study-core.js';

const now = new Date(2026, 10, 26, 10).getTime(); // 26 Kasım 2026
test('Dönemler', () => {
  assert.deepEqual(periodRange('today', now), { from: '2026-11-26', to: '2026-11-26' });
  assert.deepEqual(periodRange('d3', now), { from: '2026-11-24', to: '2026-11-26' });
  assert.deepEqual(periodRange('d15', now), { from: '2026-11-12', to: '2026-11-26' });
  assert.deepEqual(periodRange('month', now), { from: '2026-11-01', to: '2026-11-26' });
  assert.deepEqual(periodRange('prevMonth', now), { from: '2026-10-01', to: '2026-10-31' });
});

test('Öğrenci ve grup toplamları', () => {
  const rep = (days) => ({ activity: { days } });
  const a = studentRow({ id: 'a', display_name: 'Ali', group_name: 'Cmt 10' }, rep([
    { key: '2026-11-20', puzzles: 30 }, { key: '2026-11-25', puzzles: 10, videos: 1 }, { key: '2026-11-26', gtmGames: 2 },
  ]), { from: '2026-11-24', to: '2026-11-26', scores: [{ student_id: 'a' }, { student_id: 'b' }],
    attendance: [{ student_id: 'a', status: 'geldi', date: '2026-11-25' }, { student_id: 'a', status: 'gelmedi', date: '2026-11-01' }] });
  assert.equal(a.puzzles, 10); assert.equal(a.videos, 1); assert.equal(a.gtmGames, 2); assert.equal(a.days, 2);
  assert.equal(a.speed, 1); assert.equal(a.lessonsCame, 1); assert.equal(a.lessonsTotal, 1);
  const b = studentRow({ id: 'b', display_name: 'Ayşe', group_name: 'Cmt 10' }, null, { from: '2026-11-24', to: '2026-11-26' });
  assert.equal(b.puzzles, 0); assert.equal(b.hasReport, false);
  const s = summarize([a, b]);
  assert.equal(s.total.puzzles, 10); assert.equal(s.avg.puzzles, 5); assert.equal(s.total.lessons, 1);
  assert.equal(groupRows([a, b])[0].sum.n, 2);
  assert.match(toCsv([a, b], 'Son 3 gün'), /"Ali";"Cmt 10";"10"/);
});

test('Birden çok grup ve özel ders alan öğrenci her grupta sayılır', () => {
  const c = studentRow({ id: 'c', display_name: 'Can', group_name: 'Cmt 10', groups: ['Cmt 10', 'Sal 18'], hasOzel: true }, null, { from: '2026-11-24', to: '2026-11-26' });
  const d = studentRow({ id: 'd', display_name: 'Deniz', group_name: 'Cmt 10' }, null, { from: '2026-11-24', to: '2026-11-26' });
  assert.equal(c.group, 'Cmt 10 · Sal 18 · Özel ders');
  const g = Object.fromEntries(groupRows([c, d]).map((x) => [x.name, x.sum.n]));
  assert.deepEqual(g, { 'Cmt 10': 2, 'Sal 18': 1, 'Özel ders': 1 });
});
