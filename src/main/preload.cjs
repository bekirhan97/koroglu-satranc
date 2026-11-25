const { contextBridge, ipcRenderer } = require('electron');

const streams = new Map();
ipcRenderer.on('engine:info', (_e, id, lines) => { const s = streams.get(id); if (s && s.onInfo) s.onInfo(lines); });
ipcRenderer.on('engine:done', (_e, id, res) => { const s = streams.get(id); if (s) { streams.delete(id); s.resolve(res); } });
let sid = 0;

contextBridge.exposeInMainWorld('api', {
  read: (name, fallback) => ipcRenderer.invoke('store:read', name, fallback),
  write: (name, data) => ipcRenderer.invoke('store:write', name, data),
  remove: (name) => ipcRenderer.invoke('store:delete', name),
  openings: () => ipcRenderer.invoke('res:openings'),
  puzzles: () => ipcRenderer.invoke('res:puzzles'),
  maiaWeights: (elo) => ipcRenderer.invoke('res:maia', elo),
  maiaTables: () => ipcRenderer.invoke('res:maiaTables'),
  copyText: (t) => navigator.clipboard.writeText(t),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  openPgn: () => ipcRenderer.invoke('dialog:openPgn'),
  analyse: (req, priority) => ipcRenderer.invoke('engine:analyse', req, priority),
  analyseStream: (req, priority, onInfo) => new Promise((resolve) => {
    const id = ++sid; streams.set(id, { resolve, onInfo });
    ipcRenderer.send('engine:stream', id, req, priority);
  }),
  cancel: (tag) => ipcRenderer.invoke('engine:cancel', tag),
  restartEngine: () => ipcRenderer.invoke('engine:restart'),
  engineInfo: () => ipcRenderer.invoke('engine:info'),
  appInfo: () => ipcRenderer.invoke('app:info'),
  openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
});
