import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.document = globalThis.document || { createElement: () => ({}) };
const { canMate, fmtClock, tcLabel } = await import('../src/renderer/modules/play/index.js').catch((e) => { console.error(e); throw e; });

test('süre bitince: rakip mat edemiyorsa berabere', () => {
  assert.equal(canMate('8/8/8/4k3/8/8/8/4K2N w - - 0 1', 'w'), false, 'tek at');
  assert.equal(canMate('8/8/8/4k3/8/8/8/3BK2N w - - 0 1', 'w'), true, 'fil + at');
  assert.equal(canMate('8/8/8/4k3/8/8/4P3/4K3 w - - 0 1', 'w'), true, 'piyon');
  assert.equal(canMate('8/8/8/4k3/8/8/4P3/4K3 w - - 0 1', 'b'), false, 'yalnız şah');
});
test('saat gösterimi', () => {
  assert.equal(fmtClock(600000), '10:00');
  assert.equal(fmtClock(65001), '1:06');
  assert.equal(fmtClock(9450), '9.4');
  assert.equal(fmtClock(-5), '0.0');
  assert.equal(tcLabel({ base: 10, inc: 5 }), '10+5');
  assert.equal(tcLabel(null), 'Saatsiz');
});
