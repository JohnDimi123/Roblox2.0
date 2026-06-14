import { el, clear, toast } from './dom.js';
import { api } from '../net.js';

export function renderAssets(root, ctx) {
  const page = el('div', { class: 'page' });
  const grid = el('div', { class: 'asset-grid' });
  const nameInput = el('input', { class: 'field', placeholder: 'Asset name' });
  const typeSel = el('select', { class: 'field select' },
    el('option', { value: 'decal' }, 'Decal / Image'),
    el('option', { value: 'texture' }, 'Texture'));
  const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'field' });
  const uploadBtn = el('button', { class: 'btn btn-primary' }, 'Upload');

  uploadBtn.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    if (!file) return toast('Choose an image first.', 'error');
    if (file.size > 6 * 1024 * 1024) return toast('Image too large (max 6MB).', 'error');
    uploadBtn.disabled = true;
    try {
      const url = await fileToDataUrl(file);
      await api('/api/assets', { method: 'POST', body: { name: nameInput.value.trim() || file.name, type: typeSel.value, url } });
      toast('Asset uploaded!', 'success');
      nameInput.value = ''; fileInput.value = '';
      load();
    } catch (e) { toast(e.message, 'error'); } finally { uploadBtn.disabled = false; }
  });

  async function load() {
    clear(grid);
    try {
      const { assets } = await api('/api/assets?mine=1');
      if (!assets.length) grid.appendChild(el('div', { class: 'muted' }, 'No assets yet. Upload an image above.'));
      for (const a of assets) grid.appendChild(assetCard(a));
    } catch (e) { grid.appendChild(el('div', { class: 'muted' }, e.message)); }
  }

  function assetCard(a) {
    const del = el('button', { class: 'btn btn-small btn-ghost' }, 'Delete');
    del.addEventListener('click', async () => { await api('/api/assets/' + a.id, { method: 'DELETE' }); load(); });
    return el('div', { class: 'asset-card' },
      el('img', { class: 'asset-img', src: a.url }),
      el('div', { class: 'asset-name' }, a.name),
      el('div', { class: 'asset-type' }, a.type),
      del);
  }

  page.append(
    el('h1', {}, 'Assets'),
    el('p', { class: 'muted' }, 'Upload images to use as decals and textures in your games.'),
    el('div', { class: 'toolbar wrap' }, nameInput, typeSel, fileInput, uploadBtn),
    grid
  );
  root.appendChild(page);
  load();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
