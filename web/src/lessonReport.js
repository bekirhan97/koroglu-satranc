// Lesson report ("Dersi bitir"): after a lesson the coach records the topic, a short summary, one critical
// position, the homework and the plan for the next lesson (+ an optional personal note per student).
// Students read it under Program (and on the home page), absent students get a make-up package,
// and the coach can copy it for WhatsApp or print it as a PDF for parents.
import { supa } from './supa.js';
import { h, clear, modal, toast } from '../../src/renderer/core/dom.js';
import { Board } from '../../src/renderer/core/board.js';
import { BoardEditor, START_FEN } from '../../src/renderer/core/editor.js';
import { buildPackage, students as reports } from '../../src/renderer/core/assign.js';
import { THEME_GROUPS, themeName } from '../../src/renderer/modules/puzzles/themes.js';
import { createAssignment, syncReports } from './coach.js';

const ACADEMY = 'Köroğlu Satranç Akademi';
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const WD = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const longDate = (key) => { const d = parseKey(key); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${WD[d.getDay()]}`; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const firstName = (n) => String(n || '').split(' ')[0];

// ---------- the critical position ----------
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
// Static board picture for PDFs and previews (no images needed).
export function fenSvg(fen, size = 240, flip = false) {
  const rows = fen.split(' ')[0].split('/');
  const sq = size / 8;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      const x = (flip ? 7 - f : f) * sq, y = (flip ? 7 - r : r) * sq;
      const white = ch === ch.toUpperCase();
      out += `<text x="${x + sq / 2}" y="${y + sq * 0.84}" font-size="${sq * 0.95}" text-anchor="middle" font-family="'Segoe UI Symbol','DejaVu Sans','Noto Sans Symbols2',serif" fill="${white ? '#fff' : '#1b1714'}" stroke="${white ? '#1b1714' : 'none'}" stroke-width="${white ? sq * 0.03 : 0}">${GLYPH[ch.toLowerCase()]}</text>`;
      f++;
    }
  }
  let bg = '';
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) bg += `<rect x="${f * sq}" y="${r * sq}" width="${sq}" height="${sq}" fill="${(r + f) % 2 ? '#b58863' : '#f0d9b5'}"/>`;
  return out.replace('>', '>' + bg) + `<rect x="0" y="0" width="${size}" height="${size}" fill="none" stroke="#6b5a4a"/></svg>`;
}
const toMove = (fen) => (fen.split(' ')[1] === 'b' ? 'Siyah oynar' : 'Beyaz oynar');

// Interactive board: the student (or coach) can try moves from the position; "Başa al" resets it.
export function positionModal(crit, title = 'Dersin kritik konumu') {
  const host = h('div.crit-board');
  const moves = h('div.crit-moves.muted.small');
  let board = null;
  const reset = () => { board.setPosition(crit.fen, { interactive: true }); moves.textContent = toMove(crit.fen) + '. Hamleleri tahtada deneyebilirsin.'; };
  modal({ title, wide: true, body: h('div.crit-wrap', host,
    h('div.crit-side', crit.comment ? h('div.crit-comment', crit.comment) : null, moves,
      h('div.row-btns', h('button.btn.small', { onclick: () => reset() }, '↺ Başa al'),
        h('a.btn.small', { href: 'https://lichess.org/analysis/' + crit.fen.replace(/ /g, '_'), target: '_blank', rel: 'noopener' }, 'Lichess\'te incele')))),
  actions: [{ label: 'Kapat' }], onClose: () => board && board.destroy() });
  const played = [];
  board = new Board(host, { orientation: crit.fen.split(' ')[1] === 'b' ? 'black' : 'white', onMove: (m) => { played.push(m.san); moves.textContent = played.join(' '); board.setPosition(m.fenAfter, { lastMove: m.uci, interactive: true }); } });
  reset();
  setTimeout(() => board.refresh(), 50);
}

// ---------- report pieces ----------
// ctx: { lessonName, hwTitles, personal, attStatus, studentName }
export function reportCard(s, ctx) {
  return h('div.lr-card',
    h('div.lr-head', h('b', ctx.lessonName), s.topic ? h('span', ' · ', s.topic) : null, h('div.muted.small', longDate(s.date))),
    ctx.attStatus === 'gelmedi' || ctx.attStatus === 'mazeretli' ? h('div.lr-missed', 'Bu derse katılamadın. Aşağıdaki özeti oku, kritik konuma bak' + (ctx.makeup ? ' ve telafi ödevini çöz.' : '.')) : null,
    s.note ? h('div.lr-sec', h('div.lr-k', 'Derste'), h('div', s.note)) : null,
    s.critical && s.critical.fen ? h('div.lr-sec', h('div.lr-k', 'Tekrar'),
      h('div.lr-crit', h('div.lr-mini', { html: fenSvg(s.critical.fen, 132, s.critical.fen.split(' ')[1] === 'b') }),
        h('div', s.critical.comment ? h('div', s.critical.comment) : h('div.muted', 'Derste incelediğimiz konum.'), h('div.muted.small', toMove(s.critical.fen)),
          h('button.btn.small', { onclick: () => positionModal(s.critical) }, 'Tahtada aç')))) : null,
    ctx.hwTitles && ctx.hwTitles.length ? h('div.lr-sec', h('div.lr-k', 'Ödev'), h('div', ctx.hwTitles.join(', '), ' ',
      ctx.goHome ? h('button.btn.small', { onclick: ctx.goHome }, 'Ödeve git') : null)) : null,
    ctx.makeup ? h('div.lr-sec', h('div.lr-k', 'Telafi'), h('div', ctx.makeup, ' ', ctx.goHome ? h('button.btn.small', { onclick: ctx.goHome }, 'Telafi ödevine git') : null)) : null,
    s.next_plan ? h('div.lr-sec', h('div.lr-k', 'Sonraki ders'), h('div', s.next_plan)) : null,
    ctx.personal ? h('div.lr-sec.lr-personal', h('div.lr-k', 'Hocanın notu'), h('div', ctx.personal)) : null);
}

// Plain text for WhatsApp (group message, or one student's message with attendance and personal note).
export function reportText(s, ctx) {
  const L = [`*${ACADEMY} · ${ctx.lessonName}*`, `${longDate(s.date)} dersi${s.topic ? ' — ' + s.topic : ''}`];
  if (ctx.studentName) {
    L.push('');
    L.push(ctx.attStatus === 'geldi' ? `${firstName(ctx.studentName)} derse katıldı ✓` : ctx.attStatus ? `${firstName(ctx.studentName)} bu derse katılamadı.${ctx.makeup ? ' Telafi ödevi öğrenci sisteminde hazır.' : ''}` : '');
  }
  L.push('');
  if (s.note) L.push(`*Derste:* ${s.note}`);
  if (s.critical && s.critical.fen) L.push(`*Tekrar:* ${s.critical.comment || 'Derste incelediğimiz konumu'} (öğrenci sisteminde tahtada açılır).`);
  if (ctx.hwTitles && ctx.hwTitles.length) L.push(`*Ödev:* ${ctx.hwTitles.join(', ')}`);
  if (s.next_plan) L.push(`*Sonraki ders:* ${s.next_plan}`);
  if (ctx.personal) L.push('', `*Hocanın notu:* ${ctx.personal}`);
  L.push('', location.origin + location.pathname);
  return L.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
}

// Printable page(s): one page for the group, or one page per student when `pages` has several entries.
export function reportHtml(s, pages) {
  const page = (ctx) => `<section class="pg">
    <div class="top"><div><div class="ac">${esc(ACADEMY)}</div><h1>${esc(ctx.lessonName)}${s.topic ? ' · ' + esc(s.topic) : ''}</h1><div class="dt">${esc(longDate(s.date))} dersi</div></div>
    ${ctx.studentName ? `<div class="st">${esc(ctx.studentName)}<div class="${ctx.attStatus === 'geldi' ? 'ok' : 'no'}">${ctx.attStatus === 'geldi' ? 'Derse katıldı' : ctx.attStatus ? 'Derse katılamadı' : ''}</div></div>` : ''}</div>
    ${s.note ? `<h2>Derste ne yaptık?</h2><p>${esc(s.note)}</p>` : ''}
    ${s.critical && s.critical.fen ? `<h2>Tekrar: dersin kritik konumu</h2><div class="crit">${fenSvg(s.critical.fen, 230, s.critical.fen.split(' ')[1] === 'b')}<div><p>${esc(s.critical.comment || 'Derste incelediğimiz konum.')}</p><p class="mut">${toMove(s.critical.fen)}. Konum öğrenci sisteminde tahtada açılır.</p></div></div>` : ''}
    ${ctx.hwTitles && ctx.hwTitles.length ? `<h2>Ödev</h2><p>${esc(ctx.hwTitles.join(', '))}</p>` : ''}
    ${ctx.makeup ? `<h2>Telafi</h2><p>${esc(ctx.makeup)}</p>` : ''}
    ${s.next_plan ? `<h2>Sonraki ders</h2><p>${esc(s.next_plan)}</p>` : ''}
    ${ctx.personal ? `<h2>Hocanın notu</h2><p class="pn">${esc(ctx.personal)}</p>` : ''}
    <div class="ft">${esc(ACADEMY)} · Öğrenci Sistemi</div></section>`;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Ders raporu – ${esc(longDate(s.date))}</title><style>
    @page { size: A4; margin: 16mm; }
    body { margin: 0; font-family: "Segoe UI", Inter, Arial, sans-serif; color: #2a2420; font-size: 11.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pg { page-break-after: always; } .pg:last-child { page-break-after: auto; }
    .top { display: flex; justify-content: space-between; gap: 16px; border-bottom: 3px solid #7a1424; padding-bottom: 10px; margin-bottom: 14px; }
    .ac { color: #b08a2e; font-size: 9.5pt; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; }
    h1 { font-size: 18pt; margin: 4px 0 2px; } .dt { color: #6b625a; }
    .st { text-align: right; font-weight: 700; font-size: 13pt; } .st .ok { color: #2e7d32; font-size: 10pt; } .st .no { color: #b3261e; font-size: 10pt; }
    h2 { font-size: 11pt; color: #7a1424; margin: 16px 0 4px; text-transform: uppercase; letter-spacing: .04em; }
    p { margin: 4px 0; line-height: 1.45; } .mut { color: #6b625a; font-size: 10pt; }
    .crit { display: flex; gap: 16px; align-items: flex-start; } .pn { background: #faf3e3; border-left: 3px solid #b08a2e; padding: 8px 10px; }
    .ft { margin-top: 28px; color: #9a9088; font-size: 9pt; border-top: 1px solid #e5ddd3; padding-top: 6px; }
  </style></head><body>${pages.map(page).join('')}</body></html>`;
}

