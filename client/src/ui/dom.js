// Tiny DOM helpers shared across views.
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

let toastTimer;
export function toast(msg, type = 'info') {
  const host = document.getElementById('toast-host');
  const t = el('div', { class: `toast toast-${type}` }, msg);
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}

export function avatarSwatch(avatar) {
  const c = el('canvas', { width: 64, height: 64, class: 'swatch' });
  const ctx = c.getContext('2d');
  ctx.fillStyle = avatar?.headColor || '#f5c542';
  ctx.fillRect(20, 8, 24, 24);
  ctx.fillStyle = avatar?.shirtColor || '#3b82f6';
  ctx.fillRect(16, 32, 32, 20);
  ctx.fillStyle = avatar?.pantsColor || '#1f2937';
  ctx.fillRect(16, 52, 14, 10); ctx.fillRect(34, 52, 14, 10);
  return c;
}
