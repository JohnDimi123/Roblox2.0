// Roblox 2.0 game engine. Renders a world built from part data, runs the local
// character controller + physics, third-person camera, gameplay rules
// (coins/kill/checkpoint/win/boost), shooting, and remote-player rendering.
import * as THREE from 'three';
import { PhysicsWorld, PLAYER_HALF } from './physics.js';
import { buildAvatar, animateLimbs, RemotePlayer, material as mkMaterial } from './character.js';

const WALK = 16, RUN = 26, JUMP_V = 22;

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);
    this.clock = new THREE.Clock();
    this.remotes = new Map();      // connId -> RemotePlayer
    this.selfConnId = null;
    this.callbacks = {};
    this.collected = new Set();    // collected coin ids
    this.score = 0;
    this.health = 100;
    this.running = false;
    this.mode = 'default';
    this.yaw = 0; this.pitch = 0.3; this.dist = 12;
    this._tickAccum = 0;
    this._raycaster = new THREE.Raycaster();
    this._tmp = new THREE.Vector3();
    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize);
  }

  on(event, cb) { this.callbacks[event] = cb; }
  emit(event, ...args) { this.callbacks[event]?.(...args); }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  load(build, avatar, opts = {}) {
    this.mode = build.mode || opts.mode || 'default';
    this.build = build;
    // reset scene
    while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
    this.remotes.clear();
    this.collected.clear();
    this.score = 0; this.health = 100;

    this.scene.background = new THREE.Color(build.skyColor || '#7ec8ff');
    this.scene.fog = new THREE.Fog(build.skyColor || '#7ec8ff', 200, 800);

    // lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x556b2f, 0.8);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(60, 120, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
    sun.shadow.camera.far = 400;
    this.scene.add(sun);

    // physics + parts
    this.physics = new PhysicsWorld(build.gravity ?? -25);
    this.partMeshes = new Map();
    for (const p of build.parts || []) this.addPart(p);

    // local character
    this.avatar = avatar;
    this.character = buildAvatar(avatar);
    this.scene.add(this.character);
    const sp = build.spawn || { x: 0, y: 4, z: 0 };
    this.pos = { x: sp.x, y: sp.y + PLAYER_HALF.y, z: sp.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.respawnPoint = { ...this.pos };
    this.onGround = false;
    this.anim = 'idle';
    this.phase = 0;

    this.resize();
  }

  addPart(p) {
    const geomSize = p.size || { x: 4, y: 1, z: 4 };
    let geo;
    if (p.shape === 'sphere') geo = new THREE.SphereGeometry(geomSize.x / 2, 24, 16);
    else if (p.shape === 'cylinder') geo = new THREE.CylinderGeometry(geomSize.x / 2, geomSize.x / 2, geomSize.y, 24);
    else geo = new THREE.BoxGeometry(geomSize.x, geomSize.y, geomSize.z);

    const isCoin = p.tag === 'coin';
    const mtl = mkMaterial(p.color || '#9aa0a6', isCoin ? 'neon' : (p.material || 'plastic'));
    const mesh = new THREE.Mesh(geo, mtl);
    mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
    if (p.rot?.y) mesh.rotation.y = p.rot.y;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.part = p;
    this.scene.add(mesh);
    this.partMeshes.set(p.id, mesh);

    // collider (AABB approximation, fine for gameplay)
    const half = { x: geomSize.x / 2, y: geomSize.y / 2, z: geomSize.z / 2 };
    if (p.shape === 'sphere') { half.y = half.x; half.z = half.x; }
    this.physics.addBox(p.id, p.pos, half, { tag: p.tag || 'none', anchored: p.anchored !== false });
    return mesh;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      this.frame();
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  setInput(input) { this.input = input; }
  setSelfConnId(id) { this.selfConnId = id; }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.updateLocal(dt);
    for (const r of this.remotes.values()) r.update(dt);
    this.updateCamera(dt);
    // spin/bob coins
    for (const [id, mesh] of this.partMeshes) {
      const part = mesh.userData.part;
      if (part?.tag === 'coin' && !this.collected.has(id)) { mesh.rotation.y += dt * 2; mesh.position.y = part.pos.y + Math.sin(performance.now() / 400) * 0.2; }
    }
    this.renderer.render(this.scene, this.camera);

    // network tick (20Hz)
    this._tickAccum += dt;
    if (this._tickAccum >= 0.05) {
      this._tickAccum = 0;
      this.emit('state', { pos: this.pos, rot: this.character.rotation.y, vel: this.vel, anim: this.anim, health: this.health });
    }
    this.input?.endFrame();
  }

  updateLocal(dt) {
    if (!this.input) return;
    const inp = this.input;

    // mouselook
    this.yaw -= inp.mouseDX * 0.0025;
    this.pitch = Math.max(-0.2, Math.min(1.2, this.pitch + inp.mouseDY * 0.0025));
    this.dist = Math.max(5, Math.min(28, this.dist + inp.wheel * 0.01));

    // movement input relative to camera yaw
    let ix = 0, iz = 0;
    if (inp.down('KeyW') || inp.down('ArrowUp')) iz -= 1;
    if (inp.down('KeyS') || inp.down('ArrowDown')) iz += 1;
    if (inp.down('KeyA') || inp.down('ArrowLeft')) ix -= 1;
    if (inp.down('KeyD') || inp.down('ArrowRight')) ix += 1;
    const running = inp.down('ShiftLeft') || inp.down('ShiftRight');
    const speed = running ? RUN : WALK;

    let moving = ix !== 0 || iz !== 0;
    if (moving) {
      const len = Math.hypot(ix, iz); ix /= len; iz /= len;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // forward is -z relative to yaw
      const wx = ix * cos - iz * sin;
      const wz = ix * sin + iz * cos;
      this.vel.x = wx * speed;
      this.vel.z = wz * speed;
      const targetRot = Math.atan2(wx, wz);
      let dr = targetRot - this.character.rotation.y;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      this.character.rotation.y += dr * Math.min(1, dt * 14);
    } else {
      this.vel.x *= 0.7; this.vel.z *= 0.7;
    }

    // jump
    if ((inp.pressed('Space')) && this.onGround) { this.vel.y = JUMP_V; this.onGround = false; }

    // gravity
    this.vel.y += this.physics.gravity * dt;

    // integrate + collide
    const res = this.physics.moveBody(this.pos, this.vel, PLAYER_HALF, dt);
    this.onGround = res.onGround;

    // fell off the world
    if (this.pos.y < -40) this.respawn();

    // gameplay triggers
    for (const c of res.touched) this.handleTrigger(c);

    // animation state
    if (!this.onGround) this.anim = 'jump';
    else if (moving) this.anim = running ? 'run' : 'walk';
    else this.anim = 'idle';

    // place + animate character (mesh origin is at feet, pos is center)
    this.character.position.set(this.pos.x, this.pos.y - PLAYER_HALF.y, this.pos.z);
    this.phase += dt;
    animateLimbs(this.character, this.anim, dt, this.phase);

    // shooting (pvp)
    if (this.mode === 'pvp' && inp.pressed('Space') === false && inp.mouseDown && this._canShoot()) {
      this.shoot();
    }
  }

  _canShoot() {
    const now = performance.now();
    if (!this._lastShot || now - this._lastShot > 280) { this._lastShot = now; return true; }
    return false;
  }

  handleTrigger(c) {
    switch (c.tag) {
      case 'coin':
        if (!this.collected.has(c.id)) {
          this.collected.add(c.id);
          const mesh = this.partMeshes.get(c.id);
          if (mesh) mesh.visible = false;
          this.score += 10;
          this.emit('score', this.score);
        }
        break;
      case 'kill':
        this.respawn();
        this.emit('died');
        break;
      case 'checkpoint':
        this.respawnPoint = { x: c.center.x, y: c.center.y + c.half.y + PLAYER_HALF.y + 0.5, z: c.center.z };
        this.emit('checkpoint');
        break;
      case 'boost':
        this.vel.y = JUMP_V * 1.6;
        break;
      case 'win':
        if (!this._won) { this._won = true; this.emit('win', this.score); setTimeout(() => (this._won = false), 3000); }
        break;
    }
  }

  respawn() {
    this.pos = { ...this.respawnPoint };
    this.vel = { x: 0, y: 0, z: 0 };
    this.health = 100;
  }

  updateCamera(dt) {
    const cx = Math.sin(this.yaw) * Math.cos(this.pitch);
    const cy = Math.sin(this.pitch);
    const cz = Math.cos(this.yaw) * Math.cos(this.pitch);
    const target = new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z);
    const desired = new THREE.Vector3(
      target.x + cx * this.dist,
      target.y + cy * this.dist + 1.5,
      target.z + cz * this.dist
    );
    this.camera.position.lerp(desired, Math.min(1, dt * 12));
    this.camera.lookAt(target);
  }

  shoot() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = { x: this.pos.x, y: this.pos.y + 1, z: this.pos.z };
    // tracer
    this.spawnTracer(origin, dir);
    this.emit('shoot', { origin, dir: { x: dir.x, y: dir.y, z: dir.z } });
    // hit detection vs remote players
    let nearest = null;
    for (const r of this.remotes.values()) {
      const box = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(r.mesh.position.x, r.mesh.position.y + 1.5, r.mesh.position.z),
        new THREE.Vector3(2, 3.5, 2)
      );
      const ray = new THREE.Ray(new THREE.Vector3(origin.x, origin.y, origin.z), dir.clone().normalize());
      const pt = ray.intersectBox(box, this._tmp);
      if (pt) {
        const d = ray.origin.distanceTo(pt);
        if (!nearest || d < nearest.d) nearest = { d, r };
      }
    }
    if (nearest) this.emit('hit', { connId: nearest.r.connId });
  }

  spawnTracer(origin, dir) {
    const end = new THREE.Vector3(origin.x, origin.y, origin.z).add(dir.clone().multiplyScalar(120));
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(origin.x, origin.y, origin.z), end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffee00 }));
    this.scene.add(line);
    setTimeout(() => this.scene.remove(line), 80);
  }

  // ---- remote players ----
  applySnapshot(players) {
    const seen = new Set();
    for (const p of players) {
      if (p.connId === this.selfConnId) continue;
      seen.add(p.connId);
      let r = this.remotes.get(p.connId);
      if (!r) { r = new RemotePlayer(this.scene, p); this.remotes.set(p.connId, r); }
      r.setTarget(p.pos, p.rot, p.anim);
    }
    for (const [id, r] of this.remotes) {
      if (!seen.has(id)) { r.remove(); this.remotes.delete(id); }
    }
  }

  addRemote(info) {
    if (info.connId === this.selfConnId || this.remotes.has(info.connId)) return;
    this.remotes.set(info.connId, new RemotePlayer(this.scene, info));
  }
  removeRemote(connId) {
    const r = this.remotes.get(connId);
    if (r) { r.remove(); this.remotes.delete(connId); }
  }
  handleEvent(ev) {
    if (ev.name === 'shoot' && ev.data) this.spawnTracer(ev.data.origin, new THREE.Vector3(ev.data.dir.x, ev.data.dir.y, ev.data.dir.z));
    if (ev.name === 'hit' && ev.data?.connId === this.selfConnId) {
      this.health = Math.max(0, this.health - 25);
      this.emit('damaged', this.health);
      if (this.health <= 0) { this.respawn(); this.emit('died'); }
    }
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._resize);
    this.renderer.dispose();
  }
}
