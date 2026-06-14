// A compact physics world: axis-aligned collision resolution + a character
// controller with gravity, jumping and ground detection. Deliberately
// dependency-free (no native/wasm) so it runs everywhere the engine does.

export const PLAYER_HALF = { x: 0.6, y: 1.4, z: 0.6 };

function overlap(aMin, aMax, bMin, bMax) {
  return (
    aMin.x < bMax.x && aMax.x > bMin.x &&
    aMin.y < bMax.y && aMax.y > bMin.y &&
    aMin.z < bMax.z && aMax.z > bMin.z
  );
}

export class PhysicsWorld {
  constructor(gravity = -25) {
    this.gravity = gravity;
    this.colliders = []; // { id, min, max, tag, anchored, onTouch }
    this.dynamics = [];  // simple dynamic parts { id, pos, vel, half, onGround }
  }

  clear() { this.colliders = []; this.dynamics = []; }

  addBox(id, center, half, opts = {}) {
    const c = {
      id,
      tag: opts.tag || 'none',
      anchored: opts.anchored !== false,
      min: { x: center.x - half.x, y: center.y - half.y, z: center.z - half.z },
      max: { x: center.x + half.x, y: center.y + half.y, z: center.z + half.z },
      center: { ...center }, half: { ...half }
    };
    this.colliders.push(c);
    return c;
  }

  // Move an AABB body (center+half) with velocity, resolving against solid
  // colliders. Returns { onGround, touched:Set<tag-bearing colliders> }.
  moveBody(pos, vel, half, dt) {
    let onGround = false;
    const touched = [];
    const solids = this.colliders.filter((c) => c.tag !== 'coin' && c.tag !== 'win' && c.tag !== 'checkpoint' && c.tag !== 'boost' && c.tag !== 'kill');

    // integrate + resolve per axis
    const axes = ['y', 'x', 'z'];
    for (const axis of axes) {
      pos[axis] += vel[axis] * dt;
      const min = { x: pos.x - half.x, y: pos.y - half.y, z: pos.z - half.z };
      const max = { x: pos.x + half.x, y: pos.y + half.y, z: pos.z + half.z };
      for (const c of solids) {
        if (!overlap(min, max, c.min, c.max)) continue;
        if (axis === 'y') {
          if (vel.y <= 0) { pos.y = c.max.y + half.y; onGround = true; }
          else { pos.y = c.min.y - half.y; }
          vel.y = 0;
        } else if (axis === 'x') {
          if (vel.x > 0) pos.x = c.min.x - half.x; else if (vel.x < 0) pos.x = c.max.x + half.x;
          vel.x = 0;
        } else {
          if (vel.z > 0) pos.z = c.min.z - half.z; else if (vel.z < 0) pos.z = c.max.z + half.z;
          vel.z = 0;
        }
        // refresh bounds after correction
        min.x = pos.x - half.x; min.y = pos.y - half.y; min.z = pos.z - half.z;
        max.x = pos.x + half.x; max.y = pos.y + half.y; max.z = pos.z + half.z;
      }
    }

    // gameplay trigger overlaps (non-solid tagged colliders)
    const min = { x: pos.x - half.x, y: pos.y - half.y, z: pos.z - half.z };
    const max = { x: pos.x + half.x, y: pos.y + half.y, z: pos.z + half.z };
    for (const c of this.colliders) {
      if (c.tag === 'none') continue;
      if (overlap(min, max, c.min, c.max)) touched.push(c);
    }
    return { onGround, touched };
  }

  // simple ray vs collider boxes (for shooting). returns nearest hit collider id+point or null
  raycast(origin, dir, maxDist = 200) {
    let best = null;
    for (const c of this.colliders) {
      const t = rayAABB(origin, dir, c.min, c.max);
      if (t !== null && t >= 0 && t <= maxDist) {
        if (!best || t < best.t) best = { t, id: c.id, collider: c };
      }
    }
    return best;
  }
}

function rayAABB(o, d, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  for (const a of ['x', 'y', 'z']) {
    if (Math.abs(d[a]) < 1e-8) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
    } else {
      let t1 = (min[a] - o[a]) / d[a];
      let t2 = (max[a] - o[a]) / d[a];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin >= 0 ? tmin : tmax;
}
