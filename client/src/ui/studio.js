import * as THREE from 'three';
import { el, clear, toast } from './dom.js';
import { api } from '../net.js';
import { material as mkMaterial } from '../engine/character.js';

export async function renderStudio(root, ctx) {
  const page = el('div', { class: 'page studio-home' });
  root.appendChild(page);
  await showList();

  async function showList() {
    clear(page);
    page.className = 'page studio-home';
    const grid = el('div', { class: 'game-grid' });
    const createBtn = el('button', { class: 'btn btn-primary' }, '+ Create New Game');
    createBtn.addEventListener('click', showCreate);
    page.append(
      el('div', { class: 'hero' }, el('h1', {}, 'Studio'), el('p', { class: 'muted' }, 'Build, edit and publish your games.')),
      el('div', { class: 'toolbar' }, createBtn),
      grid
    );
    try {
      const { games } = await api('/api/games/mine');
      if (!games.length) grid.appendChild(el('div', { class: 'muted' }, 'No games yet. Create your first!'));
      for (const g of games) grid.appendChild(myGameCard(g));
    } catch (e) { grid.appendChild(el('div', { class: 'muted' }, e.message)); }
  }

  function myGameCard(g) {
    const card = el('div', { class: 'card' },
      el('div', { class: 'thumb', style: { background: 'linear-gradient(135deg,#667eea,#764ba2)' } },
        el('div', { class: 'thumb-genre' }, g.published ? 'PUBLISHED' : 'DRAFT')),
      el('div', { class: 'card-body' },
        el('div', { class: 'card-title' }, g.name),
        el('div', { class: 'card-stats' }, el('span', {}, `▶ ${g.plays}`), el('span', {}, `👍 ${g.likes}`)),
        el('div', { class: 'card-actions' },
          el('button', { class: 'btn btn-small', onclick: () => openEditor(g.id) }, 'Edit'),
          el('button', { class: 'btn btn-small btn-ghost', onclick: () => ctx.navigate('play', { gameId: g.id }) }, 'Play')
        )
      )
    );
    return card;
  }

  async function showCreate() {
    clear(page);
    const name = el('input', { class: 'field', placeholder: 'Game name', value: 'My Awesome Game' });
    const desc = el('textarea', { class: 'field', placeholder: 'Description', rows: '3' });
    const templSel = el('select', { class: 'field select' }, el('option', { value: '' }, 'Empty Baseplate'));
    try {
      const { templates } = await api('/api/templates', { auth: false });
      for (const t of templates) templSel.appendChild(el('option', { value: t.key }, t.name));
    } catch {}
    const create = el('button', { class: 'btn btn-primary' }, 'Create Game');
    create.addEventListener('click', async () => {
      create.disabled = true;
      try {
        let template = null;
        if (templSel.value) template = await api('/api/templates/' + templSel.value, { auth: false });
        const g = await api('/api/games', { method: 'POST', body: { name: name.value.trim() || 'Untitled', description: desc.value, genre: template?.genre || 'All', template } });
        toast('Game created!', 'success');
        openEditor(g.id);
      } catch (e) { toast(e.message, 'error'); create.disabled = false; }
    });
    page.append(
      el('div', { class: 'create-card' },
        el('h1', {}, 'Create New Game'),
        el('label', {}, 'Name'), name,
        el('label', {}, 'Description'), desc,
        el('label', {}, 'Start from template'), templSel,
        el('div', { class: 'row-gap' }, create, el('button', { class: 'btn btn-ghost', onclick: showList }, 'Cancel'))
      )
    );
  }

  async function openEditor(gameId) {
    clear(page);
    let game;
    try { game = await api(`/api/games/${gameId}`, { auth: false }); }
    catch (e) { toast(e.message, 'error'); return showList(); }
    new StudioEditor(page, game, ctx, showList);
  }
}

// -------------------- 3D editor --------------------
class StudioEditor {
  constructor(container, game, ctx, onExit) {
    this.game = game;
    this.build = game.build;
    this.ctx = ctx;
    this.onExit = onExit;
    this.selected = null;
    this.meshes = new Map();
    this.container = container;
    container.className = 'studio-editor';
    this.buildUI();
    this.initScene();
    this.rebuildAll();
    this.loop();
    ctx.onDispose(() => this.dispose());
  }

