// "Öğretmen" (teacher mode only): students' progress reports and preparing assignment packages.
import { h, clear, modal, toast, fmtDate } from '../../core/dom.js';
import { store } from '../../core/store.js';
import { ratingChart } from '../../core/charts.js';
import { students, sentPackages, buildPackage, packageSummary, isLichessUrl } from '../../core/assign.js';
import { GOAL_KINDS } from '../../core/activity.js';
import { pdata } from '../puzzles/data.js';
import { odata } from '../openings/data.js';
import { THEME_GROUPS, themeName } from '../puzzles/themes.js';
import { tcLabel } from '../play/index.js';
import { BADGES } from '../../core/badges.js';
import { parentReportHtml } from '../../core/parentReport.js';
import brandLogo from '../../assets/brand.png';

const api = window.api;
const ago = (t) => { const d = Math.floor((Date.now() - t) / 86400e3); return d <= 0 ? 'bugün' : d === 1 ? 'dün' : `${d} gün önce`; };
const pct = (x) => `%${Math.round(100 * x)}`;
const sign = (x) => (x > 0 ? '+' : '') + Math.round(x);

// Import .krapor files (from the Öğrencilerim screen or by double-clicking them).
export async function importReports(files) {
  await students.load();
  let added = 0, older = 0;
  const bad = [];
  for (const f of files) {
    if (f.error) { bad.push(f.name); continue; }
    try { const r = students.add(f.data); if (r.older) older++; else added++; } catch (e) { bad.push(f.name); }
  }
  await students.save();
  const msg = [added ? `${added} rapor eklendi` : null, older ? `${older} rapor zaten vardı ya da daha eskiydi` : null, bad.length ? `${bad.length} dosya okunamadı` : null].filter(Boolean).join(', ');
  if (msg) toast(msg, added ? 'ok' : bad.length ? 'error' : '');
  return added;
}

