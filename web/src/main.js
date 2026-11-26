// Köroğlu Öğrenci Sistemi (web): giriş, kabuk, ana sayfa, ayarlar, ödev ve rapor eşitleme.
// The training modules are the desktop app's own code; window.api (./api.js) stores their data in Supabase.
import './api.js'; // must come first: modules read window.api when they load
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import '../../src/renderer/styles.css';
import './web.css';
import { supa, hesap, usernameToEmail, cleanUsername } from './supa.js';
import { loadUserData, flushAll, onSaveState } from './api.js';
import { h, clear, modal, toast, fmtDate } from '../../src/renderer/core/dom.js';
import { store, newProfile, ensureRatings } from '../../src/renderer/core/store.js';
import { activity, goalProgress, streak, GOAL_KINDS } from '../../src/renderer/core/activity.js';
import { assignments, importPackage, assignmentProgress, buildReport, removeAssignment } from '../../src/renderer/core/assign.js';
import { refreshBadges } from '../../src/renderer/core/badges.js';
import { pdata } from '../../src/renderer/modules/puzzles/data.js';
import puzzles from '../../src/renderer/modules/puzzles/index.js';
import gtm from '../../src/renderer/modules/gtm/index.js';
import openings from '../../src/renderer/modules/openings/index.js';
import play from '../../src/renderer/modules/play/index.js';
import videos from './videos.js';
import ranking, { homeRanking } from './ranking.js';
import schedule, { homeNextLesson, homeLessonReport } from './schedule.js';
import lichessPlay, { live } from './lichess-play.js';
import { loadOpenings } from '../../src/renderer/core/openings.js';
import { startErrorLog, recentErrors } from './errlog.js';
import { coachAlerts } from './alerts.js';
import { studyTab } from './study.js';
import endgame from '../../src/renderer/modules/endgame/index.js';
import { endgameHooks } from './endgame-web.js';
import { lessonById } from '../../src/renderer/modules/endgame/curriculum.js';
import { pushState, enablePush, disablePush, forgetDevice } from './push.js';
import { startLink, finishLink, getLink, unlink, lichessSummary, ensureRegistered, playToken, forgetPlay } from './lichess.js';
import teacher from '../../src/renderer/modules/teacher/index.js';
import { mountExam } from '../../src/renderer/modules/exam/index.js';
import { accountsHooks, syncReports, fetchLeaderboard, leaderboardView } from './coach.js';
import brandLogo from '../../src/renderer/assets/brand.png';
import { installCard } from './install.js';

const app = document.getElementById('app');
let me = null;          // profiles row of the signed-in user
let mounted = null;
let activeId = 'home';
teacher.title = 'Antrenör';
lichessPlay.short = 'Lichess'; gtm.short = 'Tahmin Et'; openings.short = 'Açılış'; play.short = 'Oyna'; puzzles.short = 'Bulmaca';
const MODULES = [schedule, videos, puzzles, endgame, gtm, openings, play, lichessPlay, ranking, teacher];
const visibleModules = () => MODULES.filter((m) => !m.teacherOnly || (me && me.role === 'coach'));

