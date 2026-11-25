// Testlerde tarayıcı yok: renderer modüllerinin beklediği window.api'yi bellekte taklit et.
const mem = new Map();
globalThis.window = globalThis.window || {
  api: {
    read: async (k, f) => (mem.has(k) ? structuredClone(mem.get(k)) : f),
    write: async (k, v) => { mem.set(k, structuredClone(v)); return true; },
    remove: async (k) => { mem.delete(k); return true; },
  },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
};
globalThis.__mem = mem;
