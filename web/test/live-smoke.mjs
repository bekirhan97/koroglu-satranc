import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('https://bekirhan97.github.io/koroglu-satranc/'); await p.waitForSelector('.login-card', { timeout: 30000 });
const r = await p.evaluate(async () => {
  const e = await window.api.analyse({ fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4', depth: 10 }, 0);
  const w = new Worker('maia-worker.js', { type: 'module' });
  const call = (m, tr) => new Promise((ok, no) => { w.onmessage = (x) => x.data.ok ? ok(x.data) : no(new Error(x.data.error)); w.postMessage({ ...m, id: 1 }, tr || []); });
  await call({ type: 'tables', tables: await window.api.maiaTables() });
  const bb = await window.api.maiaWeights(1100); const buf = bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.byteLength);
  await call({ type: 'load', elo: 1100, buffer: buf }, [buf]);
  const m = await call({ type: 'policy', elo: 1100, history: ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'], legal: ['e2e4', 'd2d4', 'g1f3'] });
  return { sf: e.bestmove, maia: m.policy[0].uci, title: document.querySelector('.login-card h1').textContent };
});
console.log(r, errs);
await b.close();
