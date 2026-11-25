// Stockfish in the browser (stockfish.js 19 "lite single-threaded" WASM in a Web Worker).
// Same job interface as the desktop's main-process engine (src/main/engine.cjs):
//   analyse({ fen, depth, multipv, searchmoves, movetime, nodes, options, tag }, priority, onInfo)
//   → { lines: [{ uci, cp, mate, depth, pv }], bestmove }   (scores from the side to move)
const MATE_BASE = 100000;
const ENGINE_URL = 'engine/stockfish-19-lite-single.js';

class BrowserEngine {
  constructor() {
    this.queue = []; this.current = null; this.worker = null; this.readyWaiters = [];
    this.name = 'Stockfish 19 (tarayıcı)'; this.seq = 0; this.startPromise = null; this.opts = {};
  }
  start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = new Promise((resolve, reject) => {
      try { this.worker = new Worker(ENGINE_URL); } catch (e) { this.startPromise = null; reject(e); return; }
      this.worker.onmessage = (e) => { const d = typeof e.data === 'string' ? e.data : String(e.data); for (const l of d.split('\n')) if (l.trim()) this.onLine(l.trim()); };
      this.worker.onerror = (e) => { const err = new Error('Motor yüklenemedi: ' + (e.message || '')); this.failAll(err); this.worker = null; this.startPromise = null; reject(err); };
      this.uciOk = () => { this.send('setoption name Hash value 32'); this.isReady().then(resolve, reject); };
      this.send('uci');
    });
    return this.startPromise;
  }
  send(cmd) { if (this.worker) this.worker.postMessage(cmd); }
  isReady() { return new Promise((resolve) => { this.readyWaiters.push(resolve); this.send('isready'); }); }
  failAll(err) {
    if (this.current) { this.current.reject(err); this.current = null; }
    for (const j of this.queue) j.reject(err);
    this.queue = [];
  }
  onLine(line) {
    if (line.startsWith('id name ')) { this.name = line.slice(8) + ' (tarayıcı)'; return; }
    if (line === 'uciok') { if (this.uciOk) { const f = this.uciOk; this.uciOk = null; f(); } return; }
    if (line === 'readyok') { const w = this.readyWaiters.shift(); if (w) w(); return; }
    const job = this.current;
    if (!job) return;
    if (line.startsWith('info ') && line.includes(' pv ') && line.includes(' score ')) {
      const t = line.split(' ');
      const get = (k) => { const i = t.indexOf(k); return i >= 0 ? t[i + 1] : undefined; };
      const depth = +get('depth');
      const mpv = +(get('multipv') || 1);
      const si = t.indexOf('score');
      const kind = t[si + 1], val = +t[si + 2];
      if (t[si + 3] === 'lowerbound' || t[si + 3] === 'upperbound') return;
      const pv = t.slice(t.indexOf('pv') + 1);
      const cp = kind === 'mate' ? (val > 0 ? MATE_BASE - val : -MATE_BASE - val) : val;
      job.lines[mpv - 1] = { uci: pv[0], cp, mate: kind === 'mate' ? val : null, depth, pv: pv.slice(0, 12) };
      if (job.onInfo && depth >= 8) job.onInfo(job.lines.filter(Boolean));
      return;
    }
    if (line.startsWith('bestmove')) {
      const best = line.split(' ')[1];
      this.current = null;
      job.resolve({ lines: job.lines.filter(Boolean), bestmove: best });
      this.pump();
    }
  }
  analyse(req, priority = 1, onInfo) {
    return new Promise((resolve, reject) => {
      const job = { ...req, priority, resolve, reject, lines: [], id: ++this.seq, onInfo };
      this.queue.push(job);
      this.queue.sort((a, b) => a.priority - b.priority || a.id - b.id);
      this.start().then(() => this.pump(), reject);
    });
  }
  cancelTag(tag) {
    const keep = [];
    for (const j of this.queue) { if (j.tag === tag) j.reject(new Error('cancelled')); else keep.push(j); }
    this.queue = keep;
    if (this.current && this.current.tag === tag) this.send('stop');
  }
  pump() {
    if (this.current || !this.worker || this.uciOk) return;
    const job = this.queue.shift();
    if (!job) return;
    this.current = job;
    const opts = { 'Skill Level': 20, MultiPV: job.multipv || 1, ...(job.options || {}) };
    for (const [k, v] of Object.entries(opts)) {
      if (this.opts[k] !== v) { this.send(`setoption name ${k} value ${v}`); this.opts[k] = v; }
    }
    this.send(`position fen ${job.fen}`);
    // Phones are slow: cap very deep searches so nobody waits a minute per position.
    let go = 'go';
    if (job.depth) go += ` depth ${Math.min(job.depth, 22)}`;
    if (job.movetime) go += ` movetime ${job.movetime}`;
    if (job.nodes) go += ` nodes ${job.nodes}`;
    if (!job.movetime && !job.nodes && job.depth > 12) go += ` movetime ${job.depth >= 18 ? 4000 : 2500}`;
    if (job.searchmoves && job.searchmoves.length) go += ` searchmoves ${job.searchmoves.join(' ')}`;
    this.send(go);
  }
}

export const engine = new BrowserEngine();
