// Tiny global app state with persistence of the auth session.
const KEY = 'roblox2.session';

export const state = {
  token: null,
  user: null,
  view: 'login',
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s) { this.token = s.token; this.user = s.user; }
    } catch {}
  },
  save() {
    localStorage.setItem(KEY, JSON.stringify({ token: this.token, user: this.user }));
  },
  clear() {
    this.token = null; this.user = null;
    localStorage.removeItem(KEY);
  }
};

// minimal event bus for cross-view updates (presence, notifications)
const listeners = new Map();
export const bus = {
  on(ev, fn) {
    if (!listeners.has(ev)) listeners.set(ev, new Set());
    listeners.get(ev).add(fn);
    return () => listeners.get(ev)?.delete(fn);
  },
  emit(ev, data) { listeners.get(ev)?.forEach((fn) => fn(data)); }
};
