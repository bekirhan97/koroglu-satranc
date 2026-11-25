// Testlerde tarayıcı yok: renderer modüllerinin beklediği window.api'yi bellekte taklit et.
const mem = new Map();
globalThis.window = globalThis.window || {
  api: {
    read: async (k, f) => (mem.has(k) ? structuredClone(mem.get(k)) : f),
    write: async (k, v) => { mem.set(k, structuredClone(v)); return true; },
    remove: async (k) => { mem.delete(k); return true; },
    appInfo: async () => ({ version: '0.3.0-test' }),
    puzzles: async () => (await import('node:fs')).readFileSync(new URL('../resources/puzzles.json', import.meta.url), 'utf8'),
  },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
};
globalThis.__mem = mem;
