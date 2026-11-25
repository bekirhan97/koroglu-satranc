import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAlerts } from '../web/src/alerts-core.js';

const now = Date.parse('2026-11-26T12:00:00');
const day = (k, n) => ({ key: k, puzzles: n });
test('Uyarılar: iki derstir gelmeyen, çalışmayan, ödevi açmayan, puanı düşen', () => {
  const list = [{ id: 'a', created_at: '2026-10-01' }, { id: 'b', created_at: '2026-10-01' }, { id: 'c', created_at: '2026-11-26T10:00:00' }];
  const reps = {
    a: { activity: { days: [day('2026-11-10', 5), day('2026-11-11', 0)] }, assignments: [], ratings: { puzzles: { history: [[now - 10 * 864e5, 1400], [now - 9 * 864e5, 1420], [now - 5 * 864e5, 1380], [now - 3 * 864e5, 1330], [now - 864e5, 1300]] } } },
    b: { activity: { days: [day('2026-11-25', 3)] }, assignments: [{ id: 'h1', pct: 0.5 }], ratings: { puzzles: { history: [] } } },
  };
  const assignments = [{ id: 'h1', title: 'Çatal', package: { due: now + 864e5 }, assignment_targets: [{ student_id: 'a' }, { student_id: 'b' }] }];
  const sessions = [{ id: 's1', date: '2026-11-15' }, { id: 's2', date: '2026-11-22' }, { id: 's3', date: '2026-11-08' }];
  const attendance = [{ session_id: 's1', student_id: 'a', status: 'gelmedi' }, { session_id: 's2', student_id: 'a', status: 'gelmedi' }, { session_id: 's3', student_id: 'a', status: 'geldi' },
    { session_id: 's1', student_id: 'b', status: 'gelmedi' }, { session_id: 's2', student_id: 'b', status: 'mazeretli' }];
  const out = computeAlerts({ list, reps, assignments, sessions, attendance, now });
  const k = (sid) => out.filter((x) => x.sid === sid).map((x) => x.kind).sort();
  assert.deepEqual(k('a'), ['absent', 'homework', 'inactive', 'rating']);
  assert.deepEqual(k('b'), []);
  assert.deepEqual(k('c'), []); // account opened today: no "never logged in" yet
  assert.match(out.find((x) => x.kind === 'absent').text, /Son 2 derse/);
});