// ---------- login ----------
async function showLogin() {
  clear(app);
  let hasCoach = true;
  try { hasCoach = (await hesap('durum')).hasCoach; } catch (e) { /* offline: show login anyway */ }
  if (!hasCoach) return showSetup();
  const user = h('input.big-input', { placeholder: 'Kullanıcı adı', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false' });
  const pass = h('input.big-input', { type: 'password', placeholder: 'Şifre', autocomplete: 'current-password' });
  const err = h('div.login-err');
  const btn = h('button.btn.primary.big', 'Giriş yap');
  const submit = async (e) => {
    e && e.preventDefault();
    err.textContent = '';
    if (!user.value.trim() || !pass.value) { err.textContent = 'Kullanıcı adı ve şifre girin.'; return; }
    btn.disabled = true; btn.textContent = 'Giriş yapılıyor…';
    const { error } = await supa.auth.signInWithPassword({ email: usernameToEmail(user.value), password: pass.value });
    btn.disabled = false; btn.textContent = 'Giriş yap';
    if (error) { err.textContent = /invalid/i.test(error.message) ? 'Kullanıcı adı ya da şifre yanlış.' : 'Giriş yapılamadı: ' + error.message; return; }
    start();
  };
  user.id = 'login-user'; pass.id = 'login-pass';
  const eye = h('button.pass-eye', { type: 'button', title: 'Şifreyi göster', onclick: () => {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password'; eye.textContent = show ? 'Gizle' : 'Göster'; eye.title = show ? 'Şifreyi gizle' : 'Şifreyi göster';
  } }, 'Göster');
  const help = () => modal({ title: 'Giriş yardımı', body: h('div.form-col',
    h('p', h('b', 'Kullanıcı adı: '), 'antrenörün hesabını açarken sana verdi. Türkçe harf ve boşluk yoktur, küçük harfle yazılır (örn. ', h('code', 'ayse.yilmaz'), ').'),
    h('p', h('b', 'Şifreni unuttuysan: '), 'antrenörüne yaz, sana hemen yeni bir şifre verir. Giriş yaptıktan sonra Ayarlar → "Şifremi değiştir" ile kendi şifreni koyabilirsin.'),
    h('p', h('b', 'Telefonda: '), 'girişten sonra sitede "Uygulama gibi kullan" kartıyla ana ekrana ekleyebilirsin; bir dahaki sefere tek dokunuşla açılır.')),
    actions: [{ label: 'Tamam', primary: true }] });
  app.append(h('div.login-page', h('form.login-card', { onsubmit: submit },
    h('img.login-logo', { src: brandLogo, alt: '' }),
    h('h1', 'Köroğlu Satranç'), h('div.login-sub', 'Öğrenci Sistemi'),
    h('label.login-l', { for: 'login-user' }, 'Kullanıcı adı'), user,
    h('label.login-l', { for: 'login-pass' }, 'Şifre'), h('div.pass-wrap', pass, eye),
    err, btn,
    h('p.muted.small', 'Hesabınızı antrenörünüz açar. Şifrenizi unuttuysanız antrenörünüze sorun.'),
    h('button.link-btn', { type: 'button', onclick: help }, 'Giriş yardımı'))));
  setTimeout(() => user.focus(), 50);
}

function showSetup() {
  const name = h('input.big-input', { placeholder: 'Adınız Soyadınız' });
  const user = h('input.big-input', { placeholder: 'Kullanıcı adı (örn. bekir)', autocapitalize: 'off', spellcheck: 'false' });
  const pass = h('input.big-input', { type: 'password', placeholder: 'Şifre (en az 6 karakter)', autocomplete: 'new-password' });
  const pass2 = h('input.big-input', { type: 'password', placeholder: 'Şifre (tekrar)', autocomplete: 'new-password' });
  const err = h('div.login-err');
  const btn = h('button.btn.primary.big', 'Antrenör hesabını oluştur');
  const submit = async (e) => {
    e.preventDefault(); err.textContent = '';
    if (pass.value !== pass2.value) { err.textContent = 'Şifreler aynı değil.'; return; }
    btn.disabled = true;
    try {
      const r = await hesap('kurulum', { display_name: name.value, username: user.value, password: pass.value });
      const { error } = await supa.auth.signInWithPassword({ email: usernameToEmail(r.username), password: pass.value });
      if (error) throw error;
      toast('Antrenör hesabınız hazır!', 'ok');
      start();
    } catch (x) { err.textContent = x.message; btn.disabled = false; }
  };
  clear(app).append(h('div.login-page', h('form.login-card', { onsubmit: submit },
    h('img.login-logo', { src: brandLogo, alt: '' }),
    h('h1', 'İlk kurulum'), h('div.login-sub', 'Antrenör hesabı'),
    h('p.muted.small', 'Sistemde henüz hesap yok. Önce kendi antrenör hesabınızı oluşturun; öğrenci hesaplarını sonra siz açacaksınız. Bu ekran yalnızca bir kez çıkar.'),
    name, user, pass, pass2, err, btn)));
  setTimeout(() => name.focus(), 50);
}

// ---------- after login ----------
async function start() {
  clear(app).append(h('div.login-page', h('div.empty', 'Yükleniyor…')));
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return showLogin();
  startErrorLog();
  const { data: prof } = await supa.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!prof) { await supa.auth.signOut(); toast('Bu hesabın profili bulunamadı. Antrenörünüzle görüşün.', 'error'); return showLogin(); }
  me = prof;
  window.__me = prof;
  try { await loadUserData(user.id); } catch (e) { clear(app).append(h('div.login-page', h('div.empty', 'Veriler yüklenemedi: ' + e.message))); return; }
  await store.load();
  if (!store.profile) store.profile = newProfile(me.display_name);
  store.profile.id = me.id;                 // the account id identifies the student everywhere
  store.profile.name = me.display_name;     // the coach owns the name
  ensureRatings(store.profile);
  store.saveProfile();
  store.settings.teacherMode = me.role === 'coach';
  await Promise.all([pdata.load(), activity.load(), assignments.load()]);
  window.webHooks = me.role === 'coach' ? accountsHooks(me) : null;
  if (window.webHooks) window.webHooks.studyTab = studyTab;
  window.endgameHooks = endgameHooks(me);
  loadOpenings().catch(() => {});
  const lr = await finishLink();
  if (lr && lr.error) toast(lr.error, 'error');
  if (lr && lr.username) toast(lr.play ? `Lichess oyun izni verildi: @${lr.username}` : `Lichess hesabınız bağlandı: @${lr.username}`, 'ok');
  ensureRegistered().catch(() => {});
  if (playToken()) live.start();
  if (me.role === 'student') { await syncAssignments(); scheduleReport(lr && lr.username ? 1000 : 5000); }
  if (me.role === 'coach') await syncReports();
  // a notification opens the site with #page (e.g. #program)
  const start = location.hash.slice(1);
  go(lr && lr.play ? 'lichess' : start && MODULES.some((m) => m.id === start) ? start : 'home');
  window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && id !== activeId) go(id); });
}

