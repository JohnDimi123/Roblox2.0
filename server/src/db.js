// Roblox 2.0 — persistence layer.
// A small but real document database: per-collection JSON files with
// debounced atomic writes (write to temp, fsync, rename). Zero native deps so
// the platform runs on any machine without a compile step. The API is
// deliberately swappable for SQLite/Postgres later (see save()/find()).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

export function newId(prefix = '') {
  return prefix + crypto.randomBytes(9).toString('base64url');
}

class Collection {
  constructor(name) {
    this.name = name;
    this.file = path.join(DATA_DIR, `${name}.json`);
    this.docs = new Map();
    this._dirty = false;
    this._timer = null;
    this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const arr = JSON.parse(raw);
      for (const doc of arr) this.docs.set(doc.id, doc);
    } catch {
      // fresh collection
    }
  }

  _scheduleFlush() {
    this._dirty = true;
    if (this._timer) return;
    this._timer = setTimeout(() => this.flushSync(), 120);
  }

  flushSync() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (!this._dirty) return;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = this.file + '.tmp';
    const data = JSON.stringify([...this.docs.values()]);
    const fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tmp, this.file);
    this._dirty = false;
  }

  get(id) {
    const d = this.docs.get(id);
    return d ? structuredClone(d) : null;
  }

  all() {
    return [...this.docs.values()].map((d) => structuredClone(d));
  }

  find(predicate) {
    const out = [];
    for (const d of this.docs.values()) if (predicate(d)) out.push(structuredClone(d));
    return out;
  }

  findOne(predicate) {
    for (const d of this.docs.values()) if (predicate(d)) return structuredClone(d);
    return null;
  }

  insert(doc) {
    if (!doc.id) doc.id = newId();
    doc.createdAt = doc.createdAt || Date.now();
    doc.updatedAt = Date.now();
    this.docs.set(doc.id, structuredClone(doc));
    this._scheduleFlush();
    return structuredClone(doc);
  }

  update(id, patch) {
    const cur = this.docs.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch, id, updatedAt: Date.now() };
    this.docs.set(id, next);
    this._scheduleFlush();
    return structuredClone(next);
  }

  remove(id) {
    const ok = this.docs.delete(id);
    if (ok) this._scheduleFlush();
    return ok;
  }

  count() {
    return this.docs.size;
  }
}

const collections = new Map();
export function db(name) {
  if (!collections.has(name)) collections.set(name, new Collection(name));
  return collections.get(name);
}

// Flush everything on shutdown so no data is lost.
function flushAll() {
  for (const c of collections.values()) c.flushSync();
}
process.on('exit', flushAll);
process.on('SIGINT', () => { flushAll(); process.exit(0); });
process.on('SIGTERM', () => { flushAll(); process.exit(0); });

export { DATA_DIR };
