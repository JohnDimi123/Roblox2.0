// Seeds an official account and a library of playable starter games so the
// platform has content the moment it boots. Also exposes TEMPLATES reused by
// Studio's "Create New" flow.
import { db, newId } from './db.js';
import { hashPassword } from './auth.js';
import { DEFAULT_AVATAR } from './api/accounts.js';

function part(p) {
  return {
    id: newId('p_'),
    shape: 'box',
    pos: { x: 0, y: 0, z: 0 },
    size: { x: 4, y: 1, z: 4 },
    rot: { y: 0 },
    color: '#9aa0a6',
    material: 'plastic',
    anchored: true,
    tag: 'none',
    ...p
  };
}

function baseplate(color = '#4f7d4a', s = 120) {
  return part({ id: 'baseplate', pos: { x: 0, y: -1, z: 0 }, size: { x: s, y: 2, z: s }, color, material: 'plastic' });
}

// ---- Obby (obstacle course) -------------------------------------------------
function obbyBuild() {
  const parts = [baseplate('#3b6b39', 40)];
  let z = 0;
  let y = 1;
  const colors = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22'];
  for (let i = 0; i < 18; i++) {
    z += 7 + Math.random() * 3;
    y += (Math.random() - 0.3) * 2;
    const x = Math.sin(i * 0.7) * 8;
    const tag = i % 6 === 5 ? 'checkpoint' : 'none';
    parts.push(part({
      pos: { x, y, z }, size: { x: 4, y: 1, z: 4 },
      color: tag === 'checkpoint' ? '#ffffff' : colors[i % colors.length], tag
    }));
    if (i % 4 === 2) {
      parts.push(part({ shape: 'box', pos: { x: x + 4, y: y + 1.5, z }, size: { x: 3, y: 3, z: 0.5 }, color: '#c0392b', material: 'neon', tag: 'kill' }));
    }
    if (i % 5 === 3) {
      parts.push(part({ pos: { x, y: y + 0.5, z: z + 0.1 }, size: { x: 2, y: 0.5, z: 2 }, color: '#00e5ff', material: 'neon', tag: 'boost' }));
    }
  }
  z += 8;
  parts.push(part({ pos: { x: 0, y: y + 1, z }, size: { x: 8, y: 1, z: 8 }, color: '#ffd700', material: 'neon', tag: 'win' }));
  return { gravity: -28, spawn: { x: 0, y: 3, z: -4 }, skyColor: '#8ec9ff', parts, scripts: [] };
}

// ---- Tower of climbing ------------------------------------------------------
function towerBuild() {
  const parts = [baseplate('#2c3e50', 30)];
  let y = 1;
  for (let i = 0; i < 24; i++) {
    y += 3;
    const angle = i * 0.9;
    const x = Math.cos(angle) * 6;
    const z = Math.sin(angle) * 6;
    parts.push(part({ pos: { x, y, z }, size: { x: 4, y: 0.8, z: 4 }, color: i % 2 ? '#1abc9c' : '#16a085', material: 'plastic', tag: i % 8 === 7 ? 'checkpoint' : 'none' }));
    if (i % 3 === 0) parts.push(part({ shape: 'sphere', pos: { x: -x, y: y + 1, z: -z }, size: { x: 2, y: 2, z: 2 }, color: '#e74c3c', material: 'neon', tag: 'kill' }));
  }
  parts.push(part({ pos: { x: 0, y: y + 4, z: 0 }, size: { x: 6, y: 1, z: 6 }, color: '#ffd700', material: 'neon', tag: 'win' }));
  return { gravity: -26, spawn: { x: 0, y: 3, z: 0 }, skyColor: '#fbc7a4', parts, scripts: [] };
}

