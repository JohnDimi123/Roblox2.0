// Network client: REST helpers + a resilient WebSocket connection for
// presence, chat, friend notifications and multiplayer game rooms.
import { state } from './state.js';

const API = location.origin;

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

class Socket {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.connId = null;
    this.queue = [];
    this.reconnectDelay = 1000;
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      if (state.token) this.send({ t: 'auth', token: state.token });
      while (this.queue.length) this.ws.send(JSON.stringify(this.queue.shift()));
    };
    this.ws.onmessage = (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'hello') this.connId = msg.connId;
      this.emit(msg.t, msg);
      this.emit('*', msg);
    };
    this.ws.onclose = () => {
      this.emit('disconnected', {});
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
    };
    this.ws.onerror = () => { try { this.ws.close(); } catch {} };
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
    else this.queue.push(obj);
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  emit(type, msg) {
    const set = this.handlers.get(type);
    if (set) for (const fn of set) fn(msg);
  }
}

export const socket = new Socket();
