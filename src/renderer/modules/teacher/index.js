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
      h('button.tab' + (active === 'package' ? '.active' : ''), { onclick: showPackage }, 'Ödev paketi hazırla'),
      ...(extra ? [h('button.tab.active', extra)] : []));

    // ---------- students ----------
    function showStudents() {
      setTabs('students');
      const list = Object.values(students.map).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      const importBtn = h('button.btn.primary', { onclick: async () => { const fs = await api.openFiles('rapor'); if (fs.length) { await importReports(fs); showStudents(); } } }, '+ Rapor içe aktar');
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
        h('div.toolbar', importBtn, h('span.muted', 'Öğrencileriniz Ana Sayfa\'daki "Rapor gönder" düğmesiyle bir .krapor dosyası oluşturup size gönderir. Dosyayı buraya ekleyin ya da çift tıklayın.')),
        list.length ? h('div.table-host', h('table.games.students',
          h('thead', h('tr', h('th', 'Öğrenci'), h('th', 'Bulmaca puanı'), h('th', 'Tahmin Et puanı'), h('th', 'Seri'), h('th', 'Son 7 gün'), h('th', 'Zayıf temalar'), h('th', 'Ödevler'))),
          h('tbody', rows)))
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
          h('button.btn.small.ghost', { onclick: () => modal({ title: 'Öğrenci silinsin mi?', body: h('p', `${s.name} ve tüm raporları bu bilgisayardan silinecek.`),
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
        r.badges && Object.keys(r.badges).length ? h('div.panel', h('div.panel-title', `Rozetler (${Object.keys(r.badges).length}/${BADGES.length})`),
          h('div.badge-row', BADGES.filter((b) => r.badges[b.id]).map((b) => h('span.badge-chip', { title: `${b.desc} · ${fmtDate(r.badges[b.id])}` }, b.icon, ' ', b.name)))) : null,
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

    // ---------- package builder ----------
    function showPackage() {
      setTabs('package');
      const f = { title: '', note: '', due: '', goal: { puzzles: 10, openings: 0, gtmGames: 0, playGames: 0 }, games: new Set(), sets: new Set(), reps: new Set(), themeSets: [], links: [] };
      const summary = h('div.pkg-summary');
      const refresh = () => {
        const nGames = f.games.size;
        const nPz = pdata.sets.filter((s) => f.sets.has(s.id)).reduce((a, s) => a + s.puzzles.length, 0) + f.themeSets.reduce((a, t) => a + t.count, 0);
        clear(summary).append(h('div.panel-title', 'Paket özeti'),
          h('ul', nGames ? h('li', `${nGames} Tahmin Et oyunu`) : null, nPz ? h('li', `${nPz} bulmaca`) : null, f.reps.size ? h('li', `${f.reps.size} açılış repertuvarı`) : null,
            f.links.length ? h('li', `${f.links.length} Lichess bağlantısı`) : null,
            !nGames && !nPz && !f.reps.size && !f.links.length ? h('li.muted', 'Henüz içerik seçilmedi') : null),
          h('button.btn.primary.big', { onclick: save }, 'Paketi kaydet…'),
          h('p.muted.small', 'Kaydettiğiniz .kpaket dosyasını öğrencilerinize WhatsApp, e-posta ya da USB ile gönderin. Öğrenci dosyaya çift tıklayınca ödev uygulamasına eklenir.'));
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

      const num = (k) => h('input.goal-in', { type: 'number', min: 0, max: 200, value: f.goal[k], onchange: (e) => { f.goal[k] = Math.max(0, +e.target.value || 0); } });

      async function save() {
        const title = f.title.trim();
        if (!title) { toast('Pakete bir başlık verin', 'error'); return; }
        if (f.links.some((l) => !isLichessUrl(l.url))) { toast('Lichess bağlantıları https://lichess.org/ ile başlamalı', 'error'); return; }
        if (!f.games.size && !f.sets.size && !f.themeSets.length && !f.reps.size && !f.links.length) { toast('Pakete en az bir içerik ekleyin', 'error'); return; }
        const due = f.due ? new Date(f.due + 'T23:59:59').getTime() : null;
        const goal = Object.values(f.goal).some((v) => v > 0) ? { ...f.goal } : null;
        toast('Paket hazırlanıyor…');
        const pkg = await buildPackage({ title, note: f.note.trim(), due, goal, gtmGameIds: [...f.games], setIds: [...f.sets], themeSets: f.themeSets, repIds: [...f.reps], links: f.links });
        const noAnalysis = pkg.gtm.games.length - Object.keys(pkg.gtm.analysis).length;
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
            h('button.btn.small', { onclick: () => { f.links.push({ title: 'Hafta sonu turnuvası', url: '' }); drawLinks(); refresh(); } }, '+ Bağlantı ekle'))),
        h('div.pkg-side', h('div.panel', summary),
          sentPackages.list.length ? h('div.panel', h('div.panel-title', 'Gönderilen paketler'),
            h('table.kv', sentPackages.list.slice().reverse().slice(0, 10).map((p) => h('tr', h('td', h('b', p.title), h('div.sub', p.summary.join(' · '))), h('td', fmtDate(p.createdAt)))))) : null)));
      refresh();
    }

    showStudents();
    return { unmount: () => {} };
  },
};