// Student: assignments targeted at me that are not imported yet.
async function syncAssignments() {
  const { data, error } = await supa.from('assignments').select('id, package, created_at').order('created_at');
  if (error) return;
  await assignments.load();
  // withdrawn by the coach (or no longer targeted at me)
  const liveIds = new Set(data.map((r) => r.id));
  for (const a of assignments.list.slice()) if (!liveIds.has(a.id)) await removeAssignment(a.id);
  await assignments.load();
  let added = 0;
  for (const row of data) {
    if (assignments.list.some((a) => a.id === row.id)) continue;
    try { const r = await importPackage(row.package); if (!r.duplicate) { added++; toast(`Yeni ödev: ${row.package.title}`, 'ok'); } } catch (e) { console.error(e); }
  }
  if (added) await pdata.load();
  return added;
}

// Student: the progress report the coach sees (same content as the desktop .krapor file).
let reportTimer = null;
function scheduleReport(delay = 30000) {
  if (!me || me.role !== 'student') return;
  clearTimeout(reportTimer);
  reportTimer = setTimeout(sendReport, delay);
}
async function sendReport() {
  try {
    const r = await buildReport();
    r.lichess = await lichessSummary().catch(() => null);
    const { error } = await supa.from('reports').upsert({ student_id: me.id, report: r, updated_at: new Date().toISOString() });
    if (error) console.error('Rapor gönderilemedi', error);
  } catch (e) { console.error(e); }
}
window.addEventListener('activity-changed', () => scheduleReport());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && reportTimer) { clearTimeout(reportTimer); reportTimer = null; sendReport(); } });

// ---------- shell ----------
function nav() {
  // On phones only the first few items fit in the bottom bar; the rest open from "Diğer".
  const primary = new Set(me.role === 'coach' ? ['home', 'teacher', 'program', 'videos'] : ['home', 'puzzles', 'program', 'siralama']);
  const item = (id, icon, title, short) => h('button.nav-item' + (activeId === id ? '.active' : '') + (primary.has(id) ? '' : '.nav-more-item'),
    { onclick: () => { side.classList.remove('more-open'); go(id); } }, h('span.nav-icon', icon), h('span.nav-label', title), h('span.nav-short', short || title));
  const moreActive = !primary.has(activeId);
  const side = h('aside.sidebar',
    h('div.brand', h('img.brand-logo', { src: brandLogo, alt: '' }), h('div', h('div.brand-name', 'Köroğlu'), h('div.brand-sub', 'Satranç Akademi'))),
    item('home', '⌂', 'Ana Sayfa'),
    h('div.nav-sep', 'Çalışma'),
    visibleModules().map((m) => item(m.id, m.icon, m.title, m.short)),
    h('div.nav-fill'),
    item('settings', '⚙', 'Ayarlar'),
    h('button.nav-item.nav-more' + (moreActive ? '.active' : ''), { onclick: (e) => { e.stopPropagation(); side.classList.toggle('more-open'); } }, h('span.nav-icon', '☰'), h('span.nav-label', 'Diğer'), h('span.nav-short', 'Diğer')),
    h('div.more-menu', [...visibleModules().filter((m) => !primary.has(m.id)).map((m) => [m.id, m.icon, m.title]), ['settings', '⚙', 'Ayarlar']].map(([id, icon, title]) =>
      h('button.more-item' + (activeId === id ? '.active' : ''), { onclick: () => { side.classList.remove('more-open'); go(id); } }, h('span', icon), h('span', title)))),
    h('div.profile-chip', me.display_name, h('div.muted.small', me.role === 'coach' ? (me.title || (me.coach_id ? 'Antrenör' : 'Başantrenör')) : `@${me.username}`)),
    saveDot);
  return side;
}
document.addEventListener('click', (e) => { const s = document.querySelector('.sidebar.more-open'); if (s && !s.contains(e.target)) s.classList.remove('more-open'); });
const saveDot = h('div.save-state');
onSaveState(({ pending, errors }) => {
  saveDot.textContent = errors ? '⚠ Kaydedilemedi, tekrar denenecek' : pending ? 'Kaydediliyor…' : '';
  saveDot.className = 'save-state' + (errors ? ' err' : '');
});

