// Social system: friend requests, friends list, and per-user datastore
// (the "data saving and persistence" surface games use to save progress).
import { db } from '../db.js';
import { httpError } from '../http.js';
import { publicUser } from './accounts.js';

export function registerSocialRoutes(router, hub) {
  router.get('/api/friends', async (req) => {
    const me = db('users').get(req.user.id);
    const friends = (me.friends || []).map((id) => publicUser(db('users').get(id))).filter(Boolean);
    if (hub) for (const f of friends) f.online = hub.isOnline(f.id);
    const requests = (me.friendRequests || [])
      .map((id) => publicUser(db('users').get(id)))
      .filter(Boolean);
    return { friends, requests };
  }, { auth: true });

  router.post('/api/friends/request', async (req) => {
    const target = db('users').findOne(
      (u) => u.username.toLowerCase() === (req.body?.username || '').toLowerCase()
    ) || db('users').get(req.body?.userId);
    if (!target) throw httpError(404, 'User not found.');
    if (target.id === req.user.id) throw httpError(400, "You can't friend yourself.");
    if ((target.friends || []).includes(req.user.id)) return { ok: true, already: true };
    const reqs = new Set(target.friendRequests || []);
    reqs.add(req.user.id);
    db('users').update(target.id, { friendRequests: [...reqs] });
    if (hub) hub.notify(target.id, { t: 'friendRequest', from: publicUser(db('users').get(req.user.id)) });
    return { ok: true };
  }, { auth: true });

  router.post('/api/friends/accept', async (req) => {
    const fromId = req.body?.userId;
    const me = db('users').get(req.user.id);
    if (!(me.friendRequests || []).includes(fromId)) throw httpError(400, 'No such request.');
    const other = db('users').get(fromId);
    if (!other) throw httpError(404, 'User not found.');
    const myFriends = new Set(me.friends || []); myFriends.add(fromId);
    const myReqs = (me.friendRequests || []).filter((x) => x !== fromId);
    const theirFriends = new Set(other.friends || []); theirFriends.add(me.id);
    db('users').update(me.id, { friends: [...myFriends], friendRequests: myReqs });
    db('users').update(other.id, { friends: [...theirFriends] });
    return { ok: true };
  }, { auth: true });

  router.post('/api/friends/remove', async (req) => {
    const otherId = req.body?.userId;
    const me = db('users').get(req.user.id);
    const other = db('users').get(otherId);
    db('users').update(me.id, { friends: (me.friends || []).filter((x) => x !== otherId) });
    if (other) db('users').update(other.id, { friends: (other.friends || []).filter((x) => x !== me.id) });
    return { ok: true };
  }, { auth: true });

  // ---- Per-game datastore (game progress / leaderboards persistence) ----
  router.get('/api/datastore/:gameId/:key', async (req) => {
    const id = `${req.params.gameId}:${req.params.key}:${req.user.id}`;
    const rec = db('datastore').get(id);
    return { value: rec ? rec.value : null };
  }, { auth: true });

  router.put('/api/datastore/:gameId/:key', async (req) => {
    const id = `${req.params.gameId}:${req.params.key}:${req.user.id}`;
    const existing = db('datastore').get(id);
    const doc = { id, gameId: req.params.gameId, key: req.params.key, userId: req.user.id, value: req.body?.value ?? null };
    if (existing) db('datastore').update(id, doc); else db('datastore').insert(doc);
    return { ok: true };
  }, { auth: true });

  // Global leaderboard for a game (top scores).
  router.get('/api/leaderboard/:gameId', async (req) => {
    const rows = db('datastore')
      .find((d) => d.gameId === req.params.gameId && d.key === 'score')
      .map((d) => ({ userId: d.userId, score: Number(d.value) || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    for (const r of rows) {
      const u = db('users').get(r.userId);
      r.name = u ? (u.displayName || u.username) : 'Guest';
    }
    return { leaderboard: rows };
  });
}
