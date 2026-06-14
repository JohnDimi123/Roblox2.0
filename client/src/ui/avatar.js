import * as THREE from 'three';
import { el, toast } from './dom.js';
import { api } from '../net.js';
import { state } from '../state.js';
import { buildAvatar } from '../engine/character.js';

export function renderAvatar(root, ctx) {
  const avatar = structuredClone(state.user.avatar || {});
  const canvas = el('canvas', { class: 'avatar-canvas' });

  // --- 3D preview ---
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  cam.position.set(0, 2.5, 9);
  cam.lookAt(0, 1.8, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.1));
  const d = new THREE.DirectionalLight(0xffffff, 0.9); d.position.set(5, 10, 7); scene.add(d);
  let fig = buildAvatar(avatar); scene.add(fig);

  let raf, running = true;
  function size() {
    const w = canvas.clientWidth || 360, h = canvas.clientHeight || 460;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    fig.rotation.y += 0.012;
    renderer.render(scene, cam);
  }
  ctx.onDispose(() => { running = false; cancelAnimationFrame(raf); renderer.dispose(); });

  function rebuild() {
    scene.remove(fig);
    fig = buildAvatar(avatar);
    scene.add(fig);
  }

  // --- controls ---
  function colorRow(label, key) {
    const input = el('input', { type: 'color', value: avatar[key] || '#cccccc', class: 'color-input' });
    input.addEventListener('input', () => { avatar[key] = input.value; rebuild(); });
    return el('div', { class: 'ctrl-row' }, el('label', {}, label), input);
  }
  function optionRow(label, key, options) {
    const sel = el('select', { class: 'field select' },
      ...options.map((o) => el('option', { value: o, selected: avatar[key] === o ? 'true' : null }, o))
    );
    sel.addEventListener('change', () => { avatar[key] = sel.value; rebuild(); });
    return el('div', { class: 'ctrl-row' }, el('label', {}, label), sel);
  }
  const scale = el('input', { type: 'range', min: '0.7', max: '1.4', step: '0.05', value: String(avatar.scale || 1), class: 'slider' });
  scale.addEventListener('input', () => { avatar.scale = parseFloat(scale.value); rebuild(); });

  const saveBtn = el('button', { class: 'btn btn-primary' }, 'Save Avatar');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      const updated = await api('/api/me/avatar', { method: 'PUT', body: { avatar } });
      state.user = { ...state.user, avatar: updated.avatar }; state.save();
      toast('Avatar saved!', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { saveBtn.disabled = false; }
  });

  root.appendChild(
    el('div', { class: 'page avatar-page' },
      el('h1', {}, 'Avatar Editor'),
      el('div', { class: 'avatar-layout' },
        el('div', { class: 'avatar-preview' }, canvas),
        el('div', { class: 'avatar-controls' },
          colorRow('Skin', 'headColor'),
          colorRow('Arms/Legs base', 'bodyColor'),
          colorRow('Shirt', 'shirtColor'),
          colorRow('Pants', 'pantsColor'),
          optionRow('Face', 'face', ['smile', 'cool', 'angry', 'surprised']),
          optionRow('Hat', 'hat', ['none', 'cap', 'crown', 'horns']),
          el('div', { class: 'ctrl-row' }, el('label', {}, 'Height'), scale),
          saveBtn
        )
      )
    )
  );
  // bodyColor in builder controls headColor key naming — keep skin = headColor.
  setTimeout(size, 30);
  window.addEventListener('resize', size);
  ctx.onDispose(() => window.removeEventListener('resize', size));
  loop();
}