function layout(content) { clear(app).append(h('div.shell', nav(), h('main.main', content))); }

function go(id) {
  // Fair play: no engine screens while a Lichess game is running.
  if (live.game && !id.startsWith('lichess')) { toast('Lichess maçın sürüyor. Maç bitince diğer bölümlere geçebilirsin.', 'error'); return; }
  if (mounted && mounted.unmount) mounted.unmount();
  mounted = null;
  activeId = id;
  window.__activePage = id;
  const content = h('div.content');
  layout(content);
  window.scrollTo(0, 0);
  if (id === 'home') return renderHome(content);
  if (id === 'settings') return renderSettings(content);
  if (id.startsWith('lichess:')) {
    activeId = 'lichess'; layout(content);
    lichessPlay.mount(content, { gameId: id.slice(8) }).then((r) => { mounted = r; });
    return;
  }
  if (id.startsWith('videos:')) {
    activeId = 'videos'; layout(content);
    videos.mount(content, { go, open: id.slice(7) }).then((r) => { mounted = r; });
    return;
  }
  if (id.startsWith('puzzles:theme:')) {
    activeId = 'puzzles'; layout(content);
    mounted = puzzles.mount(content, { go, theme: id.slice(14) });
    return;
  }
  if (id.startsWith('egasg:')) {
    // an assignment's endgame lessons
    const a = assignments.list.find((x) => x.id === id.slice(6));
    if (!a) return renderHome(content);
    activeId = 'oyunsonu'; layout(content);
    mounted = endgame.mount(content, { go, lessons: a.endgames || [], onDone: () => go('home') });
    return;
  }
  if (id.startsWith('asg:')) {
    // Assignment puzzle sets: straight into the first unfinished set, then the next one.
    const a = assignments.list.find((x) => x.id === id.slice(4));
    if (!a) return renderHome(content);
    activeId = 'puzzles'; layout(content);
    mounted = puzzles.mount(content, { go, openSets: a.items.sets, onSetDone: () => go(setsLeft(a) ? id : 'home') });
    return;
  }
  if (id.startsWith('exam:')) {
    const a = assignments.list.find((x) => x.id === id.slice(5));
    if (!a || !a.exam) return renderHome(content);
    mountExam(content, { assignment: a, go }).then((r) => { if (activeId === id) mounted = r; else r.unmount(); });
    return;
  }
  const m = MODULES.find((x) => x.id === id);
  if (!m) return renderHome(content);
  const res = m.mount(content, { go });
  if (res && res.then) res.then((r) => { if (activeId === id) mounted = r; else if (r && r.unmount) r.unmount(); });
  else mounted = res;
}
window.goTo = (id) => go(id);