function copy(text) {
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Kopyalandı — WhatsApp\'a yapıştırabilirsin', 'ok'), () => toast('Kopyalanamadı', 'error'));
}
const waLink = (text) => 'https://wa.me/?text=' + encodeURIComponent(text);

// ---------- coach: finish the lesson ----------
// opts: { session, lessonName, studentIds, kind, marks, studentName, hwTitles, me, hadSets, onSaved }
export async function finishDialog(opts) {
  const s = opts.session;
  const { data: notesRows } = await supa.from('session_notes').select('student_id, note').eq('session_id', s.id);
  const notes = Object.fromEntries((notesRows || []).map((r) => [r.student_id, r.note]));
  const topic = h('input.big-input', { value: s.topic || '', maxLength: 120, placeholder: 'Örn. Kritik Kare, Açmaz, Geçer piyon' });
  const summary = h('textarea.paste', { rows: 3, placeholder: 'Örn. Saldırı hedefini bulmayı ve rakibin en güçlü savunmasını hesaplamayı çalıştık.' }, s.note || '');
  const nextDefault = opts.hadSets ? 'Ödevde grubun en çok zorlandığı konumları inceleyeceğiz.' : '';
  const next = h('textarea.paste', { rows: 2, placeholder: 'Örn. Ödevde grubun en çok zorlandığı iki konumu inceleyeceğiz.' }, s.next_plan || nextDefault);

  // critical position
  let crit = s.critical && s.critical.fen ? { ...s.critical } : null;
  let editor = null;
  const critHost = h('div.lr-crit-edit');
  const critComment = h('input.big-input', { value: (crit && crit.comment) || '', maxLength: 300, placeholder: 'Örn. Beyaz oynar: önce hangi taşı etkisiz hale getirmeli?' });
  const drawCrit = (editing) => {
    if (editor) { editor.destroy(); editor = null; }
    clear(critHost);
    if (editing) {
      const box = h('div.lr-editor');
      critHost.append(box, h('div.muted.small', 'Taşları tahtaya yerleştir ya da sağdaki kutuya FEN yapıştır. Sırası gelen tarafı seçmeyi unutma.'), critComment,
        h('div.row-btns', h('button.btn.small.primary', { onclick: () => { if (!editor.validate()) { toast('Pozisyon geçerli değil', 'error'); return; } crit = { fen: editor.fen(), comment: critComment.value.trim() }; drawCrit(false); } }, 'Konumu kullan'),
          h('button.btn.small.ghost', { onclick: () => drawCrit(false) }, 'Vazgeç')));
      editor = new BoardEditor(box, { fen: (crit && crit.fen) || START_FEN });
    } else if (crit) {
      critHost.append(h('div.lr-crit', h('div.lr-mini', { html: fenSvg(crit.fen, 120, crit.fen.split(' ')[1] === 'b') }),
        h('div', h('div', crit.comment || h('span.muted', 'Açıklama yok')), h('div.muted.small', toMove(crit.fen)),
          h('div.row-btns', h('button.btn.small', { onclick: () => { critComment.value = crit.comment || ''; drawCrit(true); } }, 'Değiştir'), h('button.btn.small.ghost', { onclick: () => { crit = null; drawCrit(false); } }, 'Kaldır')))));
    } else critHost.append(h('button.btn.small', { onclick: () => drawCrit(true) }, '+ Kritik konum ekle'));
  };
  drawCrit(false);

  // personal notes
  const present = opts.studentIds;
  const noteInputs = {};
  const noteRows = present.map((sid) => {
    noteInputs[sid] = h('textarea.paste', { rows: 2, placeholder: 'Örn. Aday hamleleri iyi buluyor, rakibin ara hamlelerini daha dikkatli kontrol etmeli.' }, notes[sid] || '');
    return h('div.lr-note-row', h('div.form-l', opts.studentName(sid), opts.marks[sid] && opts.marks[sid] !== 'geldi' ? h('span.chip.warn', opts.marks[sid] === 'gelmedi' ? 'Gelmedi' : 'Mazeretli') : null), noteInputs[sid]);
  });
  const notesBox = h('details.lr-notes', { open: opts.kind === 'ozel' || present.some((sid) => notes[sid]) },
    h('summary', opts.kind === 'ozel' ? 'Öğrenciye kişisel not' : 'Öğrencilere kişisel not (isteğe bağlı)'), noteRows);

  // make-up package for absent students
  const absent = present.filter((sid) => opts.marks[sid] === 'gelmedi' || opts.marks[sid] === 'mazeretli');
  const already = !!opts.makeupExists;
  const mkOn = h('input', { type: 'checkbox', checked: absent.length > 0 });
  const themeSel = h('select.filter-sel', h('option', { value: '' }, 'Bulmaca ekleme'),
    THEME_GROUPS.map(([g, ts]) => h('optgroup', { label: g }, ts.map((t) => h('option', { value: t }, themeName(t))))));
  const count = h('select.filter-sel', [5, 8, 10].map((n) => h('option', { value: n, selected: n === 8 }, `${n} bulmaca`)));
  const mkBox = absent.length && already ? h('div.muted.small', 'Gelmeyenlere telafi paketi gönderildi.') : absent.length ? h('div.lr-makeup',
    h('label.chk', mkOn, ` Gelmeyenlere telafi paketi gönder: ${absent.map((sid) => firstName(opts.studentName(sid))).join(', ')}`),
    h('div.muted.small', 'Ders özeti ve kritik konum öğrencinin Program ekranında görünür. İstersen derste işlenen temadan kısa bir tekrar seti de eklenir.'),
    h('div.row-btns', themeSel, count)) : null;

  const body = h('div.form-col.lr-form',
    h('div.muted', `${opts.lessonName} · ${longDate(s.date)}`),
    h('label.form-row', h('span.form-l', 'Konu'), topic),
    h('label.form-row', h('span.form-l', 'Derste ne yaptık?'), summary),
    h('div.form-l', 'Kritik konum'), critHost,
    h('div.form-l', 'Ödev'), opts.hwTitles.length ? h('div', opts.hwTitles.join(', ')) : h('div.muted.small', 'Bu derse bağlı ödev yok. İstersen ders kartındaki "📚 Bu dersten ödev ver" ile ver; rapora kendiliğinden eklenir.'),
    h('label.form-row', h('span.form-l', 'Sonraki ders'), next),
    present.length ? notesBox : null,
    mkBox);

  modal({ title: 'Dersi bitir · ders sonu raporu', wide: true, body, onClose: () => editor && editor.destroy(), actions: [{ label: 'Vazgeç', onClick: () => { if (editor) editor.destroy(); } }, { label: 'Kaydet ve paylaş', primary: true, onClick: () => {
    if (editor) { toast('Önce kritik konumu "Konumu kullan" ile onayla ya da vazgeç', 'error'); return false; }
    (async () => {
      try {
        if (crit) crit.comment = crit.comment || '';
        const patch = { topic: topic.value.trim() || null, note: summary.value.trim() || null, next_plan: next.value.trim() || null, critical: crit, finished_at: s.finished_at || new Date().toISOString(), updated_at: new Date().toISOString() };
        const { error } = await supa.from('sessions').update(patch).eq('id', s.id);
        if (error) throw error;
        Object.assign(s, patch);
        const up = [], del = [];
        for (const sid of present) { const v = noteInputs[sid].value.trim(); if (v) up.push({ session_id: s.id, student_id: sid, note: v, updated_at: new Date().toISOString() }); else if (notes[sid]) del.push(sid); }
        if (up.length) { const { error: e2 } = await supa.from('session_notes').upsert(up, { onConflict: 'session_id,student_id' }); if (e2) throw e2; }
        if (del.length) await supa.from('session_notes').delete().eq('session_id', s.id).in('student_id', del);
        let makeupTitle = null;
        if (absent.length && mkOn.checked && !already) {
          const theme = themeSel.value;
          const pkg = await buildPackage({ title: `Telafi – ${patch.topic || opts.lessonName}`, note: `Kaçırdığın ders (${longDate(s.date)}). ${patch.note || ''}`.trim(),
            themeSets: theme ? [{ theme, name: themeName(theme) + ' tekrarı', count: Number(count.value), min: 900, max: 1500 }] : [] });
          pkg.lesson = { ...opts.ref, session_id: s.id };
          pkg.makeup = true;
          if (theme) { await createAssignment(pkg, absent, opts.me); makeupTitle = pkg.title; }
        }
        toast('Ders raporu kaydedildi', 'ok');
        opts.onSaved && opts.onSaved();
        shareDialog({ ...opts, session: s, notes: Object.fromEntries(up.map((r) => [r.student_id, r.note])), makeupFor: makeupTitle ? absent : [], makeupTitle });
      } catch (e) { toast('Kaydedilemedi: ' + e.message, 'error'); }
    })();
  } }] });
}

