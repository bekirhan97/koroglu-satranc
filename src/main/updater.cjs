// Updates from GitHub Releases (bekirhan97/koroglu-satranc).
//  - Windows (NSIS install): electron-updater downloads in the background and installs on restart/quit.
//  - macOS (unsigned, so Squirrel.Mac cannot install): compare with the latest release and offer a download link.
const { app, net } = require('electron');
const { log } = require('./log.cjs');

const OWNER = 'bekirhan97';
const REPO = 'koroglu-satranc';
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases/latest`;

let send = () => {};
let state = { status: 'idle' };
let autoUpdater = null;

function setState(s) { state = { ...s, current: app.getVersion() }; send(state); }

// "0.3.0" > "0.2.10"? (ignores pre-release tags)
function newer(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

async function checkMac() {
  setState({ status: 'checking' });
  try {
    const r = await net.fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('GitHub yanıtı: ' + r.status);
    const rel = await r.json();
    const v = String(rel.tag_name || '').replace(/^v/, '');
    if (v && newer(v, app.getVersion())) {
      const arch = process.arch === 'arm64' ? 'AppleSilicon' : 'Intel';
      const asset = (rel.assets || []).find((a) => a.name.includes('Mac') && a.name.includes(arch));
      setState({ status: 'manual', version: v, url: asset ? asset.browser_download_url : RELEASES_URL, notes: rel.body || '' });
    } else setState({ status: 'latest' });
  } catch (e) {
    log.warn('Güncelleme kontrolü başarısız:', e.message);
    setState({ status: 'error', error: e.message });
  }
}

function initWindows() {
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.logger = { info: (m) => log.info('[güncelleme]', m), warn: (m) => log.warn('[güncelleme]', m), error: (m) => log.error('[güncelleme]', m), debug() {} };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => setState({ status: 'checking' }));
  autoUpdater.on('update-not-available', () => setState({ status: 'latest' }));
  autoUpdater.on('update-available', (i) => setState({ status: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => setState({ status: 'downloading', version: state.version, percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => setState({ status: 'ready', version: i.version }));
  autoUpdater.on('error', (e) => { log.warn('Güncelleme hatası:', e && e.message); setState({ status: 'error', error: e ? e.message : '' }); });
}

// Only an NSIS-installed Windows build can update itself; the old zip build or a dev run cannot.
function canSelfUpdate() {
  if (process.platform !== 'win32' || !app.isPackaged) return false;
  try { return require('node:fs').existsSync(require('node:path').join(process.resourcesPath, 'app-update.yml')); } catch { return false; }
}

function check() {
  if (!app.isPackaged && !process.env.KOROGLU_UPDATE_TEST) { setState({ status: 'dev' }); return; }
  if (canSelfUpdate()) { autoUpdater.checkForUpdates().catch((e) => setState({ status: 'error', error: e.message })); return; }
  checkMac(); // macOS, or Windows without installer: notify only
}

function init(sender) {
  send = sender;
  if (canSelfUpdate()) initWindows();
  setTimeout(check, 8000);                     // shortly after start
  setInterval(check, 6 * 3600 * 1000).unref(); // and every 6 hours while open
}

module.exports = {
  init, check, newer, RELEASES_URL,
  getState: () => state,
  install: () => { if (autoUpdater && state.status === 'ready') autoUpdater.quitAndInstall(false, true); },
};