async function renderHome(root) {
  await Promise.all([activity.load(), assignments.load()]);
  const today = h('div.today');
  const asgHost = h('div.asg-host');
  const contHost = h('div');
  const badgeHost = h('div.badge-host');
  const lichessHost = h('div');
  const annHost = h('div');
  const lbHost = h('div');
  if (me.role === 'student') {
    Promise.all([supa.from('announcements').select('id, body, created_at').order('created_at', { ascending: false }), window.api.read('announcements/hidden', [])]).then(([{ data }, hidden]) => {
      const list = (data || []).filter((a) => !hidden.includes(a.id));
      if (!list.length) return;
      annHost.append(h('div.panel.ann-panel', h('div.panel-title', '📢 Duyurular'), list.map((a) => {
        const row = h('div.ann-row', h('div', h('div.ann-body', a.body), h('div.muted.small', fmtDate(a.created_at))),
          h('button.icon-btn', { title: 'Okudum', onclick: async () => { const hd = await window.api.read('announcements/hidden', []); hd.push(a.id); await window.api.write('announcements/hidden', hd.slice(-200)); row.remove(); if (!annHost.querySelector('.ann-row')) annHost.replaceChildren(); } }, '✓'));
        return row;
      })));
    }).catch(() => {});
    lbHost.append(homeRanking({ myGroup: me.group_name, go }));
  }
  getLink().then((l) => { if (!l && me.role === 'student') lichessHost.append(h('div.panel.lichess-cta', h('div', h('b', '♞ Lichess hesabını bağla'), h('div.muted.small', 'Antrenörün Lichess puanını ve oyunlarını görsün, kendi oyunlarından bulmaca çıkaralım.')),
    h('button.btn.primary', { onclick: () => startLink() }, 'Lichess ile bağlan'))); });
  root.append(h('div.home',
    h('div.hero', h('div', h('h1', `Hoş geldin, ${me.display_name.split(' ')[0]}`), h('p.muted', me.role === 'coach' ? 'Öğrencilerin ve ödevler Antrenör bölümünde.' : 'Bugün ne çalışmak istersin?')),
      me.role === 'coach' ? h('div.hero-actions', h('button.btn.primary', { onclick: () => go('teacher') }, 'Öğrencilerim')) : null),
    annHost,
    contHost,
    me.role === 'coach' ? coachAlerts(me, go) : null,
    me.role === 'student' ? homeLessonReport(go) : null,
    me.role === 'student' ? homeNextLesson(go) : null,
    localStorage.getItem('koroglu-kurulum-kapat') ? null : installCard({ onDismiss: () => localStorage.setItem('koroglu-kurulum-kapat', '1') }),
    pushCard(),
    me.role === 'student' ? today : null,
    asgHost, lbHost, lichessHost, badgeHost,
    h('div.module-grid', visibleModules().map((m) => h('button.module-card', { onclick: () => go(m.id) },
      h('div.mc-icon', m.icon), h('div.mc-title', m.id === 'teacher' ? 'Antrenör' : m.title),
      h('div.mc-desc', m.id === 'teacher' ? 'Öğrenci hesapları, ödev verme, videolar ve öğrencilerin ilerlemesi.' : m.id === 'puzzles' ? 'Antrenman, Storm, Rush, Streak, kendi oyunlarından bulmaca, tekrar ve tema analizi.' : m.description),
      m.homeInfo ? infoSlot(m) : null)))));
  if (me.role === 'student') { renderToday(today); renderAssignments(asgHost, contHost); renderBadges(badgeHost); }
}

function infoSlot(m) {
  const el = h('div.mc-foot');
  Promise.resolve(m.homeInfo()).then((t) => { el.textContent = t || ''; }).catch(() => {});
  return el;
}

async function renderBadges(host) {
  const { list, fresh } = await refreshBadges();
  for (const b of fresh) toast(`${b.icon} Yeni rozet: ${b.name}!`, 'ok');
  const earned = list.filter((b) => b.earned).length;
  clear(host).append(h('div.panel.badges-panel',
    h('div.panel-title', 'Rozetler', h('span.muted.small', ` ${earned}/${list.length}`)),
    h('div.badge-grid', list.map((b) => h('div.badge' + (b.earned ? '.earned' : ''),
      { title: `${b.name}: ${b.desc}` + (b.earned ? ` ✓ (${fmtDate(b.earnedAt)})` : ` – ${Math.min(b.current, b.goal)}/${b.goal}`) },
      h('div.badge-icon', b.icon), h('div.badge-name', b.name),
      b.earned ? null : h('div.badge-bar', h('span', { style: { width: `${Math.round(100 * b.progress)}%` } })))))));
}

