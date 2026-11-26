// Web side of Oyunsonu: the coaches' own positions (Supabase endgame_positions, shared in the academy).
import { supa } from './supa.js';
import { h, modal, toast } from '../../src/renderer/core/dom.js';
import { BoardEditor, START_FEN } from '../../src/renderer/core/editor.js';
import { GOAL_TEXT } from '../../src/renderer/modules/endgame/curriculum.js';

export function endgameHooks(me) {
  const academy = me.role === 'coach' && !me.coach_id ? me.id : me.coach_id;
  return {
    isCoach: me.role === 'coach',
    async list() {
      const { data, error } = await supa.from('endgame_positions').select('*').order('created_at');
      if (error) throw error;
      return data || [];
    },
    editDialog(pos, done) {
      const title = h('input.big-input', { value: pos ? pos.title : '', maxLength: 120, placeholder: 'Örn. Kale oyunsonu – aktif kale' });
      const goal = h('select.filter-sel', Object.entries(GOAL_TEXT).map(([k, v]) => h('option', { value: k, selected: pos ? pos.goal === k : k === 'win' }, v)));
      const note = h('textarea.paste', { rows: 2, maxLength: 600, placeholder: 'Öğrenciye kısa açıklama (isteğe bağlı)' }, pos ? pos.note || '' : '');
      const box = h('div.lr-editor');
      const body = h('div.form-col', h('label.form-row', h('span.form-l', 'Başlık'), title), h('div.form-l', 'Konum (öğrenci sırası gelen tarafla oynar)'), box,
        h('label.form-row', h('span.form-l', 'Hedef'), goal), h('label.form-row', h('span.form-l', 'Açıklama'), note),
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
        const row = { title: title.value.trim(), fen: editor.fen(), goal: goal.value, note: note.value.trim() || null };
        editor.destroy();
        const q = pos ? supa.from('endgame_positions').update(row).eq('id', pos.id) : supa.from('endgame_positions').insert({ ...row, academy_id: academy, coach_id: me.id });
        q.then(({ error }) => { if (error) toast('Kaydedilemedi: ' + error.message, 'error'); else { toast('Kaydedildi', 'ok'); done && done(); } });
      } });
      modal({ title: pos ? 'Konumu düzenle' : 'Oyunsonu konumu ekle', wide: true, body, actions, onClose: () => editor.destroy() });
    },
  };
}
