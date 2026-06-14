// Account system: register, login, profile, avatar, currency.
import { db, newId } from '../db.js';
import { hashPassword, verifyPassword, signToken } from '../auth.js';
import { httpError } from '../http.js';

const DEFAULT_AVATAR = {
  bodyColor: '#f5c542',
  shirtColor: '#3b82f6',
  pantsColor: '#1f2937',
  headColor: '#f5c542',
  face: 'smile',
  hat: 'none',
  scale: 1.0
};

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatar: u.avatar,
    robux: u.robux,
    bio: u.bio || '',
    createdAt: u.createdAt
  };
}

export function registerAccountRoutes(router) {
  router.post('/api/auth/register', async (req) => {
    const { username, password } = req.body || {};
    if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username))
      throw httpError(400, 'Username must be 3-20 chars (letters, numbers, _).');
    if (!password || password.length < 4)
      throw httpError(400, 'Password must be at least 4 characters.');
    const exists = db('users').findOne((u) => u.username.toLowerCase() === username.toLowerCase());
    if (exists) throw httpError(409, 'Username already taken.');

    const user = db('users').insert({
      id: newId('u_'),
      username,
      displayName: username,
      passwordHash: hashPassword(password),
      avatar: structuredClone(DEFAULT_AVATAR),
      robux: 1000,
      bio: '',
      inventory: [],
      friends: [],
      friendRequests: []
    });
    const token = signToken({ uid: user.id });
    return { token, user: publicUser(user) };
  });

  router.post('/api/auth/login', async (req) => {
    const { username, password } = req.body || {};
    const user = db('users').findOne((u) => u.username.toLowerCase() === (username || '').toLowerCase());
    if (!user || !verifyPassword(password || '', user.passwordHash))
      throw httpError(401, 'Invalid username or password.');
    const token = signToken({ uid: user.id });
    return { token, user: publicUser(user) };
  });

  router.get('/api/me', async (req) => publicUser(req.user), { auth: true });

  router.put('/api/me/avatar', async (req) => {
    const avatar = { ...req.user.avatar, ...(req.body?.avatar || {}) };
    const updated = db('users').update(req.user.id, { avatar });
    return publicUser(updated);
  }, { auth: true });

  router.put('/api/me/profile', async (req) => {
    const patch = {};
    if (typeof req.body?.displayName === 'string') patch.displayName = req.body.displayName.slice(0, 30);
    if (typeof req.body?.bio === 'string') patch.bio = req.body.bio.slice(0, 280);
    const updated = db('users').update(req.user.id, patch);
    return publicUser(updated);
  }, { auth: true });

  router.get('/api/users/:id', async (req) => {
    const u = db('users').get(req.params.id) ||
      db('users').findOne((x) => x.username.toLowerCase() === req.params.id.toLowerCase());
    if (!u) throw httpError(404, 'User not found.');
    return publicUser(u);
  });
}

export { publicUser, DEFAULT_AVATAR };