function renderToday(host) {
  const goal = assignments.goal();
  const day = activity.day();
  const gp = goalProgress(goal, day);
  const st = streak(activity.days, goal);
  const fire = h('div.streak' + (st.todayDone ? '.done' : ''), h('div.streak-n', st.current), h('div.streak-l', 'günlük seri'),
    h('div.muted.small', st.todayDone ? 'Bugün tamam ✓' : st.current ? 'Seriyi bugün de sürdür' : 'Bugün başla'));
  const goalBox = gp
    ? h('div.goal-box', h('div.goal-title', gp.met ? '🎯 Bugünün hedefi tamamlandı!' : '🎯 Bugünün hedefi', goal.from === 'teacher' ? h('span.muted.small', ` · ${goal.teacher || 'antrenör'} belirledi`) : null),
      gp.items.map((i) => h('div.goal-item' + (i.done >= i.target ? '.met' : ''),
        h('span.gi-label', i.label), h('span.gi-track', h('span', { style: { width: `${(100 * i.done) / i.target}%` } })), h('span.gi-num', `${i.raw}/${i.target}`))))
    : h('div.goal-box.empty-goal', h('div.goal-title', '🎯 Günlük hedef yok'),
      h('p.muted.small', 'Antrenörünüz ödevle bir hedef verebilir ya da Ayarlar\'dan kendiniz belirleyebilirsiniz.'),
      h('button.btn.small', { onclick: () => go('settings') }, 'Hedef belirle'),
      h('div.muted.small', `Bugün: ${(day.puzzles || 0) + (day.reviews || 0)} bulmaca`));
  clear(host).append(fire, goalBox);
}
window.addEventListener('activity-changed', () => { const t = document.querySelector('.today'); if (t && activeId === 'home') renderToday(t); });

function setsLeft(a) {
  return a.items.sets.some((sid) => { const st = pdata.sets.find((x) => x.id === sid); const pr = pdata.progress[sid] || {}; return st && st.puzzles.some((q) => !pr[q.id]); });
}
function partTarget(a, x) {
  return x.kind === 'sets' ? 'asg:' + a.id : x.kind === 'gtm' ? 'gtm' : x.kind === 'reps' ? 'openings'
    : x.kind === 'videos' ? (a.videos.length === 1 ? 'videos:' + a.videos[0].id : 'videos') : x.kind === 'exam' ? 'exam:' + a.id : x.kind === 'endgames' ? 'egasg:' + a.id : 'home';
}
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

async function renderAssignments(host, contHost) {
  const list = assignments.list.slice().sort((a, b) => (a.due || 9e15) - (b.due || 9e15));
  if (!list.length) return;
  const rows = [];
  let cont = null;
  for (const a of list) {
    const pr = await assignmentProgress(a);
    if (!cont && !pr.complete) {
      const x = pr.parts.find((q) => !q.done || q.done < q.total);
      if (x) cont = { a, x, started: pr.parts.some((q) => q.done) };
    }
    if (pr.complete && a.due && Date.now() - a.due > 14 * 86400e3) continue;
    const dueTxt = a.due ? (pr.overdue ? `süresi geçti (${fmtDate(a.due)})` : `son gün ${fmtDate(a.due)}`) : '';
    rows.push(h('div.asg' + (pr.complete ? '.complete' : pr.overdue ? '.overdue' : ''),
      h('div.asg-main', h('div.asg-title', a.title, pr.complete ? h('span.chip.ok', 'Tamamlandı') : null),
        h('div.muted.small', [a.teacher ? `${a.teacher}` : null, dueTxt].filter(Boolean).join(' · ')),
        a.note ? h('div.asg-note', a.note) : null,
        h('div.asg-parts', pr.parts.map((x) => x.kind === 'exam'
            ? h('button.asg-part.exam' + (x.done ? '.done' : ''), { onclick: () => go('exam:' + a.id) }, x.done ? `📝 ${x.label} · sonuç` : '📝 Sınava gir')
            : h('button.asg-part', { onclick: () => go(partTarget(a, x)) }, `${x.done}/${x.total} ${x.label}`)),
          (a.links || []).map((l) => h('button.asg-part.lichess', { title: l.url, onclick: () => window.api.openExternal(l.url) }, '♞ ', l.title, ' ↗')))),
      h('div.asg-pct', h('div.ring', { style: { '--p': Math.round(100 * pr.pct) } }, h('span', `%${Math.round(100 * pr.pct)}`)))));
  }
  if (rows.length) clear(host).append(h('div.panel.asg-panel', h('div.panel-title', 'Ödevlerim'), rows));
  if (cont && contHost) {
    const { a, x, started } = cont;
    const due = a.due ? DAYS[new Date(a.due).getDay()] : '';
    const what = x.kind === 'exam' ? '📝 Sınav' : `${x.done}/${x.total} ${x.label}`;
    clear(contHost).append(h('button.continue-card', { onclick: () => go(partTarget(a, x)) },
      h('div', h('div.cc-k', started ? 'Kaldığın yerden devam et' : 'Yeni ödevin var'),
        h('div.cc-title', a.title), h('div.muted.small', [what, due ? `son gün ${due}` : ''].filter(Boolean).join(' · '))),
      h('span.cc-go', started ? 'Devam et ▸' : 'Başla ▸')));
  }
}