  buildUI() {
    this.canvas = el('canvas', { class: 'studio-canvas' });
    this.propsPanel = el('div', { class: 'props-panel' });
    this.toolbar = el('div', { class: 'studio-toolbar' },
      el('button', { class: 'btn btn-ghost btn-small', onclick: () => this.exit() }, '← Back'),
      el('span', { class: 'studio-name' }, this.game.name),
      el('div', { class: 'spacer' }),
      tbtn('+ Box', () => this.addPart('box')),
      tbtn('+ Sphere', () => this.addPart('sphere')),
      tbtn('+ Cylinder', () => this.addPart('cylinder')),
      tbtn('Duplicate', () => this.duplicate()),
      tbtn('Delete', () => this.deleteSelected()),
      tbtn('⚙ World', () => this.showWorldProps()),
      el('button', { class: 'btn btn-small', onclick: () => this.save() }, '💾 Save'),
      el('button', { class: 'btn btn-small btn-primary', onclick: () => this.togglePublish() }, this.game.published ? 'Unpublish' : 'Publish'),
      el('button', { class: 'btn btn-small btn-ghost', onclick: () => this.save().then(() => this.ctx.navigate('play', { gameId: this.game.id })) }, '▶ Test')
    );
    this.viewport = el('div', { class: 'studio-viewport' }, this.canvas);
    this.container.append(this.toolbar, el('div', { class: 'studio-body' }, this.viewport, this.propsPanel));
    this.showWorldProps();
  }

