// Builds the classic blocky avatar figure from avatar customization data,
// plus a helper for remote players (interpolated movement + floating nametag).
import * as THREE from 'three';

function mat(color, material = 'plastic') {
  const c = new THREE.Color(color);
  if (material === 'neon') return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.8 });
  if (material === 'metal') return new THREE.MeshStandardMaterial({ color: c, metalness: 0.9, roughness: 0.25 });
  if (material === 'wood') return new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
  return new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.0 });
}

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Returns a THREE.Group with named limbs for animation.
export function buildAvatar(avatar = {}) {
  const a = {
    bodyColor: '#f5c542', shirtColor: '#3b82f6', pantsColor: '#1f2937',
    headColor: '#f5c542', face: 'smile', hat: 'none', scale: 1, ...avatar
  };
  const g = new THREE.Group();
  const s = a.scale || 1;

  // torso
  const torso = box(1.4, 1.6, 0.7, mat(a.shirtColor));
  torso.position.y = 1.5;
  g.add(torso);

  // head
  const head = box(1.0, 1.0, 1.0, mat(a.headColor));
  head.position.y = 2.8;
  g.add(head);

  // face decal
  const faceCanvas = makeFace(a.face);
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTex, transparent: true });
  const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), faceMat);
  facePlane.position.set(0, 2.8, 0.51);
  g.add(facePlane);

  // hat
  if (a.hat && a.hat !== 'none') g.add(makeHat(a.hat));

  // arms
  const armGeoMat = mat(a.bodyColor);
  const leftArm = box(0.5, 1.6, 0.6, armGeoMat);
  leftArm.position.set(-0.95, 1.5, 0);
  leftArm.name = 'leftArm';
  const rightArm = leftArm.clone(); rightArm.position.x = 0.95; rightArm.name = 'rightArm';
  g.add(leftArm, rightArm);

  // legs
  const legMat = mat(a.pantsColor);
  const leftLeg = box(0.6, 1.6, 0.6, legMat);
  leftLeg.position.set(-0.35, 0.0, 0);
  leftLeg.name = 'leftLeg';
  const rightLeg = leftLeg.clone(); rightLeg.position.x = 0.35; rightLeg.name = 'rightLeg';
  g.add(leftLeg, rightLeg);

  g.scale.setScalar(s);
  g.userData.limbs = { leftArm, rightArm, leftLeg, rightLeg, head, torso };
  return g;
}

function makeFace(face) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#111';
  // eyes
  ctx.beginPath(); ctx.arc(44, 50, 9, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(84, 50, 9, 0, 7); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#111';
  ctx.beginPath();
  if (face === 'smile' || !face) ctx.arc(64, 70, 26, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (face === 'cool') { ctx.fillRect(30, 44, 30, 12); ctx.fillRect(68, 44, 30, 12); ctx.arc(64, 72, 22, 0.1 * Math.PI, 0.9 * Math.PI); }
  else if (face === 'angry') { ctx.moveTo(40, 88); ctx.lineTo(88, 88); }
  else if (face === 'surprised') ctx.arc(64, 82, 12, 0, 7);
  else ctx.arc(64, 70, 26, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  return cv;
}

function makeHat(hat) {
  if (hat === 'cap') {
    const g = new THREE.Group();
    const top = box(1.05, 0.35, 1.05, mat('#e74c3c')); top.position.y = 3.45;
    const brim = box(1.05, 0.1, 0.6, mat('#c0392b')); brim.position.set(0, 3.32, 0.7);
    g.add(top, brim); return g;
  }
  if (hat === 'crown') {
    const m = mat('#ffd700', 'metal');
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 8), m);
    band.position.y = 3.5; g.add(band); return g;
  }
  if (hat === 'horns') {
    const g = new THREE.Group();
    const l = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 8), mat('#8e44ad', 'neon'));
    l.position.set(-0.35, 3.55, 0); l.rotation.z = 0.3;
    const r = l.clone(); r.position.x = 0.35; r.rotation.z = -0.3;
    g.add(l, r); return g;
  }
  return new THREE.Group();
}

// Remote player with smoothing.
export class RemotePlayer {
  constructor(scene, info) {
    this.connId = info.connId;
    this.userId = info.userId;
    this.name = info.name;
    this.mesh = buildAvatar(info.avatar);
    this.target = { x: info.pos?.x || 0, y: info.pos?.y || 0, z: info.pos?.z || 0 };
    this.targetRot = info.rot || 0;
    this.mesh.position.set(this.target.x, this.target.y, this.target.z);
    this.label = makeLabel(info.name);
    this.label.position.y = 4.2;
    this.mesh.add(this.label);
    this.anim = 'idle';
    this.phase = 0;
    scene.add(this.mesh);
    this.scene = scene;
  }
  setTarget(p, rot, anim) {
    if (p) this.target = p;
    if (typeof rot === 'number') this.targetRot = rot;
    if (anim) this.anim = anim;
  }
  update(dt) {
    const m = this.mesh;
    m.position.x += (this.target.x - m.position.x) * Math.min(1, dt * 12);
    m.position.y += (this.target.y - m.position.y) * Math.min(1, dt * 12);
    m.position.z += (this.target.z - m.position.z) * Math.min(1, dt * 12);
    let dr = this.targetRot - m.rotation.y;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    m.rotation.y += dr * Math.min(1, dt * 12);
    animateLimbs(this.mesh, this.anim, dt, (this.phase += dt));
  }
  remove() { this.scene.remove(this.mesh); }
}

export function makeLabel(text) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 8, 8, 240, 48, 10); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 28px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 16), 128, 32);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  spr.scale.set(3, 0.75, 1);
  return spr;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Shared limb animation used by local + remote avatars.
export function animateLimbs(group, anim, dt, phase) {
  const L = group.userData.limbs;
  if (!L) return;
  if (anim === 'walk' || anim === 'run') {
    const speed = anim === 'run' ? 14 : 9;
    const amp = anim === 'run' ? 0.9 : 0.6;
    const sw = Math.sin(phase * speed) * amp;
    L.leftLeg.rotation.x = sw; L.rightLeg.rotation.x = -sw;
    L.leftArm.rotation.x = -sw; L.rightArm.rotation.x = sw;
  } else if (anim === 'jump') {
    L.leftArm.rotation.x = -2.4; L.rightArm.rotation.x = -2.4;
    L.leftLeg.rotation.x = 0.3; L.rightLeg.rotation.x = -0.3;
  } else {
    // idle ease back
    for (const part of [L.leftArm, L.rightArm, L.leftLeg, L.rightLeg]) part.rotation.x *= 0.8;
  }
}

export { mat as material };