// Home: one-time invitation to turn on notifications on this device.
function pushCard() {
  const host = h('div');
  if (localStorage.getItem('koroglu-bildirim-kapat')) return host;
  pushState().then((st) => {
    if (st !== 'off') return;
    host.append(h('div.panel.push-card', h('div', h('b', '🔔 Bildirimleri aç'),
      h('div.muted.small', me.role === 'student' ? 'Yeni ödev, ders iptali ve ders raporu gelince telefonuna haber gelsin.' : 'Bu cihazda bildirim almak için.')),
      h('div.row-btns', h('button.btn.small.primary', { onclick: async () => { try { await enablePush(); toast('Bildirimler açıldı', 'ok'); host.remove(); } catch (e) { toast(e.message, 'error'); } } }, 'Aç'),
        h('button.btn.small.ghost', { onclick: () => { localStorage.setItem('koroglu-bildirim-kapat', '1'); host.remove(); } }, 'Şimdi değil'))));
  }).catch(() => {});
  return host;
}

async function renderSettings(root) {
  const s = store.settings;
  await assignments.load();
  const tg = assignments.goal();
  const teacherGoal = tg && tg.from === 'teacher' ? tg : null;
  const row = (label, control, hint) => h('div.set-row', h('div', h('div.set-label', label), hint ? h('div.muted.small', hint) : null), control);
  const save = () => { store.saveSettings(); toast('Kaydedildi', 'ok'); };
  const lichessBox = h('div.btn-row');
  const pushBox = h('div.btn-row');
  const drawPush = async () => {
    const st = await pushState().catch(() => 'unsupported');
    const msg = { homescreen: 'iPhone/iPad\'de önce siteyi ana ekrana ekle ("Uygulama gibi kullan"), sonra simgeden açıp buradan aç.', unsupported: 'Bu tarayıcı bildirimleri desteklemiyor.', denied: 'Bildirim izni kapalı. Tarayıcının site ayarlarından izin verip sayfayı yenile.' };
    clear(pushBox).append(...(st === 'on'
      ? [h('b', 'Açık ✓'), h('button.btn.small.ghost', { onclick: async () => { await disablePush().catch(() => {}); toast('Bu cihazda bildirimler kapatıldı'); drawPush(); } }, 'Kapat')]
      : st === 'off' ? [h('button.btn.small.primary', { onclick: async (e) => { e.target.disabled = true; try { await enablePush(); toast('Bildirimler açıldı', 'ok'); } catch (err) { toast(err.message, 'error'); } drawPush(); } }, 'Bildirimleri aç')]
        : [h('span.muted.small', msg[st])]));
  };
  drawPush();
  const drawLichess = async () => {
    const l = await getLink();
    clear(lichessBox).append(...(l
      ? [h('b', '@' + l.username), h('span.muted.small', playToken() ? 'oyun izni: bu cihazda var' : 'oyun izni: yok'),
        h('button.btn.small.ghost', { onclick: async () => { await unlink(); live.stop(); toast('Lichess bağlantısı kaldırıldı'); drawLichess(); scheduleReport(1000); } }, 'Bağlantıyı kaldır')]
      : [h('button.btn.small.primary', { onclick: () => startLink() }, 'Lichess ile bağlan')]));
  };
  drawLichess();
  root.append(h('div.module', h('div.module-head', h('h2', 'Ayarlar')),
    h('div.settings',
      h('div.panel', h('div.panel-title', 'Hesap'),
        row('Ad', h('span', me.display_name), me.role === 'student' ? 'Adınızı antrenörünüz değiştirebilir.' : null),
        row('Kullanıcı adı', h('span', '@' + me.username)),
        row('Şifre', h('button.btn.small', { onclick: changePassword }, 'Şifremi değiştir')),
        row('Bildirimler', pushBox, me.role === 'student' ? 'Yeni ödev, ders iptali, ders raporu ve duyurular telefonuna bildirim olarak gelir. Her cihazda ayrı açılır.' : 'Bu cihaz için. Öğrencilere bildirim, ödev/duyuru/ders iptali/ders raporu kaydedilince kendiliğinden gider.'),
        row('Lichess hesabı', lichessBox, 'Lichess\'in kendi giriş sayfası açılır; şifreniz bize gelmez. Yalnızca kullanıcı adınız ve puanlarınız alınır.'),
        row('Çıkış', h('button.btn.small', { onclick: logout }, 'Çıkış yap'), 'Ortak kullanılan bir cihazdaysanız çıkış yapmayı unutmayın.')),
      me.role === 'student' ? h('div.panel',
        h('div.panel-title', 'Günlük hedef'),
        teacherGoal ? h('p.muted.small', `Şu an ${teacherGoal.teacher || 'antrenörünüzün'} ödevle belirlediği hedef geçerli. Aşağıdaki kendi hedefiniz, antrenör hedefi olmadığında kullanılır.`)
          : h('p.muted.small', 'Her gün yapmak istediğiniz çalışma. Hedefi tutturduğunuz her gün seriye eklenir.'),
        h('div.goal-grid', GOAL_KINDS.filter(([k]) => k === 'puzzles').map(([k, , label]) => h('label', h('input.goal-in', { type: 'number', min: 0, max: 200, value: (s.dailyGoal || {})[k] || 0,
          onchange: (e) => { s.dailyGoal = { ...(s.dailyGoal || {}), [k]: Math.max(0, +e.target.value || 0) }; save(); } }), h('span', label))))) : null,
      ((ic) => ic ? h('div.panel', h('div.panel-title', 'Uygulama'), ic) : null)(installCard()),
      h('div.panel', h('div.panel-title', 'Görünüm'),
        row('Türkçe notasyon (Ş V K F A)', h('input', { type: 'checkbox', checked: s.turkishNotation !== false, onchange: (e) => { s.turkishNotation = e.target.checked; save(); } }))),
      me.role === 'coach' ? errorPanel() : null)));
}

