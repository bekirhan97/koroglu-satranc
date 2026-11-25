// Board editor: place/remove pieces, side to move, castling rights; produces a validated FEN.
import { Chessground } from 'chessground';
import { Chess, validateFen } from 'chess.js';
import { h, clear } from './dom.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ROLES = [['king', 'k'], ['queen', 'q'], ['rook', 'r'], ['bishop', 'b'], ['knight', 'n'], ['pawn', 'p']];
const ROLE_OF = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const LETTER = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' };

export class BoardEditor {
  constructor(container, { fen = START, onChange } = {}) {
    this.onChange = onChange;
    this.tool = null; // {color, role} | 'trash' | null (move)
    const f = fen.split(' ');
    this.turn = f[1] || 'w';
    this.castle = f[2] && f[2] !== '-' ? f[2] : '';
    this.boardHost = h('div.cg-board-host');
    this.palettes = { black: h('div.palette.cg-wrap'), white: h('div.palette.cg-wrap') };
    this.side = h('div.editor-side');
    container.append(h('div.editor',
      h('div.editor-board', this.palettes.black, h('div.board-wrap', this.boardHost), this.palettes.white),
      this.side));
    this.cg = Chessground(this.boardHost, {
      fen: f[0], coordinates: true, movable: { free: true, color: 'both' }, draggable: { deleteOnDropOff: true },
      premovable: { enabled: false }, highlight: { lastMove: false }, animation: { enabled: false },
      events: { change: () => this.changed(), select: (sq) => this.onSquare(sq) },
    });
    this.renderPalettes();
    this.renderSide();
  }

  renderPalettes() {
    for (const color of ['white', 'black']) {
      const host = clear(this.palettes[color]);
      for (const [role] of ROLES) {
        const active = this.tool && this.tool.color === color && this.tool.role === role;
        host.append(h('button.pal-btn' + (active ? '.active' : ''), { title: 'Seç, sonra tahtada kareye tıkla', onclick: () => { this.tool = active ? null : { color, role }; this.renderPalettes(); } },
          h('piece.' + color + '.' + role)));
      }
      if (color === 'white') host.append(h('button.pal-btn.trash' + (this.tool === 'trash' ? '.active' : ''), { title: 'Taş sil', onclick: () => { this.tool = this.tool === 'trash' ? null : 'trash'; this.renderPalettes(); } }, '🗑'));
    }
  }

  onSquare(sq) {
    if (!this.tool) return;
    const pieces = new Map();
    if (this.tool === 'trash') pieces.set(sq, undefined);
    else pieces.set(sq, { color: this.tool.color, role: this.tool.role });
    this.cg.setPieces(pieces);
    this.cg.selectSquare(null);
    this.changed();
  }

  renderSide() {
    const s = clear(this.side);
    this.fenInput = h('input.fen-input', { value: this.fen(), onchange: (e) => this.setFen(e.target.value.trim()) });
    this.status = h('div.editor-status');
    const castleBox = (ch, label) => h('label.chk', h('input', { type: 'checkbox', checked: this.castle.includes(ch), onchange: (e) => {
      this.castle = 'KQkq'.split('').filter((c) => (c === ch ? e.target.checked : this.castle.includes(c))).join('');
      this.changed();
    } }), label);
    s.append(
      h('div.panel',
        h('div.panel-title', 'Sıra'),
        h('div.seg', [['w', 'Beyaz'], ['b', 'Siyah']].map(([v, l]) => h('button' + (this.turn === v ? '.active' : ''), { onclick: () => { this.turn = v; this.renderSide(); this.changed(); } }, l))),
        h('div.panel-title', { style: { marginTop: '12px' } }, 'Rok hakları'),
        h('div.castle-grid', castleBox('K', 'Beyaz kısa'), castleBox('Q', 'Beyaz uzun'), castleBox('k', 'Siyah kısa'), castleBox('q', 'Siyah uzun')),
        h('div.btn-row',
          h('button.btn.small', { onclick: () => this.setFen(START) }, 'Başlangıç'),
          h('button.btn.small', { onclick: () => this.setFen('8/8/8/8/8/8/8/8 w - - 0 1') }, 'Temizle'),
          h('button.btn.small', { onclick: () => this.cg.toggleOrientation() }, 'Çevir'))),
      h('div.panel', h('div.panel-title', 'FEN'), this.fenInput, this.status));
    this.validate();
  }

  setFen(fen) {
    const f = fen.split(' ');
    try { this.cg.set({ fen: f[0] }); } catch { return; }
    this.turn = f[1] === 'b' ? 'b' : 'w';
    this.castle = f[2] && f[2] !== '-' ? f[2] : '';
    this.renderSide();
    this.changed();
  }

  boardFen() { return this.cg.getFen(); }

  fen() {
    // keep only castling rights that are still possible with the pieces on the board
    const board = this.boardFen();
    const at = (sq) => { const p = this.cg.state.pieces.get(sq); return p ? (p.color === 'white' ? LETTER[p.role].toUpperCase() : LETTER[p.role]) : ''; };
    const ok = { K: at('e1') === 'K' && at('h1') === 'R', Q: at('e1') === 'K' && at('a1') === 'R', k: at('e8') === 'k' && at('h8') === 'r', q: at('e8') === 'k' && at('a8') === 'r' };
    const castle = 'KQkq'.split('').filter((c) => this.castle.includes(c) && ok[c]).join('') || '-';
    return `${board} ${this.turn} ${castle} - 0 1`;
  }

  validate() {
    const fen = this.fen();
    const v = validateFen(fen);
    let msg = v.ok ? '' : v.error;
    if (v.ok) {
      const c = new Chess(fen);
      const other = new Chess(fen.replace(/ [wb] /, (m) => (m === ' w ' ? ' b ' : ' w ')).replace(/ [KQkq-]+ - /, ' - - '));
      try { if (other.inCheck()) msg = 'Sırası olmayan tarafın şahı tehdit altında.'; } catch {}
      if (!msg && c.isGameOver()) msg = 'Bu pozisyonda oyun zaten bitmiş.';
    }
    this.valid = !msg;
    if (this.status) {
      this.status.textContent = msg ? '⚠ ' + translate(msg) : '✓ Geçerli pozisyon';
      this.status.className = 'editor-status ' + (msg ? 'bad-text' : 'ok-text');
    }
    return this.valid;
  }

  changed() {
    if (this.fenInput && document.activeElement !== this.fenInput) this.fenInput.value = this.fen();
    this.validate();
    if (this.onChange) this.onChange(this.fen(), this.valid);
  }

  destroy() { this.cg.destroy(); }
}

function translate(msg) {
  if (/king/i.test(msg)) return 'Her iki tarafta da tam olarak bir şah olmalı.';
  if (/pawn/i.test(msg)) return 'Piyonlar 1. ya da 8. yatayda olamaz.';
  return msg;
}

export { START as START_FEN, ROLE_OF };