export default {
  id: 'teacher',
  title: 'Öğretmen',
  icon: '🎓',
  description: 'Öğrencilerinizin ilerleme raporlarını görün ve onlara ödev paketi hazırlayın.',
  ready: true,
  teacherOnly: true,
  homeInfo: async () => { await students.load(); const n = Object.keys(students.map).length; return n ? `${n} öğrenci` : 'Henüz rapor yok'; },

  async mount(root) {
    await Promise.all([students.load(), sentPackages.load(), odata.load()]);
    const tabsHost = h('div.tabs');
    const body = h('div.module-body.teacher');
    clear(root).append(h('div.module', h('div.module-head', h('h2', this.title), tabsHost), body));
    const setTabs = (active, extra) => clear(tabsHost).append(
      h('button.tab' + (active === 'students' ? '.active' : ''), { onclick: showStudents }, 'Öğrencilerim'),
      window.webHooks ? h('button.tab' + (active === 'accounts' ? '.active' : ''), { onclick: showAccounts }, 'Hesaplar') : null,
      window.webHooks ? h('button.tab' + (active === 'assignments' ? '.active' : ''), { onclick: () => { setTabs('assignments'); window.webHooks.assignmentsTab(body); } }, 'Ödevler') : null,
      window.webHooks ? h('button.tab' + (active === 'announcements' ? '.active' : ''), { onclick: () => { setTabs('announcements'); window.webHooks.announcementsTab(body); } }, 'Duyurular') : null,
      window.webHooks ? h('button.tab' + (active === 'leaderboard' ? '.active' : ''), { onclick: () => { setTabs('leaderboard'); window.webHooks.leaderboardTab(body); } }, 'Sıralama') : null,
      h('button.tab' + (active === 'package' ? '.active' : ''), { onclick: showPackage }, window.webHooks ? 'Ödev ver' : 'Ödev paketi hazırla'),
      ...(extra ? [h('button.tab.active', extra)] : []));

    // ---------- accounts (web only) ----------
    function showAccounts() {
      setTabs('accounts');
      window.webHooks.accountsTab(body);
    }

    // ---------- students ----------
    function showStudents() {
      setTabs('students');
      const list = Object.values(students.map).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      const importBtn = window.webHooks
        ? h('button.btn', { onclick: async () => { await window.webHooks.syncReports(); showStudents(); toast('Güncellendi', 'ok'); } }, '↻ Yenile')
        : h('button.btn.primary', { onclick: async () => { const fs = await api.openFiles('rapor'); if (fs.length) { await importReports(fs); showStudents(); } } }, '+ Rapor içe aktar');
      const rows = list.map((s) => {
        const r = s.last;
        const prev = s.reports.length > 1 ? s.reports[s.reports.length - 2] : null;
        const week = r.activity.days.slice(-7);
        const max = Math.max(1, ...week.map((d) => (d.puzzles || 0) + (d.reviews || 0) + (d.openings || 0) + (d.gtmMoves || 0) / 5));
        const asg = r.assignments.length ? r.assignments.reduce((a, x) => a + x.pct, 0) / r.assignments.length : null;
        const stale = Date.now() - r.createdAt > 8 * 86400e3;
        return h('tr.clickable', { onclick: () => showStudent(s.id) },
          h('td', h('b', s.name), h('div.sub', `Rapor: ${fmtDate(r.createdAt)} (${ago(r.createdAt)})`, stale ? h('span.bad-text', ' · eski') : null)),
          h('td.num', r.ratings.puzzles.r, prev ? h('span.delta' + (r.ratings.puzzles.r >= prev.puzzles ? '.up' : '.down'), ' ' + sign(r.ratings.puzzles.r - prev.puzzles)) : null),
          h('td.num', r.ratings.gtm.r, prev ? h('span.delta' + (r.ratings.gtm.r >= prev.gtm ? '.up' : '.down'), ' ' + sign(r.ratings.gtm.r - prev.gtm)) : null),
          h('td.num', r.activity.streak.current, h('span.muted', ' gün')),
          h('td', h('div.spark', week.map((d) => { const v = (d.puzzles || 0) + (d.reviews || 0) + (d.openings || 0) + (d.gtmMoves || 0) / 5; return h('span', { title: `${d.key}: ${d.puzzles || 0} bulmaca, ${d.reviews || 0} tekrar, ${d.openings || 0} açılış, ${d.gtmMoves || 0} tahmin`, style: { height: `${v ? 15 + (85 * v) / max : 4}%` }, class: v ? '' : 'zero' }); }))),
          h('td', r.puzzles.weakest.length ? r.puzzles.weakest.map(themeName).join(', ') : h('span.muted', '–')),
          h('td', asg == null ? h('span.muted', '–') : h('div.mini-progress', h('span', { style: { width: pct(asg) } }), h('b', pct(asg)))));
      });
      clear(body).append(h('div.sets-page',
        h('div.toolbar', importBtn, h('span.muted', window.webHooks ? 'Öğrencilerin çalışmaları siz bir şey yapmadan buraya gelir (öğrenci siteyi kullandıkça güncellenir).' : 'Öğrencileriniz Ana Sayfa\'daki "Rapor gönder" düğmesiyle bir .krapor dosyası oluşturup size gönderir. Dosyayı buraya ekleyin ya da çift tıklayın.')),
        list.length ? h('div.table-host', h('table.games.students',
          h('thead', h('tr', h('th', 'Öğrenci'), h('th', 'Bulmaca puanı'), h('th', 'Tahmin Et puanı'), h('th', 'Seri'), h('th', 'Son 7 gün'), h('th', 'Zayıf temalar'), h('th', 'Ödevler'))),
          h('tbody', rows)))
          : window.webHooks ? h('div.empty', h('div.big-icon', '🎓'), h('h3', 'Henüz çalışan öğrenci yok'),
            h('p', '1. "Hesaplar" sekmesinden öğrencilerinize hesap açın.'),
            h('p', '2. "Ödev ver" sekmesinden ödev hazırlayıp öğrencilere gönderin.'),
            h('p', '3. Öğrenciler siteye girip çalıştıkça ilerlemeleri burada görünür.'),
            h('button.btn.primary', { onclick: showAccounts }, 'Hesaplar'))
          : h('div.empty', h('div.big-icon', '🎓'), h('h3', 'Henüz öğrenci raporu yok'),
            h('p', '1. "Ödev paketi hazırla" sekmesinden bir paket hazırlayıp öğrencilerinize gönderin.'),
            h('p', '2. Öğrencileriniz çalıştıktan sonra Ana Sayfa\'dan "Rapor gönder" ile size .krapor dosyası yollar.'),
            h('p', '3. Raporları buraya ekleyin; her öğrencinin gelişimini görün.'))));
    }

    function showStudent(id) {
      const s = students.map[id];
      if (!s) return showStudents();
      const r = s.last;
      setTabs('student', s.name);
      const days = r.activity.days.slice(-28);
      const dayTotal = (d) => (d.puzzles || 0) + (d.reviews || 0) + (d.openings || 0) + (d.gtmMoves || 0) / 5 + (d.playGames || 0) * 3;
      const maxDay = Math.max(1, ...days.map(dayTotal));
      const studied = days.filter((d) => dayTotal(d) > 0).length;
      const goal = r.activity.goal;
      const pz = r.puzzles;
      const verdictLabel = { zayif: 'Zayıf', normal: 'Normal', guclu: 'Güçlü', az: 'Az veri' };
      clear(body).append(h('div.stats-page.student-page',
        h('div.toolbar', h('button.btn.small', { onclick: showStudents }, '◂ Öğrencilerim'), h('span.spacer'),
          h('span.muted', `Rapor: ${fmtDate(r.createdAt)} · uygulama ${r.appVersion}`),
          h('button.btn.small.primary', { onclick: () => parentReport(s) }, 'Veli raporu (PDF)'),
          window.webHooks ? null : h('button.btn.small.ghost', { onclick: () => modal({ title: 'Öğrenci silinsin mi?', body: h('p', `${s.name} ve tüm raporları bu bilgisayardan silinecek.`),
            actions: [{ label: 'Vazgeç' }, { label: 'Sil', primary: true, onClick: async () => { await students.remove(id); showStudents(); } }] }) }, 'Sil')),
        h('div.cards',
          h('div.card', h('div.card-k', 'Bulmaca puanı'), h('div.card-v', r.ratings.puzzles.r), h('div.muted', `${pz.total} bulmaca · %${pz.total ? Math.round((100 * pz.ok) / pz.total) : 0} doğru`)),
          h('div.card', h('div.card-k', 'Tahmin Et puanı'), h('div.card-v', r.ratings.gtm.r), h('div.muted', `${r.gtm.played} oyun`)),
          h('div.card', h('div.card-k', 'Seri'), h('div.card-v', r.activity.streak.current), h('div.muted', `en iyi ${r.activity.streak.best} gün`)),
          h('div.card', h('div.card-k', 'Son 28 gün'), h('div.card-v', studied), h('div.muted', 'gün çalıştı'))),
        h('div.panel', h('div.panel-title', 'Çalışma günleri (son 28 gün)'),
          h('div.daybars', days.map((d) => h('div.daybar', { title: `${d.key}: ${d.puzzles || 0} bulmaca, ${d.reviews || 0} tekrar, ${d.openings || 0} açılış pozisyonu, ${d.gtmMoves || 0} tahmin, ${d.playGames || 0} oyun` },
            h('span', { style: { height: `${dayTotal(d) ? 8 + (92 * dayTotal(d)) / maxDay : 0}%` } }), h('i', d.key.slice(8))))),
          goal ? h('div.muted.small', 'Günlük hedef: ' + GOAL_KINDS.filter(([k]) => goal[k] > 0).map(([k, unit]) => `${goal[k]} ${unit}`).join(', ') + (goal.from === 'self' ? ' (öğrencinin kendi hedefi)' : '')) : null),
        r.lichess && r.lichess.username ? lichessPanel(r.lichess) : null,
        r.badges && Object.keys(r.badges).length ? h('div.panel', h('div.panel-title', `Rozetler (${Object.keys(r.badges).length}/${BADGES.length})`),
          h('div.badge-row', BADGES.filter((b) => r.badges[b.id]).map((b) => h('span.badge-chip', { title: `${b.desc} · ${fmtDate(r.badges[b.id])}` }, b.icon, ' ', b.name)))) : null,
        r.exams && Object.values(r.exams).some((e) => e.finishedAt) ? h('div.panel', h('div.panel-title', 'Sınavlar'),
          h('table.kv.asg', Object.values(r.exams).filter((e) => e.finishedAt).sort((a, b) => b.finishedAt - a.finishedAt).map((e) => h('tr',
            h('td', h('b', e.title), h('div.sub', Object.entries(e.sections || {}).map(([k, s]) => `${({ puzzle: 'Bulmaca', opening: 'Açılış', gtm: 'Tahmin Et' })[k]} ${s.ok}/${s.total}`).join(' · '))),
            h('td', fmtDate(e.finishedAt)),
            h('td', h('b.exam-score' + (e.score >= 85 ? '.hi' : e.score < 50 ? '.lo' : ''), `${e.score} puan`)))))) : null,
        r.assignments.length ? h('div.panel', h('div.panel-title', 'Ödevler'),
          h('table.kv.asg', r.assignments.map((a) => h('tr',
            h('td', h('b', a.title), h('div.sub', a.parts.map((p) => `${p.done}/${p.total} ${p.label}`).join(' · '))),
            h('td', a.due ? `son gün ${fmtDate(a.due)}` : ''),
            h('td', h('div.mini-progress', h('span', { style: { width: pct(a.pct) } }), h('b', pct(a.pct)))))))) : null,
        h('div.two-col',
          h('div.panel', h('div.panel-title', 'Bulmaca puanı'), ratingChart(r.ratings.puzzles.history)),
          h('div.panel', h('div.panel-title', 'Tahmin Et puanı'), ratingChart(r.ratings.gtm.history))),
        h('div.two-col',
          h('div.panel', h('div.panel-title', 'Tema analizi'),
            pz.themes.filter((t) => t.verdict !== 'az').length ? h('table.ta', h('tbody', pz.themes.filter((t) => t.verdict !== 'az').map((t) => h('tr.' + t.verdict,
              h('td', themeName(t.theme)), h('td.num', `${t.ok}/${t.n}`), h('td.num', sign(t.diff)), h('td', h('span.verdict', verdictLabel[t.verdict]))))))
              : h('div.muted', 'Henüz yeterli veri yok.'),
            h('div.muted.small', `Tekrar listesinde ${pz.reviewTotal} bulmaca (${pz.reviewDue} tanesinin zamanı geldi) · ${pz.graduated} bulmaca öğrenildi`)),
          h('div',
            h('div.panel', h('div.panel-title', 'Açılış repertuvarları'),
              r.openings.length ? h('table.kv', r.openings.map((o) => h('tr', h('td', o.name, h('span.muted', ` (${o.color === 'w' ? 'Beyaz' : 'Siyah'})`)), h('td', `${o.learned}/${o.total} öğrenildi`), h('td', o.due ? h('span.bad-text', `${o.due} bekliyor`) : h('span.ok-text', 'güncel')))))
                : h('div.muted', 'Repertuvar yok.')),
            h('div.panel', h('div.panel-title', 'Pozisyondan Oyna'),
              h('div', `${r.play.total} oyun: ${r.play.w} galibiyet, ${r.play.d} beraberlik, ${r.play.l} yenilgi`),
              r.play.recent.length ? h('table.kv', r.play.recent.slice(0, 6).map((g) => h('tr', h('td', fmtDate(g.t)), h('td', g.opp.kind === 'maia' ? `Maia ${g.opp.elo}` : `Stockfish ${g.opp.level}`), h('td', tcLabel(g.tc)),
                h('td', g.result === '1/2-1/2' ? '½' : (g.result === '1-0') === (g.side === 'w') ? h('span.ok-text', 'Kazandı') : h('span.bad-text', 'Kaybetti'))))) : null))),
        r.gtm.games.length ? h('div.panel', h('div.panel-title', 'Hamleyi Tahmin Et – son oyunlar'),
          h('table.kv', r.gtm.games.slice(0, 10).map((g) => h('tr', h('td', fmtDate(g.at)), h('td', `${g.white} – ${g.black}`), h('td', `ort. ${g.avg}`), h('td', `usta hamlesi %${g.master}`), h('td', g.rated ? sign(g.change) : 'puansız'))))) : null));
    }

    // ---------- parent report (PDF) ----------
    async function logoDataUrl() {
      return String(brandLogo).startsWith('data:') ? brandLogo : ''; // the bundler inlines the logo as a data URL
    }
    function parentReport(s) {
      const ta = h('textarea.paste', { rows: 5, placeholder: 'Örn. Ayşe bu ay çok düzenli çalıştı. Önümüzdeki dönemde açmaz ve şiş temalarına ağırlık vereceğiz.' });
      modal({
        title: `Veli raporu: ${s.name}`,
        body: h('div', h('p.muted.small', `Son raporu (${fmtDate(s.last.createdAt)}) temel alan tek sayfalık bir PDF hazırlanır: puan gelişimi, çalışma günleri, güçlü ve zayıf konular, ödevler, sınavlar ve rozetler.`),
          h('label.form-l', 'Öğretmenin notu (isteğe bağlı)'), ta),
        actions: [{ label: 'Vazgeç' }, { label: 'PDF oluştur…', primary: true, onClick: async () => {
          const html = parentReportHtml(s.last, { note: ta.value.trim(), teacher: store.profile.name, logo: await logoDataUrl() });
          const d = new Date();
          const p = await api.savePdf(html, `${s.name} - veli raporu ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`.replace(/[\\/:*?"<>|]/g, '-'));
          if (p && p.error) toast('PDF oluşturulamadı: ' + p.error, 'error');
          else if (p) { toast('Veli raporu kaydedildi. Dosyayı veliye WhatsApp ya da e-posta ile gönderebilirsiniz.', 'ok'); api.showFile(p); }
        } }],
      });
    }

    function lichessPanel(l) {
      const perfs = [['bullet', 'Bullet'], ['blitz', 'Blitz'], ['rapid', 'Rapid'], ['classical', 'Klasik'], ['puzzle', 'Bulmaca']].filter(([k]) => l.perfs && l.perfs[k] && l.perfs[k].games);
      const url = `https://lichess.org/@/${l.username}`;
      return h('div.panel.lichess-panel', h('div.panel-title', 'Lichess'),
        h('div.lichess-row', h('b', '@' + l.username),
          perfs.map(([k, label]) => h('span.lichess-perf', h('span.muted.small', label), h('b', l.perfs[k].rating), l.perfs[k].prov ? '?' : '', h('span.muted.small', ` (${l.perfs[k].games})`))),
          h('span.spacer'),
          h('button.btn.small', { onclick: () => api.openExternal(url) }, 'Profili ↗'),
          h('button.btn.small', { onclick: () => api.openExternal(`https://lichess.org/@/${l.username}/all`) }, 'Oyunları ↗'),
          h('button.btn.small.primary', { onclick: () => api.openExternal(`https://lichess.org/?user=${l.username}#friend`) }, 'Maç teklif et ↗')),
        l.fetchedAt ? h('div.muted.small', `Puanlar ${fmtDate(l.fetchedAt)} tarihli`) : null);
    }

    // ---------- package builder ----------
    function showPackage() {
      setTabs('package');
      const f = { title: '', note: '', due: '', goal: { puzzles: 10, openings: 0, gtmGames: 0, playGames: 0 }, games: new Set(), sets: new Set(), reps: new Set(), themeSets: [], links: [],
        videos: new Set(), exam: { on: false, title: '', minutes: 30, pz: { mode: 'theme', theme: '', count: 10, min: 900, max: 1600, setId: '' }, gtmGameId: '', repId: '', openingCount: 10 } };
      const summary = h('div.pkg-summary');
      const refresh = () => {
        const nGames = f.games.size;
        const nPz = pdata.sets.filter((s) => f.sets.has(s.id)).reduce((a, s) => a + s.puzzles.length, 0) + f.themeSets.reduce((a, t) => a + t.count, 0);
        clear(summary).append(h('div.panel-title', 'Paket özeti'),
          h('ul', nGames ? h('li', `${nGames} Tahmin Et oyunu`) : null, nPz ? h('li', `${nPz} bulmaca`) : null, f.reps.size ? h('li', `${f.reps.size} açılış repertuvarı`) : null,
            f.links.length ? h('li', `${f.links.length} Lichess bağlantısı`) : null,
            f.videos.size ? h('li', `${f.videos.size} video`) : null,
            f.exam.on ? h('li', `Sınav (${f.exam.minutes} dk)`) : null,
            !nGames && !nPz && !f.reps.size && !f.links.length && !f.videos.size ? h('li.muted', 'Henüz içerik seçilmedi') : null),
          h('button.btn.primary.big', { onclick: save }, api.web ? 'Öğrencilere gönder…' : 'Paketi kaydet…'),
          h('p.muted.small', api.web ? 'Sonraki adımda ödevin hangi öğrencilere (ya da gruplara) gideceğini seçersiniz. Öğrenci siteye girdiğinde ödevi Ana Sayfa\'da görür.' : 'Kaydettiğiniz .kpaket dosyasını öğrencilerinize WhatsApp, e-posta ya da USB ile gönderin. Öğrenci dosyaya çift tıklayınca ödev uygulamasına eklenir.'));
      };
      const check = (set, id, label, sub) => h('label.pick', h('input', { type: 'checkbox', checked: set.has(id), onchange: (e) => { e.target.checked ? set.add(id) : set.delete(id); refresh(); } }), h('span', label), sub ? h('span.muted.small', sub) : null);

      // GTM games grouped by collection
      const byCol = {};
      for (const g of store.games) (byCol[g.collection] = byCol[g.collection] || []).push(g);
      const gamesBox = h('div.pick-list', Object.keys(byCol).length ? Object.entries(byCol).map(([col, gs]) => {
        const inner = h('div.pick-inner', gs.map((g) => check(f.games, g.id, `${g.headers.White} – ${g.headers.Black}`, [g.headers.Date && g.headers.Date.slice(0, 4), g.difficulty ? `zorluk ${g.difficulty}` : 'analiz yok'].filter(Boolean).join(' · '))));
        return h('div.pick-group', h('label.pick.group', h('input', { type: 'checkbox', onchange: (e) => { gs.forEach((g) => (e.target.checked ? f.games.add(g.id) : f.games.delete(g.id))); inner.querySelectorAll('input').forEach((i) => { i.checked = e.target.checked; }); refresh(); } }), h('b', col), h('span.muted.small', `${gs.length} oyun`)), inner);
      }) : h('div.muted', 'Hamleyi Tahmin Et bölümünde henüz oyununuz yok.'));

      const themeRows = h('div.theme-rows');
      const themeSelect = (t) => h('select', { onchange: (e) => { t.theme = e.target.value; t.name = themeName(t.theme) + ' seçkisi'; } },
        THEME_GROUPS.map(([g, ts]) => h('optgroup', { label: g }, ts.map((x) => h('option', { value: x, selected: t.theme === x }, themeName(x))))));
      const drawThemes = () => clear(themeRows).append(...f.themeSets.map((t, i) => h('div.theme-row',
        themeSelect(t),
        h('input', { type: 'number', min: 1, max: 100, value: t.count, onchange: (e) => { t.count = Math.max(1, Math.min(100, +e.target.value || 10)); refresh(); } }), h('span.muted', 'bulmaca,'),
        h('input', { type: 'number', step: 50, value: t.min, onchange: (e) => { t.min = +e.target.value; } }), h('span.muted', '–'),
        h('input', { type: 'number', step: 50, value: t.max, onchange: (e) => { t.max = +e.target.value; } }), h('span.muted', 'puan'),
        h('button.icon-btn', { title: 'Kaldır', onclick: () => { f.themeSets.splice(i, 1); drawThemes(); refresh(); } }, '✕'))));

      const linkRows = h('div.theme-rows');
      const drawLinks = () => clear(linkRows).append(...f.links.map((l, i) => h('div.theme-row',
        h('input.link-title', { value: l.title, placeholder: 'Başlık', oninput: (e) => { l.title = e.target.value; } }),
        h('input.link-url', { value: l.url, placeholder: 'https://lichess.org/tournament/…', oninput: (e) => { l.url = e.target.value.trim(); e.target.classList.toggle('bad', !!l.url && !isLichessUrl(l.url)); } }),
        h('button.icon-btn', { title: 'Kaldır', onclick: () => { f.links.splice(i, 1); drawLinks(); refresh(); } }, '✕'))));

      const examBody = h('div.exam-form');
      const examPanel = () => h('div.panel', h('div.panel-title', '7. Sınav (isteğe bağlı)'),
        h('label.chk', h('input', { type: 'checkbox', onchange: (e) => { f.exam.on = e.target.checked; drawExam(); refresh(); } }), 'Bu pakete sınav ekle'),
        h('p.muted.small', 'Süreli, tek deneme, ipucusuz. Sorular şimdi seçilir; bütün öğrenciler aynı soruları alır. Sonuç öğrencinin raporuna girer. Her bölüm notun eşit payıdır.'),
        examBody);
      const drawExam = () => {
        const e = f.exam;
        if (!e.on) { clear(examBody); return; }
        const analysed = store.games.filter((g) => g.difficulty);
        const sel = (opts, value, on) => h('select', { onchange: (ev) => on(ev.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
        const numIn = (v, on, w = 70) => h('input', { type: 'number', value: v, style: { width: w + 'px' }, onchange: (ev) => on(+ev.target.value) });
        clear(examBody).append(
          h('div.theme-row', h('input.link-title', { placeholder: 'Sınav başlığı', value: e.title, oninput: (ev) => { e.title = ev.target.value; } }), h('span.muted', 'süre'), numIn(e.minutes, (v) => { e.minutes = Math.max(5, Math.min(180, v || 30)); refresh(); }), h('span.muted', 'dakika')),
          h('div.form-l', 'Bulmacalar'),
          h('div.theme-row', sel([['theme', 'Lichess bulmacaları'], ['set', 'PGN setimden']], e.pz.mode, (v) => { e.pz.mode = v; drawExam(); }),
            e.pz.mode === 'theme'
              ? [sel([['', 'Karışık tema'], ...THEME_GROUPS.flatMap(([, ts]) => ts.map((t) => [t, themeName(t)]))], e.pz.theme, (v) => { e.pz.theme = v; }),
                numIn(e.pz.count, (v) => { e.pz.count = Math.max(0, Math.min(50, v)); }), h('span.muted', 'soru,'), numIn(e.pz.min, (v) => { e.pz.min = v; }), h('span.muted', '–'), numIn(e.pz.max, (v) => { e.pz.max = v; }), h('span.muted', 'puan')]
              : [sel([['', 'Set seçin'], ...pdata.sets.filter((s) => !s.assignment).map((s) => [s.id, `${s.name} (${s.puzzles.length})`])], e.pz.setId, (v) => { e.pz.setId = v; }),
                numIn(e.pz.count, (v) => { e.pz.count = Math.max(1, v); }), h('span.muted', 'soru')]),
          h('div.form-l', 'Hamleyi Tahmin Et'),
          h('div.theme-row', sel([['', 'Yok'], ...analysed.map((g) => [g.id, `${g.headers.White} – ${g.headers.Black}`])], e.gtmGameId, (v) => { e.gtmGameId = v; }),
            h('span.muted.small', analysed.length ? 'İlk 5 hamle sorulmaz, en fazla 25 hamle.' : 'Önce Hamleyi Tahmin Et\'te "Önceden analiz et" ile bir oyun hazırlayın.')),
          h('div.form-l', 'Açılış soruşturması'),
          h('div.theme-row', sel([['', 'Yok'], ...odata.reps.filter((r) => !r.assignment).map((r) => [r.id, r.name])], e.repId, (v) => { e.repId = v; }),
            numIn(e.openingCount, (v) => { e.openingCount = Math.max(1, Math.min(40, v)); }), h('span.muted', 'pozisyon')));
      };

      // videos (web only): the coach's library
      let videoList = [];
      const videosPanel = h('div.panel', h('div.panel-title', 'Videolar'), h('div.muted.small', 'Yükleniyor…'));
      if (window.webHooks) window.webHooks.videoList().then((list) => {
        videoList = list;
        clear(videosPanel).append(h('div.panel-title', 'Videolar'),
          list.length ? h('div.pick-list', list.map((v) => check(f.videos, v.id, v.title, v.topic || ''))) : h('div.muted.small', 'Kütüphanenizde video yok (Videolar → + Video ekle).'));
      }).catch(() => {});

      const num = (k) => h('input.goal-in', { type: 'number', min: 0, max: 200, value: f.goal[k], onchange: (e) => { f.goal[k] = Math.max(0, +e.target.value || 0); } });

      async function save() {
        const title = f.title.trim();
        if (!title) { toast('Pakete bir başlık verin', 'error'); return; }
        if (f.links.some((l) => !isLichessUrl(l.url))) { toast('Lichess bağlantıları https://lichess.org/ ile başlamalı', 'error'); return; }
        if (!f.games.size && !f.sets.size && !f.themeSets.length && !f.reps.size && !f.links.length && !f.videos.size && !f.exam.on) { toast('Pakete en az bir içerik ekleyin', 'error'); return; }
        const due = f.due ? new Date(f.due + 'T23:59:59').getTime() : null;
        const goal = Object.values(f.goal).some((v) => v > 0) ? { ...f.goal } : null;
        toast('Paket hazırlanıyor…');
        const pkg = await buildPackage({ title, note: f.note.trim(), due, goal, gtmGameIds: [...f.games], setIds: [...f.sets], themeSets: f.themeSets, repIds: [...f.reps], links: f.links, videos: videoList.filter((v) => f.videos.has(v.id)).map((v) => ({ id: v.id, title: v.title, youtubeId: v.youtube_id })), exam: f.exam.on ? {
          title: f.exam.title.trim() || `${title} sınavı`, minutes: f.exam.minutes,
          puzzles: f.exam.pz.mode === 'set' ? (f.exam.pz.setId ? { setId: f.exam.pz.setId, count: f.exam.pz.count } : null) : (f.exam.pz.count > 0 ? { theme: f.exam.pz.theme, count: f.exam.pz.count, min: f.exam.pz.min, max: f.exam.pz.max } : null),
          gtmGameId: f.exam.gtmGameId, repId: f.exam.repId, openingCount: f.exam.openingCount } : null });
        if (f.exam.on && !pkg.exam) { toast('Sınava soru eklenemedi: bulmaca, oyun ya da repertuvar seçin', 'error'); return; }
        const noAnalysis = pkg.gtm.games.length - Object.keys(pkg.gtm.analysis).length;
        if (window.webHooks) {
          if (!(await window.webHooks.sendPackage(pkg))) return;
          await sentPackages.add(pkg);
          showPackage();
          return;
        }
        const path = await api.saveFile('paket', title.replace(/[\\/:*?"<>|]/g, '-'), pkg);
        if (!path) return;
        await sentPackages.add(pkg);
        modal({ title: 'Paket kaydedildi', body: h('div', h('p', h('b', title)), h('ul', packageSummary(pkg).map((x) => h('li', x))),
          noAnalysis ? h('p.muted.small', `${noAnalysis} oyun analizsiz gönderildi. Öğrencinin bilgisayarı bu oyunları oynarken analiz eder; biraz bekleme olabilir. Bir dahaki sefere Hamleyi Tahmin Et'te "Önceden analiz et" ile hazırlayabilirsiniz.`) : null,
          h('p', 'Şimdi dosyayı öğrencilerinize gönderin.'), h('p.muted.small', path)), actions: [{ label: 'Tamam', primary: true }] });
        showPackage();
      }

      clear(body).append(h('div.pkg-page',
        h('div.pkg-main',
          h('div.panel', h('div.panel-title', '1. Paket bilgileri'),
            h('label.form-l', 'Başlık'), h('input.big-input', { placeholder: 'Örn. Hafta 12 – Çatal ve açmaz', oninput: (e) => { f.title = e.target.value; } }),
            h('label.form-l', 'Not (öğrenci görür)'), h('textarea.paste', { rows: 3, placeholder: 'Örn. Önce oyunları oynayın, sonra bulmacaları çözün.', oninput: (e) => { f.note = e.target.value; } }),
            h('label.form-l', 'Son teslim tarihi (isteğe bağlı)'), h('input', { type: 'date', onchange: (e) => { f.due = e.target.value; } })),
          h('div.panel', h('div.panel-title', '2. Günlük hedef'),
            h('p.muted.small', 'Öğrencinin her gün yapmasını istediğiniz çalışma. 0 bırakılan madde hedefe girmez. Bu paket öğrencinin önceki günlük hedefinin yerine geçer.'),
            h('div.goal-grid', GOAL_KINDS.map(([k, , label]) => h('label', num(k), h('span', label))))),
          h('div.panel', h('div.panel-title', '3. Hamleyi Tahmin Et oyunları'),
            h('p.muted.small', 'Analizi yapılmış oyunlar ("zorluk" yazanlar) analiziyle birlikte gider; öğrenci beklemeden oynar.'), gamesBox),
          h('div.panel', h('div.panel-title', '4. Bulmacalar'),
            pdata.sets.length ? h('div.pick-list', pdata.sets.filter((s) => !s.assignment).map((s) => check(f.sets, s.id, s.name, `${s.puzzles.length} bulmaca`))) : h('div.muted.small', 'PGN bulmaca setiniz yok (Bulmacalar → Setlerim).'),
            h('div.form-l', 'Lichess temalarından seçki'),
            h('p.muted.small', 'Seçtiğiniz temadan, verdiğiniz puan aralığında, kolaydan zora sıralı bulmacalar seçilir. Bütün öğrenciler aynı bulmacaları çözer.'),
            themeRows,
            h('button.btn.small', { onclick: () => { f.themeSets.push({ theme: 'fork', name: 'Çatal seçkisi', count: 15, min: 1000, max: 1600 }); drawThemes(); refresh(); } }, '+ Tema seçkisi ekle')),
          h('div.panel', h('div.panel-title', '5. Açılış repertuvarları'),
            odata.reps.filter((r) => !r.assignment).length ? h('div.pick-list', odata.reps.filter((r) => !r.assignment).map((r) => check(f.reps, r.id, r.name, `${r.color === 'w' ? 'Beyaz' : 'Siyah'} · ${r.lines} çizgi`))) : h('div.muted.small', 'Repertuvarınız yok (Açılış Tekrarı → Repertuvar İçe Aktar).')),
          h('div.panel', h('div.panel-title', '6. Lichess turnuvası / takımı'),
            h('p.muted.small', 'Hafta sonu turnuvası, takım ya da çalışma (study) bağlantısı ekleyin. Öğrenci ödevin içinden tek tıkla açar.'),
            linkRows,
            h('button.btn.small', { onclick: () => { f.links.push({ title: 'Hafta sonu turnuvası', url: '' }); drawLinks(); refresh(); } }, '+ Bağlantı ekle')),
          window.webHooks ? videosPanel : null,
          examPanel()),
        h('div.pkg-side', h('div.panel', summary),
          sentPackages.list.length ? h('div.panel', h('div.panel-title', 'Gönderilen paketler'),
            h('table.kv', sentPackages.list.slice().reverse().slice(0, 10).map((p) => h('tr', h('td', h('b', p.title), h('div.sub', p.summary.join(' · '))), h('td', fmtDate(p.createdAt)))))) : null)));
      refresh();
    }

    showStudents();
    return { unmount: () => {} };
  },
};
