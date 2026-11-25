// UCI engine manager: one native Stockfish process, a priority job queue.
// Each job: { fen, depth, multipv, searchmoves[], movetime } -> { lines:[{uci, cp, mate, depth, pv}], bestmove }
// Scores are from the side-to-move point of view. Mate scores are mapped to +-(100000 - plies).
const { spawn } = require('node:child_process');
const os = require('node:os');

const MATE_BASE = 100000;

class UciEngine {
  constructor(binPath, opts = {}) {
    this.binPath = binPath;
    this.threads = opts.threads || Math.max(1, Math.min(4, os.cpus().length - 1));
    this.hash = opts.hash || 128;
    this.queue = [];
    this.current = null;
    this.proc = null;
    this.buf = '';
    this.readyWaiters = [];
    this.name = '';
    this.seq = 0;
    this.startPromise = null;
  }

  start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = new Promise((resolve, reject) => {
      try {
        this.proc = spawn(this.binPath, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      } catch (e) { reject(e); return; }
      this.proc.on('error', (e) => { this.failAll(e); reject(e); });
      this.proc.on('exit', () => {
        this.failAll(new Error('Motor kapandı'));
        this.proc = null;
        this.startPromise = null;
      });
      this.proc.stdout.on('data', (d) => this.onData(d.toString()));
      this.send('uci');
      this.uciOk = () => {
        this.send(`setoption name Threads value ${this.threads}`);
        this.send(`setoption name Hash value ${this.hash}`);
        this.isReady().then(resolve, reject);
      };
    });
    return this.startPromise;
  }

  send(cmd) { if (this.proc) this.proc.stdin.write(cmd + '\n'); }

  isReady() {
    return new Promise((resolve) => { this.readyWaiters.push(resolve); this.send('isready'); });
  }

  failAll(err) {
    if (this.current) { this.current.reject(err); this.current = null; }
    for (const j of this.queue) j.reject(err);
    this.queue = [];
  }

  onData(chunk) {
    this.buf += chunk;
    let idx;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (line) this.onLine(line);
    }
  }

  onLine(line) {
    if (line.startsWith('id name ')) { this.name = line.slice(8); return; }
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
      const kind = t[si + 1];
      const val = +t[si + 2];
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

  // priority: 0 = urgent (user waiting), 1 = normal, 2 = background
  analyse(req, priority = 1, onInfo) {
    return new Promise((resolve, reject) => {
      const job = { ...req, priority, resolve, reject, lines: [], id: ++this.seq, onInfo };
      this.queue.push(job);
      this.queue.sort((a, b) => a.priority - b.priority || a.id - b.id);
      this.start().then(() => this.pump(), reject);
    });
  }

  // Cancel queued jobs with a given tag (e.g. leaving a screen).
  cancelTag(tag) {
    const keep = [];
    for (const j of this.queue) {
      if (j.tag === tag) j.reject(new Error('cancelled')); else keep.push(j);
    }
    this.queue = keep;
    if (this.current && this.current.tag === tag) this.send('stop');
  }

  pump() {
    if (this.current || !this.proc || this.uciOk) return;
    const job = this.queue.shift();
    if (!job) return;
    this.current = job;
    // Per-job UCI options (e.g. weakened play). Analysis jobs always run at full strength.
    const opts = { 'Skill Level': 20, MultiPV: job.multipv || 1, ...(job.options || {}) };
    this.opts = this.opts || {};
    for (const [k, v] of Object.entries(opts)) {
      if (this.opts[k] !== v) { this.send(`setoption name ${k} value ${v}`); this.opts[k] = v; }
    }
    this.send(`position fen ${job.fen}`);
    let go = 'go';
    if (job.depth) go += ` depth ${job.depth}`;
    if (job.movetime) go += ` movetime ${job.movetime}`;
    if (job.nodes) go += ` nodes ${job.nodes}`;
    if (job.searchmoves && job.searchmoves.length) go += ` searchmoves ${job.searchmoves.join(' ')}`;
    this.send(go);
  }

  quit() { try { this.send('quit'); } catch {} }
}

module.exports = { UciEngine, MATE_BASE };