// Coaches: errors that happened on students' and coaches' devices in the last 7 days.
function errorPanel() {
  const list = h('div.err-list', h('div.muted.small', 'Yükleniyor…'));
  recentErrors().then(async (rows) => {
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const { data: ps } = ids.length ? await supa.from('profiles').select('id, display_name').in('id', ids) : { data: [] };
    const nm = Object.fromEntries((ps || []).map((x) => [x.id, x.display_name]));
    clear(list).append(rows.length ? h('table.kv.err-table', rows.map((r) => h('tr',
      h('td.muted.small', new Date(r.created_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })),
      h('td', h('b', nm[r.user_id] || (r.user_id === me.id ? me.display_name : 'Kullanıcı')), r.page ? h('span.muted.small', ` · ${r.page}`) : null,
        h('div.err-msg', { title: r.stack || '' }, r.message), h('div.muted.small', deviceOf(r.ua))))))
      : h('div.muted.small', 'Son 7 günde hata yok 👍'));
  }).catch((e) => clear(list).append(h('div.muted.small', 'Hata kaydı alınamadı: ' + e.message)));
  return h('div.panel', h('div.panel-title', 'Hata kaydı (son 7 gün)'),
    h('p.muted.small', 'Öğrencilerin ve antrenörlerin cihazlarında oluşan beklenmedik hatalar burada görünür. Bir öğrenci "çalışmıyor" derse önce buraya bak.'), list);
}
function deviceOf(ua = '') {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'Diğer';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(' · ');
}

function changePassword() {
  const p1 = h('input.big-input', { type: 'password', placeholder: 'Yeni şifre (en az 6 karakter)', autocomplete: 'new-password' });
  const p2 = h('input.big-input', { type: 'password', placeholder: 'Yeni şifre (tekrar)', autocomplete: 'new-password' });
  modal({ title: 'Şifre değiştir', body: h('div.form-col', p1, p2), actions: [{ label: 'Vazgeç' }, { label: 'Kaydet', primary: true, onClick: () => {
    if (p1.value.length < 6) { toast('Şifre en az 6 karakter olmalı', 'error'); return false; }
    if (p1.value !== p2.value) { toast('Şifreler aynı değil', 'error'); return false; }
    supa.auth.updateUser({ password: p1.value }).then(({ error }) => toast(error ? 'Değiştirilemedi: ' + error.message : 'Şifreniz değişti', error ? 'error' : 'ok'));
  } }] });
}

async function logout() {
  await flushAll();
  if (me && me.role === 'student') await sendReport();
  await forgetDevice();
  await supa.auth.signOut();
  location.reload();
}

window.addEventListener('error', (e) => console.error(e.message));

(async function boot() {
  const { data } = await supa.auth.getSession();
  if (data.session) start(); else showLogin();
})();

export { cleanUsername };
