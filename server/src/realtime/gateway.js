// Realtime gateway: WebSocket hub for presence, global + game chat, friend
// notifications, and multiplayer game rooms.
import { WebSocketServer } from 'ws';
import { verifyToken } from '../auth.js';
import { db } from '../db.js';
import { GameRoom } from './gameroom.js';

let nextConnId = 1;

export class Hub {
  constructor() {
    this.conns = new Map();      // connId -> conn
    this.byUser = new Map();     // userId -> Set<connId>
    this.rooms = new Map();      // gameId -> GameRoom
  }

  attach(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (ws) => this.onConnection(ws));
  }

  onConnection(ws) {
    const conn = {
      id: nextConnId++,
      ws,
      user: null,
      gameId: null,
      alive: true,
      send: (obj) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch {} }
    };
    this.conns.set(conn.id, conn);

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      this.onMessage(conn, msg);
    });
    ws.on('pong', () => { conn.alive = true; });
    ws.on('close', () => this.onClose(conn));
    ws.on('error', () => this.onClose(conn));

    conn.send({ t: 'hello', connId: conn.id });
  }

  onMessage(conn, msg) {
    switch (msg.t) {
      case 'auth': {
        const payload = verifyToken(msg.token);
        const user = payload ? db('users').get(payload.uid) : null;
        if (!user) return conn.send({ t: 'authError' });
        conn.user = user;
        if (!this.byUser.has(user.id)) this.byUser.set(user.id, new Set());
        this.byUser.get(user.id).add(conn.id);
        conn.send({ t: 'authed', user: { id: user.id, username: user.username } });
        this.broadcastPresence();
        break;
      }
      case 'join': {
        if (!conn.user) return;
        this.leaveRoom(conn);
        const game = db('games').get(msg.gameId);
        if (!game) return conn.send({ t: 'joinError', error: 'Game not found' });
        // count a play
        db('games').update(game.id, { plays: (game.plays || 0) + 1 });
        let room = this.rooms.get(msg.gameId);
        if (!room) { room = new GameRoom(msg.gameId, this); this.rooms.set(msg.gameId, room); }
        conn.gameId = msg.gameId;
        room.add(conn);
        break;
      }
      case 'leave': {
        this.leaveRoom(conn);
        break;
      }
      case 'state': {
        const room = conn.gameId && this.rooms.get(conn.gameId);
        if (room) room.updateTransform(conn.id, msg);
        break;
      }
      case 'score': {
        const room = conn.gameId && this.rooms.get(conn.gameId);
        if (room) room.setScore(conn.id, msg.score | 0);
        break;
      }
      case 'event': {
        const room = conn.gameId && this.rooms.get(conn.gameId);
        if (room) room.relayEvent(conn.id, msg);
        break;
      }
      case 'chat': {
        if (!conn.user) return;
        if (msg.scope === 'game') {
          const room = conn.gameId && this.rooms.get(conn.gameId);
          if (room) room.chat(conn.id, msg.text);
        } else {
          this.globalChat(conn, msg.text);
        }
        break;
      }
    }
  }

  globalChat(conn, text) {
    const out = {
      t: 'chat',
      scope: 'global',
      name: conn.user.displayName || conn.user.username,
      userId: conn.user.id,
      text: String(text || '').slice(0, 200),
      ts: Date.now()
    };
    for (const c of this.conns.values()) if (c.user) c.send(out);
  }

  leaveRoom(conn) {
    if (!conn.gameId) return;
    const room = this.rooms.get(conn.gameId);
    if (room) {
      room.remove(conn.id);
      if (room.size === 0) { room.destroy(); this.rooms.delete(conn.gameId); }
    }
    conn.gameId = null;
  }

  onClose(conn) {
    this.leaveRoom(conn);
    this.conns.delete(conn.id);
    if (conn.user) {
      const set = this.byUser.get(conn.user.id);
      if (set) { set.delete(conn.id); if (set.size === 0) this.byUser.delete(conn.user.id); }
      this.broadcastPresence();
    }
  }

  // ---- helpers used by REST layer & rooms ----
  sendTo(connId, msg) { const c = this.conns.get(connId); if (c) c.send(msg); }

  notify(userId, msg) {
    const set = this.byUser.get(userId);
    if (!set) return;
    for (const connId of set) this.sendTo(connId, msg);
  }

  isOnline(userId) { return this.byUser.has(userId); }

  activePlayers(gameId) { const r = this.rooms.get(gameId); return r ? r.size : 0; }

  broadcastPresence() {
    const onlineCount = this.byUser.size;
    for (const c of this.conns.values()) if (c.user) c.send({ t: 'presence', online: onlineCount });
  }

  startHeartbeat() {
    this.hb = setInterval(() => {
      for (const c of this.conns.values()) {
        if (!c.alive) { try { c.ws.terminate(); } catch {} continue; }
        c.alive = false;
        try { c.ws.ping(); } catch {}
      }
    }, 30000);
  }
}
