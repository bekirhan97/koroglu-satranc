// Web side of Oyunsonu: the coaches' own positions (Supabase endgame_positions, shared in the academy).
import { supa } from './supa.js';
import { h, clear, modal, toast } from '../../src/renderer/core/dom.js';
import { fenSvg } from '../../src/renderer/core/fensvg.js';
const fenSvgSmall = (fen) => fenSvg(fen, 64, fen.split(' ')[1] === 'b');
import { BoardEditor, START_FEN } from '../../src/renderer/core/editor.js';
import { GOAL_TEXT } from '../../src/renderer/modules/endgame/curriculum.js';
import { probe, pieceCount } from '../../src/renderer/modules/endgame/judge.js';
import { Chess } from 'chess.js';

// Positions from a PGN file: only games with a [FEN] start (exercise books). Comments/annotations are dropped.
export function parsePgnPositions(text) {
  const out = [];
  for (const g of String(text).split(/\n(?=\[Event )/)) {
    const hd = Object.fromEntries([...g.slice(0, 4000).matchAll(/\[(\w+) "([^"]*)"\]/g)].map((m) => [m[1], m[2]]));
    if (!hd.FEN) continue;
    let fen;
    try { const c = new Chess(hd.FEN); if (c.isGameOver()) continue; fen = c.fen(); } catch (e) { continue; }
    const clean = (x) => (x && x !== '?' ? x.trim() : '');
    const w = clean(hd.White), b = clean(hd.Black);
    const title = (w && b ? (/ vs\.? | - /.test(b) || w.length < 25 ? `${w} – ${b}` : b) : b || w || clean(hd.Event) || 'Konum').slice(0, 120);
    out.push({ fen, title, result: hd.Result || '*' });
  }
  return out;
}
const DEFAULT_GOAL = (fen, result) => {
  const t = fen.split(' ')[1];
  if (result === '1/2-1/2') return 'draw';
  if ((result === '1-0' && t === 'w') || (result === '0-1' && t === 'b')) return 'win';
  return 'win';
};

export function endgameHooks(me) {
  const academy = me.role === 'coach' && !me.coach_id ? me.id : me.coach_id;
  return {
    isCoach: me.role === 'coach',
    async list() {
      const { data, error } = await supa.from('endgame_positions').select('*').order('created_at');
      if (error) throw error;
      return data || [];
    },
    importDialog(done) {
      const text = h('textarea.paste', { rows: 6, placeholder: 'PGN metnini buraya yapıştır ya da dosya seç (yalnızca başlangıç konumu [FEN] olan oyunlar alınır; yorumlar alınmaz).' });
      const file = h('input', { type: 'file', accept: '.pgn,.txt', onchange: async (e) => { const f = e.target.files[0]; if (f) { text.value = await f.text(); parse(); } } });
      const coll = h('input.big-input', { maxLength: 80, placeholder: 'Klasör adı, örn. Kale oyunsonları – 1. hafta' });
      const list = h('div.eg-import-list');
      let rows = [];
      const parse = async () => {
        rows = parsePgnPositions(text.value).slice(0, 300).map((r) => ({ ...r, on: true, goal: DEFAULT_GOAL(r.fen, r.result), checked: false }));
        clear(list).append(h('div.muted.small', `${rows.length} konum bulundu. Kontrol ediliyor…`));
        draw();
        // ≤ 7 pieces: the exact result from the tablebase decides the goal
        for (const r of rows) {
          if (pieceCount(r.fen) > 7) continue;
          const p = await probe(r.fen).catch(() => null);
          if (!p) continue;
          r.checked = true;
          if (p.result === 'win') r.goal = 'win';
          else if (p.result === 'draw') r.goal = 'draw';
          else { r.on = false; r.note = 'sırası gelen taraf kaybediyor'; }
          draw();
        }
      };
      const draw = () => clear(list).append(rows.length ? h('table.kv.eg-import', rows.map((r) => h('tr',
        h('td', h('input', { type: 'checkbox', checked: r.on, onchange: (e) => { r.on = e.target.checked; } })),
        h('td', { html: '' }, h('div.eg-thumb.xs', { html: fenSvgSmall(r.fen) })),
        h('td', h('input.imp-title', { value: r.title, onchange: (e) => { r.title = e.target.value.slice(0, 120); } }), r.note ? h('div.muted.small', r.note) : r.checked ? h('div.muted.small', '✓ oyunsonu tablosuyla kontrol edildi') : null),
        h('td', h('select.filter-sel', { onchange: (e) => { r.goal = e.target.value; } }, Object.entries(GOAL_TEXT).map(([k, v]) => h('option', { value: k, selected: r.goal === k }, v)))))))
        : h('div.muted.small', 'Henüz konum yok.'));
      text.addEventListener('change', parse);
      modal({ title: 'PGN\'den konum aktar', wide: true, body: h('div.form-col', h('div.row-btns', file, h('button.btn.small', { onclick: parse }, 'Konumları bul')), text,
        h('label.form-row', h('span.form-l', 'Klasör'), coll), list,
        h('p.muted.small', 'Kendi kitaplarından/notlarından seçtiğin konumları öğrencilerinle çalışmak için ekle. Yorum ve açıklamalar aktarılmaz; istersen sonra her konuma kendi açıklamanı yazabilirsin.')),
      actions: [{ label: 'Vazgeç' }, { label: 'Seçilenleri ekle', primary: true, onClick: () => {
        const sel = rows.filter((r) => r.on);
        if (!sel.length) { toast('Seçili konum yok', 'error'); return false; }
        supa.from('endgame_positions').insert(sel.map((r) => ({ title: r.title || 'Konum', fen: r.fen, goal: r.goal, collection: coll.value.trim() || null, academy_id: academy, coach_id: me.id })))
          .then(({ error }) => { if (error) toast('Eklenemedi: ' + error.message, 'error'); else { toast(`${sel.length} konum eklendi`, 'ok'); done && done(); } });
      } }] });
    },
    editDialog(pos, done) {
      const title = h('input.big-input', { value: pos ? pos.title : '', maxLength: 120, placeholder: 'Örn. Kale oyunsonu – aktif kale' });
      const goal = h('select.filter-sel', Object.entries(GOAL_TEXT).map(([k, v]) => h('option', { value: k, selected: pos ? pos.goal === k : k === 'win' }, v)));
      const note = h('textarea.paste', { rows: 2, maxLength: 600, placeholder: 'Öğrenciye kısa açıklama (isteğe bağlı)' }, pos ? pos.note || '' : '');
      const coll = h('input.big-input', { value: pos ? pos.collection || '' : '', maxLength: 80, placeholder: 'Klasör (isteğe bağlı)' });
      const box = h('div.lr-editor');
      const body = h('div.form-col', h('label.form-row', h('span.form-l', 'Başlık'), title), h('div.form-l', 'Konum (öğrenci sırası gelen tarafla oynar)'), box,
        h('label.form-row', h('span.form-l', 'Hedef'), goal), h('label.form-row', h('span.form-l', 'Açıklama'), note), h('label.form-row', h('span.form-l', 'Klasör'), coll),
        h('p.muted.small', '7 ve daha az taşlı konumlarda rakip kusursuz savunur (oyunsonu tablosu); daha çok taş varsa Stockfish oynar.'));
      const editor = new BoardEditor(box, { fen: pos ? pos.fen : START_FEN });
      const actions = [{ label: 'Vazgeç', onClick: () => editor.destroy() }];
      if (pos) actions.unshift({ label: 'Sil', onClick: () => {
        if (!confirm('Bu konum silinsin mi?')) return false;
        editor.destroy();
        supa.from('endgame_positions').delete().eq('id', pos.id).then(({ error }) => { if (error) toast(error.message, 'error'); else { toast('Silindi'); done && done(); } });
      } });
      actions.push({ label: 'Kaydet', primary: true, onClick: () => {
        if (!title.value.trim()) { toast('Başlık yazın', 'error'); return false; }
        if (!editor.validate()) { toast('Pozisyon geçerli değil', 'error'); return false; }
        const row = { title: title.value.trim(), fen: editor.fen(), goal: goal.value, note: note.value.trim() || null, collection: coll.value.trim() || null };
        editor.destroy();
        const q = pos ? supa.from('endgame_positions').update(row).eq('id', pos.id) : supa.from('endgame_positions').insert({ ...row, academy_id: academy, coach_id: me.id });
        q.then(({ error }) => { if (error) toast('Kaydedilemedi: ' + error.message, 'error'); else { toast('Kaydedildi', 'ok'); done && done(); } });
      } });
      modal({ title: pos ? 'Konumu düzenle' : 'Oyunsonu konumu ekle', wide: true, body, actions, onClose: () => editor.destroy() });
    },
  };
}
