const { contextBridge, ipcRenderer } = require('electron');

const streams = new Map();
ipcRenderer.on('engine:info', (_e, id, lines) => { const s = streams.get(id); if (s && s.onInfo) s.onInfo(lines); });
ipcRenderer.on('engine:done', (_e, id, res) => { const s = streams.get(id); if (s) { streams.delete(id); s.resolve(res); } });
let sid = 0;

const listen = (channel) => (fn) => { const f = (_e, ...a) => fn(...a); ipcRenderer.on(channel, f); return () => ipcRenderer.removeListener(channel, f); };

contextBridge.exposeInMainWorld('api', {
  read: (name, fallback) => ipcRenderer.invoke('store:read', name, fallback),
  write: (name, data) => ipcRenderer.invoke('store:write', name, data),
  remove: (name) => ipcRenderer.invoke('store:delete', name),
  openings: () => ipcRenderer.invoke('res:openings'),
  miniatures: () => ipcRenderer.invoke('res:miniatures'),
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

  log: (level, msg) => ipcRenderer.invoke('log:write', level, msg),
  saveErrorReport: () => ipcRenderer.invoke('log:saveReport'),

  backupExport: () => ipcRenderer.invoke('backup:export'),
  backupPick: () => ipcRenderer.invoke('backup:pick'),
  backupList: () => ipcRenderer.invoke('backup:list'),
  backupRestore: (p) => ipcRenderer.invoke('backup:restore', p),
  backupNow: () => ipcRenderer.invoke('backup:now'),
  backupChooseDir: () => ipcRenderer.invoke('backup:chooseDir'),
  backupResetDir: () => ipcRenderer.invoke('backup:resetDir'),
  backupOpenDir: () => ipcRenderer.invoke('backup:openDir'),

  saveFile: (kind, name, data) => ipcRenderer.invoke('file:save', kind, name, data),
  openFiles: (kind) => ipcRenderer.invoke('file:open', kind),
  takeFiles: () => ipcRenderer.invoke('app:takeFiles'),
  lichessGames: (user, max) => ipcRenderer.invoke('lichess:games', user, max),
  savePdf: (html, name) => ipcRenderer.invoke('pdf:save', html, name),
  showFile: (p) => ipcRenderer.invoke('app:showFile', p),
  onFilesWaiting: listen('app:filesWaiting'),

  updateState: () => ipcRenderer.invoke('update:state'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  onUpdateState: listen('update:state'),
});
