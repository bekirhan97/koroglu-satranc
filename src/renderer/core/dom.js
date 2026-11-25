// Tiny DOM helpers shared by all modules.
export function h(tag, attrs = {}, ...children) {
  if (attrs == null || Array.isArray(attrs) || attrs instanceof Node || typeof attrs !== 'object') {
    children.unshift(attrs);
    attrs = {};
  }
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function modal({ title, body, actions = [], onClose, wide }) {
  const close = () => { back.remove(); if (onClose) onClose(); };
  const back = h('div.modal-back', { onclick: (e) => { if (e.target === back && !actions.some((a) => a.required)) close(); } },
    h('div.modal' + (wide ? '.wide' : ''),
      h('div.modal-head', h('h3', {}, title), actions.some((a) => a.required) ? null : h('button.icon-btn', { onclick: close, title: 'Kapat' }, '✕')),
      h('div.modal-body', body),
      actions.length ? h('div.modal-actions', actions.map((a) =>
        h('button.btn' + (a.primary ? '.primary' : ''), { onclick: () => { const r = a.onClick && a.onClick(); if (r !== false) back.remove(); } }, a.label))) : null));
  document.body.append(back);
  return { close };
}

export function toast(msg, kind = '') {
  const t = h('div.toast' + (kind ? '.' + kind : ''), {}, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

export function fmtTime(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtDate(t) {
  if (!t) return '-';
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function fmtEval(cp) {
  if (cp == null) return '?';
  if (Math.abs(cp) >= 90000) {
    const m = 100000 - Math.abs(cp);
    return (cp > 0 ? '#' : '#-') + Math.ceil(m / 2);
  }
  const v = cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(2);
}
