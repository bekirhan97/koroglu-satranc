// Renderer-side engine client (talks to the native Stockfish in the main process).
export const PRIORITY = { URGENT: 0, NORMAL: 1, BACKGROUND: 2 };

export async function analyse(req, priority = PRIORITY.NORMAL) {
  const res = await window.api.analyse(req, priority);
  if (res && res.error) throw new Error(res.error);
  return res;
}

export function analyseStream(req, priority, onInfo) {
  return window.api.analyseStream(req, priority, onInfo);
}

export function cancel(tag) { return window.api.cancel(tag); }
