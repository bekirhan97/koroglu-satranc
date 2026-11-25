// Web Worker running Maia inference off the UI thread.
import { loadNet, makeMoveIndex, policyFor } from './maia.js';

const nets = new Map();
let mi = null;

self.onmessage = (e) => {
  const { id, type } = e.data;
  try {
    if (type === 'tables') { mi = makeMoveIndex(e.data.tables); self.postMessage({ id, ok: true }); return; }
    if (type === 'load') { nets.set(e.data.elo, loadNet(e.data.buffer)); self.postMessage({ id, ok: true }); return; }
    if (type === 'policy') {
      const net = nets.get(e.data.elo);
      const pol = policyFor(net, mi, e.data.history, e.data.legal);
      self.postMessage({ id, ok: true, policy: pol.map(({ uci, p }) => ({ uci, p })) });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