// ---------- coach: share ----------
export function shareDialog(opts) {
  const s = opts.session;
  const base = { lessonName: opts.lessonName, hwTitles: opts.hwTitles };
  const per = (sid) => ({ ...base, studentName: opts.studentName(sid), attStatus: opts.marks[sid] || null, personal: (opts.notes || {})[sid] || null,
    makeup: (opts.makeupFor || []).includes(sid) ? `"${opts.makeupTitle}" ödevi öğrenci sisteminde.` : null });
  const groupText = reportText(s, base);
  const rows = opts.studentIds.map((sid) => {
    const t = reportText(s, per(sid));
    return h('div.lr-share-row', h('span', h('b', opts.studentName(sid)), opts.marks[sid] && opts.marks[sid] !== 'geldi' ? h('span.chip.warn', 'Gelmedi') : null, (opts.notes || {})[sid] ? h('span.chip', 'kişisel not') : null),
      h('span.row-btns', h('button.btn.small', { onclick: () => copy(t) }, 'Kopyala'), h('a.btn.small', { href: waLink(t), target: '_blank', rel: 'noopener' }, 'WhatsApp'),
        h('button.btn.small.ghost', { onclick: () => window.api.savePdf(reportHtml(s, [per(sid)])) }, 'PDF')));
  });
  modal({ title: 'Ders raporu hazır', wide: true, body: h('div.form-col',
    reportCard(s, base),
    h('div.form-l', 'Grup mesajı', h('span.spacer'), h('button.btn.small', { onclick: () => copy(groupText) }, 'Kopyala'), h('a.btn.small', { href: waLink(groupText), target: '_blank', rel: 'noopener' }, 'WhatsApp'),
      h('button.btn.small.ghost', { onclick: () => window.api.savePdf(reportHtml(s, [base])) }, 'PDF')),
    h('pre.lr-text', groupText),
    opts.studentIds.length ? h('div.form-l', 'Veliye öğrenci öğrenci', h('span.spacer'), h('button.btn.small.ghost', { onclick: () => window.api.savePdf(reportHtml(s, opts.studentIds.map(per))) }, 'Hepsi tek PDF')) : null,
    opts.studentIds.length ? h('div.lr-share', rows) : null,
    h('p.muted.small', 'Öğrenciler raporu Program → Geçmiş dersler bölümünde ve ana sayfalarında görür. Kişisel notu yalnızca o öğrenci görür.')),
  actions: [{ label: 'Tamam', primary: true }] });
}