  initScene() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.build.skyColor || '#7ec8ff');
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    this.camYaw = 0.6; this.camPitch = 0.6; this.camDist = 60; this.camTarget = new THREE.Vector3(0, 2, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444433, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0); sun.position.set(60, 100, 40); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -120; sun.shadow.camera.right = 120; sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
    this.scene.add(sun);
    this.grid = new THREE.GridHelper(200, 50, 0x000000, 0x333333); this.grid.position.y = 0.02; this.scene.add(this.grid);
    this.raycaster = new THREE.Raycaster();

    // camera orbit controls
    let dragging = false, px = 0, py = 0, pan = false;
    this.canvas.addEventListener('mousedown', (e) => { dragging = true; pan = e.button === 2 || e.shiftKey; px = e.clientX; py = e.clientY; });
    window.addEventListener('mouseup', () => { dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - px, dy = e.clientY - py; px = e.clientX; py = e.clientY;
      if (pan) {
        const right = new THREE.Vector3().crossVectors(this.camera.up, this.camera.getWorldDirection(new THREE.Vector3())).normalize();
        this.camTarget.addScaledVector(right, dx * 0.05);
        this.camTarget.y += dy * 0.05;
      } else { this.camYaw -= dx * 0.006; this.camPitch = Math.max(0.05, Math.min(1.45, this.camPitch + dy * 0.006)); }
    });
    this.canvas.addEventListener('wheel', (e) => { this.camDist = Math.max(8, Math.min(200, this.camDist + e.deltaY * 0.05)); }, { passive: true });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('click', (e) => this.pick(e));

    this._resize = () => this.resize(); window.addEventListener('resize', this._resize);
    setTimeout(() => this.resize(), 30);
  }

  resize() {
    const w = this.viewport.clientWidth || 800, h = this.viewport.clientHeight || 600;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  rebuildAll() {
    for (const m of this.meshes.values()) this.scene.remove(m);
    this.meshes.clear();
    this.scene.background = new THREE.Color(this.build.skyColor || '#7ec8ff');
    for (const p of this.build.parts) this.makeMesh(p);
  }

  makeMesh(p) {
    let geo;
    const s = p.size;
    if (p.shape === 'sphere') geo = new THREE.SphereGeometry(s.x / 2, 20, 14);
    else if (p.shape === 'cylinder') geo = new THREE.CylinderGeometry(s.x / 2, s.x / 2, s.y, 20);
    else geo = new THREE.BoxGeometry(s.x, s.y, s.z);
    const mesh = new THREE.Mesh(geo, mkMaterial(tagColor(p), p.tag !== 'none' ? 'neon' : (p.material || 'plastic')));
    mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
    if (p.rot?.y) mesh.rotation.y = p.rot.y;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.part = p;
    this.scene.add(mesh);
    this.meshes.set(p.id, mesh);
    return mesh;
  }

  refreshMesh(p) {
    const old = this.meshes.get(p.id);
    if (old) this.scene.remove(old);
    this.meshes.delete(p.id);
    const m = this.makeMesh(p);
    if (this.selected === p) this.highlight(m);
  }

  pick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(mouse, this.camera);
    const hits = this.raycaster.intersectObjects([...this.meshes.values()], false);
    if (hits.length) this.select(hits[0].object.userData.part);
  }

  highlight(mesh) {
    if (this._outline) { this._outline.parent?.remove(this._outline); this._outline = null; }
    if (!mesh) return;
    const box = new THREE.BoxHelper(mesh, 0xffcc00);
    this._outline = box; this.scene.add(box);
  }

  select(p) {
    this.selected = p;
    this.highlight(this.meshes.get(p.id));
    this.showPartProps(p);
  }

  // ---------- property panels ----------
  showWorldProps() {
    this.selected = null; this.highlight(null);
    clear(this.propsPanel);
    const p = this.propsPanel;
    p.appendChild(el('h3', {}, 'World Settings'));
    p.appendChild(this.colorField('Sky color', this.build.skyColor || '#7ec8ff', (v) => { this.build.skyColor = v; this.scene.background = new THREE.Color(v); }));
    p.appendChild(this.numField('Gravity', this.build.gravity ?? -25, (v) => { this.build.gravity = v; }, -100, 0));
    p.appendChild(el('h4', {}, 'Spawn point'));
    for (const ax of ['x', 'y', 'z']) p.appendChild(this.numField(ax.toUpperCase(), this.build.spawn[ax], (v) => { this.build.spawn[ax] = v; }));
    p.appendChild(el('p', { class: 'muted small' }, 'Click a part in the viewport to edit it. Drag to orbit, Shift+drag to pan, scroll to zoom.'));
  }

  showPartProps(part) {
    clear(this.propsPanel);
    const p = this.propsPanel;
    p.appendChild(el('h3', {}, 'Part'));
    p.appendChild(el('h4', {}, 'Position'));
    for (const ax of ['x', 'y', 'z']) p.appendChild(this.numField(ax.toUpperCase(), part.pos[ax], (v) => { part.pos[ax] = v; this.refreshMesh(part); }, undefined, undefined, 0.5));
    p.appendChild(el('h4', {}, 'Size'));
    for (const ax of ['x', 'y', 'z']) p.appendChild(this.numField(ax.toUpperCase(), part.size[ax], (v) => { part.size[ax] = Math.max(0.1, v); this.refreshMesh(part); }, 0.1, undefined, 0.5));
    p.appendChild(this.numField('Rotation Y°', Math.round((part.rot?.y || 0) * 180 / Math.PI), (v) => { part.rot = { y: v * Math.PI / 180 }; this.refreshMesh(part); }));
    p.appendChild(this.colorField('Color', part.color, (v) => { part.color = v; this.refreshMesh(part); }));
    p.appendChild(this.selectField('Material', part.material || 'plastic', ['plastic', 'metal', 'neon', 'wood'], (v) => { part.material = v; this.refreshMesh(part); }));
    p.appendChild(this.selectField('Shape', part.shape, ['box', 'sphere', 'cylinder'], (v) => { part.shape = v; this.refreshMesh(part); }));
    p.appendChild(this.selectField('Behavior', part.tag || 'none', ['none', 'coin', 'kill', 'checkpoint', 'win', 'boost'], (v) => { part.tag = v; this.refreshMesh(part); }));
    p.appendChild(this.checkField('Anchored (static)', part.anchored !== false, (v) => { part.anchored = v; }));
    p.appendChild(el('p', { class: 'muted small' }, 'Behavior turns a part into a coin, kill-brick, checkpoint, win-pad or jump-boost.'));
  }

  // field builders
  numField(label, value, onChange, min, max, step = 1) {
    const inp = el('input', { type: 'number', class: 'field small', value: String(value), step: String(step) });
    if (min !== undefined) inp.min = String(min);
    if (max !== undefined) inp.max = String(max);
    inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (!isNaN(v)) onChange(v); });
    return el('div', { class: 'prop-row' }, el('label', {}, label), inp);
  }
  colorField(label, value, onChange) {
    const inp = el('input', { type: 'color', value, class: 'color-input' });
    inp.addEventListener('input', () => onChange(inp.value));
    return el('div', { class: 'prop-row' }, el('label', {}, label), inp);
  }
  selectField(label, value, opts, onChange) {
    const sel = el('select', { class: 'field small' }, ...opts.map((o) => el('option', { value: o, selected: o === value ? 'true' : null }, o)));
    sel.addEventListener('change', () => onChange(sel.value));
    return el('div', { class: 'prop-row' }, el('label', {}, label), sel);
  }
  checkField(label, value, onChange) {
    const inp = el('input', { type: 'checkbox' }); inp.checked = value;
    inp.addEventListener('change', () => onChange(inp.checked));
    return el('div', { class: 'prop-row' }, el('label', {}, label), inp);
  }

  // ---------- actions ----------
  addPart(shape) {
    const t = this.camTarget;
    const part = {
      id: 'p_' + Math.random().toString(36).slice(2, 11),
      shape, pos: { x: Math.round(t.x), y: 4, z: Math.round(t.z) },
      size: { x: 4, y: 4, z: 4 }, rot: { y: 0 }, color: '#4aa3ff', material: 'plastic', anchored: true, tag: 'none'
    };
    this.build.parts.push(part);
    this.makeMesh(part);
    this.select(part);
  }
  duplicate() {
    if (!this.selected) return;
    const c = structuredClone(this.selected);
    c.id = 'p_' + Math.random().toString(36).slice(2, 11);
    c.pos.x += 4;
    this.build.parts.push(c); this.makeMesh(c); this.select(c);
  }
  deleteSelected() {
    if (!this.selected) return;
    if (this.selected.id === 'baseplate') return toast('Cannot delete the baseplate.', 'error');
    this.build.parts = this.build.parts.filter((x) => x !== this.selected);
    const m = this.meshes.get(this.selected.id); if (m) this.scene.remove(m);
    this.meshes.delete(this.selected.id);
    this.highlight(null); this.selected = null; this.showWorldProps();
  }

  async save() {
    try {
      await api(`/api/games/${this.game.id}`, { method: 'PUT', body: { build: this.build } });
      toast('Saved!', 'success');
    } catch (e) { toast(e.message, 'error'); throw e; }
  }
  async togglePublish() {
    try {
      const updated = await api(`/api/games/${this.game.id}`, { method: 'PUT', body: { published: !this.game.published, build: this.build } });
      this.game.published = updated.published;
      toast(updated.published ? 'Game published! It’s now in Discover.' : 'Unpublished.', 'success');
      this.buildUI(); this.initScene(); this.rebuildAll();
    } catch (e) { toast(e.message, 'error'); }
  }
  exit() { this.dispose(); this.onExit(); }

  loop() {
    this._running = true;
    const tick = () => {
      if (!this._running) return;
      this._raf = requestAnimationFrame(tick);
      const cx = Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
      const cy = Math.sin(this.camPitch) * this.camDist;
      const cz = Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
      this.camera.position.set(this.camTarget.x + cx, this.camTarget.y + cy, this.camTarget.z + cz);
      this.camera.lookAt(this.camTarget);
      if (this._outline) this._outline.update();
      this.renderer.render(this.scene, this.camera);
    };
    this._raf = requestAnimationFrame(tick);
  }

  dispose() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._resize);
    this.renderer?.dispose();
  }
}

function tbtn(label, fn) { return el('button', { class: 'btn btn-small btn-tool', onclick: fn }, label); }
function tagColor(p) {
  if (p.tag === 'coin') return '#ffd700';
  if (p.tag === 'kill') return '#e02020';
  if (p.tag === 'checkpoint') return '#ffffff';
  if (p.tag === 'win') return '#ffd700';
  if (p.tag === 'boost') return '#00e5ff';
  return p.color;
}
