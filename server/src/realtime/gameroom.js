// An authoritative-ish game room. The server owns the roster, relays player
// transforms to everyone at a fixed tick rate, and maintains shared state
// (scores, world events) so all clients see a consistent multiplayer world.

const TICK_MS = 50; // 20 Hz network tick

export class GameRoom {
  constructor(gameId, hub) {
    this.gameId = gameId;
    this.hub = hub;
    this.players = new Map(); // connId -> player state
    this.lastTick = Date.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  get size() { return this.players.size; }

  add(conn) {
    const u = conn.user;
    this.players.set(conn.id, {
      connId: conn.id,
      userId: u.id,
      name: u.displayName || u.username,
      avatar: u.avatar,
      pos: { x: 0, y: 4, z: 0 },
      rot: 0,
      vel: { x: 0, y: 0, z: 0 },
      anim: 'idle',
      score: 0,
      health: 100
    });
    // Tell the joiner about everyone already here.
    conn.send({ t: 'roomState', gameId: this.gameId, players: [...this.players.values()] });
    // Tell everyone else about the joiner.
    this.broadcast({ t: 'playerJoined', player: this.players.get(conn.id) }, conn.id);
    this.hub.broadcastPresence();
  }

  remove(connId) {
    if (!this.players.has(connId)) return;
    this.players.delete(connId);
    this.broadcast({ t: 'playerLeft', connId });
    this.hub.broadcastPresence();
  }

  updateTransform(connId, data) {
    const p = this.players.get(connId);
    if (!p) return;
    if (data.pos) p.pos = data.pos;
    if (typeof data.rot === 'number') p.rot = data.rot;
    if (data.vel) p.vel = data.vel;
    if (data.anim) p.anim = data.anim;
    if (typeof data.health === 'number') p.health = data.health;
  }

  setScore(connId, score) {
    const p = this.players.get(connId);
    if (p) p.score = score;
  }

  // Relay a gameplay event (projectile, part touched, sound) to the room.
  relayEvent(connId, event) {
    this.broadcast({ t: 'event', from: connId, name: event.name, data: event.data }, connId);
  }

  chat(connId, text) {
    const p = this.players.get(connId);
    if (!p) return;
    this.broadcast({ t: 'chat', scope: 'game', name: p.name, userId: p.userId, text: String(text).slice(0, 200) });
  }

  tick() {
    if (this.players.size === 0) return;
    const snapshot = {
      t: 'snapshot',
      ts: Date.now(),
      players: [...this.players.values()].map((p) => ({
        connId: p.connId,
        userId: p.userId,
        name: p.name,
        pos: p.pos,
        rot: p.rot,
        vel: p.vel,
        anim: p.anim,
        score: p.score,
        health: p.health
      }))
    };
    this.broadcast(snapshot);
  }

  broadcast(msg, exceptConnId = null) {
    for (const connId of this.players.keys()) {
      if (connId === exceptConnId) continue;
      this.hub.sendTo(connId, msg);
    }
  }

  destroy() {
    clearInterval(this.timer);
  }
}
