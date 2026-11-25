// Bulmaca seçimi: hedef puanın hem altından hem üstünden eşit dağılımla seçmeli.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pickFrom } from '../src/renderer/modules/puzzles/data.js';

const db = JSON.parse(fs.readFileSync(new URL('../resources/puzzles.json', import.meta.url), 'utf8'));

for (const target of [900, 1500, 2000]) {
  test(`hedef ${target}: puanlar hedefin iki yanına dağılıyor`, () => {
    const rs = [];
    for (let i = 0; i < 600; i++) rs.push(pickFrom(db, { target, seen: new Set() }).rating);
    const above = rs.filter((r) => r > target).length / rs.length;
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    assert.ok(Math.min(...rs) >= target - 75 && Math.max(...rs) <= target + 75, 'pencere ±75');
    assert.ok(above > 0.35 && above < 0.65, `üstte kalan oran ${above}`);
    assert.ok(Math.abs(mean - target) < 15, `ortalama ${mean}`);
  });
}

test('tema filtresi ve görülmüş bulmacalar', () => {
  const p = pickFrom(db, { target: 1500, theme: 'fork', seen: new Set() });
  assert.ok(p.themes.includes('fork'));
  const seen = new Set(db.puzzles.filter((r) => Math.abs(r[3] - 1500) <= 75).map((r) => r[0]));
  const q = pickFrom(db, { target: 1500, seen });
  assert.ok(q && Math.abs(q.rating - 1500) > 75 && Math.abs(q.rating - 1500) <= 150, 'pencere genişliyor');
});

test('birden çok tema (zayıf temalar) ve bilinmeyen tema', () => {
  const p = pickFrom(db, { target: 1500, themes: ['pin', 'skewer'], seen: new Set() });
  assert.ok(p.themes.includes('pin') || p.themes.includes('skewer'));
  assert.equal(pickFrom(db, { target: 1500, theme: 'yokboyletema', seen: new Set() }), null);
});
