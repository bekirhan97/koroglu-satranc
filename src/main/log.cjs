// Error log: userData/logs/koroglu.log, rotated at 1 MB (one old copy kept as koroglu.1.log).
const fs = require('node:fs');
const path = require('node:path');

const MAX = 1024 * 1024;
let dir = null;

function init(logDir) {
  dir = logDir;
  fs.mkdirSync(dir, { recursive: true });
}

const file = () => path.join(dir, 'koroglu.log');

function fmt(x) {
  if (x instanceof Error) return x.stack || `${x.name}: ${x.message}`;
  if (typeof x === 'string') return x;
  try { return JSON.stringify(x); } catch { return String(x); }
}

function write(level, ...parts) {
  if (!dir) return;
  const line = `${new Date().toISOString()} [${level}] ${parts.map(fmt).join(' ')}\n`;
  try {
    const f = file();
    try { if (fs.statSync(f).size > MAX) fs.renameSync(f, path.join(dir, 'koroglu.1.log')); } catch {}
    fs.appendFileSync(f, line);
  } catch {}
  if (level === 'HATA') console.error(line.trim());
}

const log = {
  init,
  info: (...a) => write('BILGI', ...a),
  warn: (...a) => write('UYARI', ...a),
  error: (...a) => write('HATA', ...a),
  // Last ~400 KB of the log (old copy first), for the error report.
  tail(limit = 400 * 1024) {
    let out = '';
    for (const f of [path.join(dir, 'koroglu.1.log'), file()]) { try { out += fs.readFileSync(f, 'utf8'); } catch {} }
    return out.length > limit ? out.slice(-limit) : out;
  },
  dir: () => dir,
};

module.exports = { log };