// Coach: who read the report, and how the make-up homework is going.
export async function makeupStatus(s, absentIds, studentName) {
  if (!absentIds.length) return null;
  await syncReports().catch(() => 0);
  const [{ data: reads }, { data: as }] = await Promise.all([
    supa.from('session_reads').select('student_id, read_at').eq('session_id', s.id),
    supa.from('assignments').select('id, title, package'),
  ]);
  const mk = (as || []).find((a) => a.package && a.package.makeup && a.package.lesson && a.package.lesson.session_id === s.id);
  return h('div.hw-summary', h('div', h('b', 'Telafi: '), mk ? mk.title : 'rapor (paket gönderilmedi)'),
    absentIds.map((sid) => {
      const read = (reads || []).some((r) => r.student_id === sid);
      const rep = reports.map[sid] && reports.map[sid].last;
      const pr = mk && rep && rep.assignments ? rep.assignments.find((x) => x.id === mk.id) : null;
      return h('div.hw-miss-row', h('span', studentName(sid)), h('span.muted.small', read ? 'Raporu okudu ✓' : 'Raporu henüz açmadı', mk ? ` · ödev %${pr ? Math.round(pr.pct * 100) : 0}` : ''));
    }));
}

// ---------- student ----------
export async function openStudentReport(s, { lessonName, hwTitles, attStatus, makeup, go }) {
  const me = window.__me || {};
  const { data } = await supa.from('session_notes').select('note').eq('session_id', s.id).eq('student_id', me.id);
  const personal = data && data[0] ? data[0].note : null;
  const m = modal({ title: 'Ders raporu', wide: true, body: reportCard(s, { lessonName, hwTitles, attStatus, personal, makeup, goHome: go ? () => { m.close(); go('home'); } : null }), actions: [{ label: 'Kapat', primary: true }] });
  supa.from('session_reads').insert({ session_id: s.id, student_id: me.id }).then(() => {}, () => {});
}