// ---- Paintball arena (PvP shooter) -----------------------------------------
function arenaBuild() {
  const parts = [baseplate('#6b6b6b', 80)];
  // perimeter walls
  const wall = (x, z, w, d) => part({ pos: { x, y: 3, z }, size: { x: w, y: 6, z: d }, color: '#34495e', material: 'metal' });
  parts.push(wall(0, 40, 80, 1), wall(0, -40, 80, 1), wall(40, 0, 1, 80), wall(-40, 0, 1, 80));
  // cover blocks
  for (let i = 0; i < 20; i++) {
    const x = (Math.random() - 0.5) * 64;
    const z = (Math.random() - 0.5) * 64;
    parts.push(part({ pos: { x, y: 1.5, z }, size: { x: 3 + Math.random() * 3, y: 3, z: 3 }, color: ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'][i % 4], material: 'plastic' }));
  }
  // central tower
  parts.push(part({ pos: { x: 0, y: 4, z: 0 }, size: { x: 8, y: 8, z: 8 }, color: '#2c3e50', material: 'metal' }));
  return { gravity: -25, spawn: { x: 0, y: 3, z: -30 }, skyColor: '#5a6a7a', mode: 'pvp', parts, scripts: [] };
}

// ---- Racing track -----------------------------------------------------------
function raceBuild() {
  const parts = [baseplate('#3a7d44', 160)];
  const pts = 40;
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const r = 50 + Math.sin(a * 3) * 10;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    parts.push(part({ pos: { x, y: 0.2, z }, size: { x: 10, y: 0.4, z: 10 }, rot: { y: a }, color: i % 2 ? '#2c3e50' : '#34495e', material: 'plastic' }));
    if (i % 10 === 0) parts.push(part({ pos: { x, y: 1, z }, size: { x: 10, y: 0.2, z: 1 }, color: '#ffffff', material: 'neon', tag: i === 0 ? 'win' : 'checkpoint' }));
  }
  return { gravity: -25, spawn: { x: 50, y: 3, z: 0 }, skyColor: '#aee1ff', parts, scripts: [] };
}

// ---- Creative sandbox -------------------------------------------------------
function sandboxBuild() {
  const parts = [baseplate('#7fb069', 120)];
  parts.push(part({ pos: { x: 0, y: 1, z: 8 }, size: { x: 6, y: 2, z: 6 }, color: '#e67e22', material: 'wood', anchored: false }));
  parts.push(part({ shape: 'sphere', pos: { x: 5, y: 2, z: 0 }, size: { x: 2, y: 2, z: 2 }, color: '#9b59b6', material: 'plastic', anchored: false }));
  parts.push(part({ shape: 'cylinder', pos: { x: -5, y: 2, z: 0 }, size: { x: 2, y: 4, z: 2 }, color: '#1abc9c', material: 'metal', anchored: false }));
  return { gravity: -25, spawn: { x: 0, y: 3, z: 0 }, skyColor: '#bfe3ff', parts, scripts: [] };
}

export const TEMPLATES = [
  { key: 'obby', name: 'Obby (Obstacle Course)', genre: 'Adventure', build: obbyBuild },
  { key: 'tower', name: 'Tower of Climbing', genre: 'Adventure', build: towerBuild },
  { key: 'arena', name: 'Paintball Arena (PvP)', genre: 'Shooter', build: arenaBuild },
  { key: 'race', name: 'Racing Track', genre: 'Racing', build: raceBuild },
  { key: 'sandbox', name: 'Creative Sandbox', genre: 'Sandbox', build: sandboxBuild }
];

export function seed() {
  if (db('users').count() > 0 || db('games').count() > 0) return;
  console.log('[seed] creating official account and starter games...');

  const official = db('users').insert({
    id: 'u_official',
    username: 'Roblox',
    displayName: 'Roblox',
    passwordHash: hashPassword('admin'),
    avatar: { ...DEFAULT_AVATAR, shirtColor: '#e2231a', bodyColor: '#cccccc' },
    robux: 1000000,
    bio: 'Official platform account.',
    inventory: [], friends: [], friendRequests: []
  });

  const seeds = [
    { name: 'Mega Obby', desc: 'Climb 18 stages of deadly obstacles. Reach the gold platform to win!', tpl: obbyBuild, genre: 'Adventure' },
    { name: 'Tower of Doom', desc: 'A spiraling tower of climbing. Dodge the spinning spheres.', tpl: towerBuild, genre: 'Adventure' },
    { name: 'Paintball Arena', desc: 'Fast-paced PvP. Shoot rivals, take cover, top the leaderboard.', tpl: arenaBuild, genre: 'Shooter' },
    { name: 'Speedway GP', desc: 'Race around the loop. First to the finish line wins.', tpl: raceBuild, genre: 'Racing' },
    { name: 'Build World', desc: 'A creative sandbox. Spawn parts and mess with physics.', tpl: sandboxBuild, genre: 'Sandbox' }
  ];
  for (const s of seeds) {
    db('games').insert({
      id: newId('g_'),
      name: s.name,
      description: s.desc,
      genre: s.genre,
      creatorId: official.id,
      creatorName: 'Roblox',
      build: s.tpl(),
      maxPlayers: 12,
      published: true,
      plays: Math.floor(Math.random() * 5000),
      likedBy: [],
      thumbnail: null
    });
  }
  console.log(`[seed] done. ${db('games').count()} games available.`);
}
