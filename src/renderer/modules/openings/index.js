// "Açılış Tekrarı": import a repertoire from a PGN with variations, learn its lines,
// and review them with spaced repetition.
import { h, clear, modal, toast, fmtDate } from '../../core/dom.js';
import { Board, localSan } from '../../core/board.js';
import { store } from '../../core/store.js';
import { parsePgnTree } from '../../core/pgntree.js';
import { odata, repSummary, pickLines, guessColor, treeStats, isUserMove, cardKey, LEVEL_NAMES, INTERVALS } from './data.js';
import { LineTrainer } from './trainer.js';

const tr = () => store.settings.turkishNotation !== false;

export default {
  id: 'openings',
  title: 'Açılış Tekrarı',
  icon: '📖',
  description: 'Açılış repertuvarınızı varyantlı bir PGN olarak içe aktarın, çizgileri öğrenin ve aralıklı tekrar ile kalıcı hale getirin.',
  ready: true,
  homeInfo: async () => {
    await odata.load();
    if (!odata.reps.length) return 'Henüz repertuvar yok';
    let due = 0;
    for (const rep of odata.reps) due += repSummary(rep, await odata.tree(rep.id), await odata.srsOf(rep.id)).due;
    return due ? `Bugün tekrar: ${due} pozisyon` : `${odata.reps.length} repertuvar · tekrar yok`;
  },

  async mount(root) {
    await odata.load();
    let current = null;
    const tabsHost = h('div.tabs');
    const body = h('div.module-body');
    clear(root).append(h('div.module', h('div.module-head', h('h2', this.title), tabsHost), body));
    const swap = (v) => { if (current && current.destroy) current.destroy(); current = v; };
    const setTabs = (label) => clear(tabsHost).append(
      h('button.tab' + (!label ? '.active' : ''), { onclick: showList }, 'Repertuvarlarım'),
      ...(label ? [h('button.tab.active', label)] : []));

    async function showList() {
      setTabs(null); swap(null);
      const cards = [];
      for (const rep of odata.reps) {
        const roots = await odata.tree(rep.id);
        const srs = await odata.srsOf(rep.id);
        const s = repSummary(rep, roots, srs);
        cards.push(h('div.set-card.rep-card',
          h('div',
            h('div.set-name', rep.name, h('span.chip', { style: { marginLeft: '8px' } }, rep.color === 'w' ? 'Beyaz' : 'Siyah')),
            h('div.muted', `${rep.lines} çizgi · ${s.total} pozisyon · ${s.learned} öğrenildi · eklendi ${fmtDate(rep.addedAt)}`),
            h('div.progress', h('span.ok', { style: { width: `${s.total ? (100 * s.learned) / s.total : 0}%` } }))),
          h('div.set-actions',
            h('button.btn.small' + (s.due ? '.primary' : ''), { disabled: !s.due, onclick: () => session(rep, 'review') }, `Tekrar (${s.due})`),
            h('button.btn.small' + (!s.due && s.fresh ? '.primary' : ''), { disabled: !s.fresh, onclick: () => session(rep, 'learn') }, `Öğren (${s.fresh})`),
            h('button.btn.small', { disabled: !s.learned, onclick: () => session(rep, 'practice') }, 'Pratik'),
            h('button.btn.small.ghost', { onclick: () => explore(rep) }, 'Ağaç'),
            h('button.btn.small.ghost', { onclick: () => modal({ title: 'Repertuvar silinsin mi?', body: h('p', `"${rep.name}" ve tüm tekrar geçmişi silinecek.`),
              actions: [{ label: 'Vazgeç' }, { label: 'Sil', primary: true, onClick: async () => { await odata.remove(rep.id); showList(); } }] }) }, 'Sil'))));
      }
      clear(body).append(h('div.sets-page',
        h('div.toolbar', h('button.btn.primary', { onclick: importRep }, '+ Repertuvar İçe Aktar (PGN)'),
          h('span.muted', 'Varyantlı PGN: ana hat ve alternatifler. Yorumlar öğrenirken gösterilir.')),
        cards.length ? cards : h('div.empty', h('h3', 'Henüz repertuvar yok'),
          h('p', 'Beyaz ya da siyah için hazırladığınız açılış repertuvarını varyantlarıyla bir PGN dosyası olarak içe aktarın.'),
          h('p.muted', 'Nasıl çalışır: önce her çizgiyi izleyip öğrenirsiniz, sonra uygulama doğru zamanlarda (4 saat, 1 gün, 3 gün, 1 hafta… 6 ay) size tekrar sordurur.')),
        h('div.panel.srs-help', h('div.panel-title', 'Tekrar aralıkları'),
          h('div.muted.small', 'Doğru bildiğiniz her pozisyon bir sonraki seviyeye çıkar: ' + LEVEL_NAMES.slice(1).join(' → ') + '. Yanlış bildiğinizde 4 saate geri döner.'))));
    }

    async function importRep() {
      const files = await window.api.openPgn();
      if (!files.length) return;
      const f = files[0];
      const nameIn = h('input.big-input', { value: f.name });
      let color = null;
      let depth = 20;
      const colorSeg = h('div.seg');
      const depthSel = h('select', { onchange: (e) => { depth = +e.target.value; } },
        [[10, '10 hamle'], [15, '15 hamle'], [20, '20 hamle (önerilen)'], [30, '30 hamle'], [0, 'Sınırsız']].map(([v, l]) => h('option', { value: v, selected: v === depth }, l)));
      const preview = parsePgnTree(f.text, { maxPlies: 40 });
      color = guessColor(preview.roots);
      const renderSeg = () => clear(colorSeg).append(...[['w', 'Beyaz'], ['b', 'Siyah']].map(([v, l]) => h('button' + (color === v ? '.active' : ''), { onclick: () => { color = v; renderSeg(); } }, l)));
      renderSeg();
      modal({
        title: 'Repertuvar içe aktar',
        body: h('div.import-form',
          h('label.form-l', 'Ad'), nameIn,
          h('label.form-l', 'Bu repertuvar hangi taraf için?'), colorSeg,
          h('div.muted.small', 'Tahmin: daha az alternatifi olan taraf sizin tarafınızdır. Gerekirse değiştirin.'),
          h('label.form-l', 'En fazla kaç hamle alınsın?'), depthSel,
          h('div.muted.small', 'Kitaplardaki örnek oyunlar çok uzun olabilir. Repertuvar için genellikle ilk 15–20 hamle yeterlidir.'),
          h('div.muted.small', { style: { marginTop: '8px' } }, `${preview.games} oyun/bölüm bulundu.`)),
        actions: [{ label: 'Vazgeç' }, { label: 'İçe aktar', primary: true, onClick: async () => {
          const { roots, games } = parsePgnTree(f.text, { maxPlies: depth ? depth * 2 : Infinity });
          if (!roots.length) { toast('PGN içinde hamle bulunamadı', 'error'); return; }
          await odata.add({ name: nameIn.value.trim() || f.name, color, roots });
          const st = treeStats(roots, color);
          toast(`${games} bölümden ${st.lines} çizgi içe aktarıldı`, 'ok');
          showList();
        } }],
      });
    }

    async function session(rep, mode) {
      const roots = await odata.tree(rep.id);
      const srs = await odata.srsOf(rep.id);
      const lines = pickLines(mode, rep, roots, srs, { limit: mode === 'review' ? 15 : 8 });
      if (!lines.length) { toast(mode === 'review' ? 'Şu an tekrar edilecek pozisyon yok' : 'Öğrenilecek yeni çizgi kalmadı', 'ok'); showList(); return; }
      const label = { learn: 'Öğren', review: 'Tekrar', practice: 'Pratik' }[mode];
      setTabs(`${rep.name} – ${label}`);
      let k = 0;
      const tally = { ok: 0, n: 0 };
      const runLine = () => {
        if (k >= lines.length) {
          swap(null);
          clear(body).append(h('div.empty', h('h3', 'Oturum bitti'), h('p', `${lines.length} çizgi · ${tally.ok}/${tally.n} pozisyon ilk denemede doğru`),
            h('div.btn-row', { style: { justifyContent: 'center' } },
              h('button.btn', { onclick: showList }, 'Repertuvarlara dön'),
              mode === 'learn' ? h('button.btn.primary', { onclick: () => session(rep, 'learn') }, 'Yeni çizgi öğren') : null)));
          return;
        }
        const host = h('div.pz-host');
        clear(body).append(host);
        const header = h('div.pz-bar', h('b', rep.name), h('span.muted', `${label} · ${rep.color === 'w' ? 'Beyaz' : 'Siyah'}`), h('span.spacer'),
          h('button.btn.small.ghost', { onclick: showList }, 'Çık'));
        const t = new LineTrainer(host, {
          rep, line: lines[k], mode, srs, header, index: k + 1, total: lines.length,
          onSaved: () => odata.saveSrs(rep.id),
          onDone: (results) => { tally.n += results.length; tally.ok += results.filter((r) => r.correct).length; k++; runLine(); },
        });
        swap(t); t.mount();
        if (mode === 'learn') t.showStep(0);
      };
      runLine();
    }

    async function explore(rep) {
      setTabs(`${rep.name} – Ağaç`); swap(null);
      const roots = await odata.tree(rep.id);
      const srs = await odata.srsOf(rep.id);
      const boardHost = h('div.board-host');
      const commentHost = h('div.panel.comment-panel');
      const treeHost = h('div.review-list.tree-list');
      clear(body).append(h('div.pz-layout', h('div.gtm-center', boardHost), h('div.pz-side', commentHost, treeHost)));
      const board = new Board(boardHost, { orientation: rep.color === 'w' ? 'white' : 'black' });
      swap({ destroy: () => board.destroy() });
      const select = (n) => {
        board.setPosition(n.fen, { lastMove: n.uci || undefined });
        board.setArrows(n.children.map((c, i) => ({ orig: c.uci.slice(0, 2), dest: c.uci.slice(2, 4), brush: i === 0 ? 'green' : 'paleGreen' })));
        clear(commentHost).append(h('div.panel-title', 'Açıklama'), n.comment || n.pre ? [n.pre, n.comment].filter(Boolean).map((t) => h('p.comment', t)) : h('p.muted.small', 'Açıklama yok.'));
        treeHost.querySelectorAll('.tn.current').forEach((e) => e.classList.remove('current'));
        const el = treeHost.querySelector(`[data-id="${n.id}"]`); if (el) el.classList.add('current');
      };
      let count = 0;
      const MAX = 3000;
      const renderNode = (n, depth) => {
        if (count > MAX) return null;
        const wrap = h('div.tnode');
        let node = n;
        const row = h('div.tline', { style: { paddingLeft: `${depth * 14}px` } });
        // print a run of single-child moves on one row
        while (node && count <= MAX) {
          count++;
          const fen = node.parent.fen.split(' ');
          const num = fen[1] === 'w' ? `${fen[5]}.` : (node === n ? `${fen[5]}...` : '');
          const s = isUserMove(node, rep.color) ? srs[cardKey(node)] : null;
          const target = node;
          row.append(h('span.tn' + (isUserMove(node, rep.color) ? '.mine' : ''), { 'data-id': node.id, title: s ? `Seviye: ${LEVEL_NAMES[s.lv]}` : '', onclick: () => select(target) },
            num ? h('span.mvnum', num + ' ') : null, localSan(node.san, tr()), s ? h('span.lv.l' + Math.min(s.lv, 8)) : null), ' ');
          if (node.children.length !== 1) break;
          node = node.children[0];
        }
        wrap.append(row);
        if (node && node.children.length > 1) node.children.forEach((c) => { const r = renderNode(c, depth + 1); if (r) wrap.append(r); });
        return wrap;
      };
      for (const r of roots) for (const c of r.children) { const el = renderNode(c, 0); if (el) treeHost.append(el); }
      if (count > MAX) treeHost.append(h('div.muted.small', 'Ağaç çok büyük; ilk 3000 hamle gösteriliyor.'));
      select(roots[0]);
    }

    showList();
    return { unmount: () => swap(null) };
  },
};

export { INTERVALS };
