// Game catalog: create, edit, publish, browse, play-count, persistence of
// the world/build data authored in Studio.
import { db, newId } from '../db.js';
import { httpError } from '../http.js';

function gameCard(g, includeBuild = false) {
  const card = {
    id: g.id,
    name: g.name,
    description: g.description,
    creatorId: g.creatorId,
    creatorName: g.creatorName,
    thumbnail: g.thumbnail || null,
    published: !!g.published,
    plays: g.plays || 0,
    likes: (g.likedBy || []).length,
    activePlayers: 0, // filled in by realtime layer
    maxPlayers: g.maxPlayers || 12,
    genre: g.genre || 'All',
    updatedAt: g.updatedAt,
    createdAt: g.createdAt
  };
  if (includeBuild) card.build = g.build;
  return card;
}

// A fresh empty world for a new game.
function emptyBuild() {
  return {
    gravity: -25,
    spawn: { x: 0, y: 4, z: 0 },
    skyColor: '#7ec8ff',
    parts: [
      { id: 'baseplate', type: 'box', pos: { x: 0, y: -1, z: 0 }, size: { x: 120, y: 2, z: 120 }, color: '#5a7d4f', anchored: true, material: 'plastic' }
    ],
    scripts: []
  };
}

export function registerGameRoutes(router, hub) {
  router.get('/api/games', async (req) => {
    const q = (req.query?.q || '').toLowerCase();
    const sort = req.query?.sort || 'popular';
    let games = db('games').find((g) => g.published);
    if (q) games = games.filter((g) => g.name.toLowerCase().includes(q) || (g.genre || '').toLowerCase().includes(q));
    const cards = games.map((g) => {
      const c = gameCard(g);
      c.activePlayers = hub ? hub.activePlayers(g.id) : 0;
      return c;
    });
    if (sort === 'popular') cards.sort((a, b) => (b.activePlayers - a.activePlayers) || (b.plays - a.plays));
    else if (sort === 'new') cards.sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === 'liked') cards.sort((a, b) => b.likes - a.likes);
    return { games: cards };
  });

  router.get('/api/games/mine', async (req) => {
    const games = db('games').find((g) => g.creatorId === req.user.id);
    return { games: games.map((g) => gameCard(g)) };
  }, { auth: true });

  router.get('/api/games/:id', async (req) => {
    const g = db('games').get(req.params.id);
    if (!g) throw httpError(404, 'Game not found.');
    const card = gameCard(g, true);
    card.activePlayers = hub ? hub.activePlayers(g.id) : 0;
    return card;
  });

  router.post('/api/games', async (req) => {
    const name = (req.body?.name || 'Untitled Game').slice(0, 50);
    const template = req.body?.template;
    const build = template?.build || emptyBuild();
    const g = db('games').insert({
      id: newId('g_'),
      name,
      description: (req.body?.description || '').slice(0, 500),
      genre: req.body?.genre || 'All',
      creatorId: req.user.id,
      creatorName: req.user.displayName || req.user.username,
      build,
      maxPlayers: Math.min(Math.max(req.body?.maxPlayers || 12, 1), 50),
      published: false,
      plays: 0,
      likedBy: [],
      thumbnail: req.body?.thumbnail || null
    });
    return gameCard(g, true);
  }, { auth: true });

  router.put('/api/games/:id', async (req) => {
    const g = db('games').get(req.params.id);
    if (!g) throw httpError(404, 'Game not found.');
    if (g.creatorId !== req.user.id) throw httpError(403, 'Not your game.');
    const patch = {};
    const b = req.body || {};
    if (typeof b.name === 'string') patch.name = b.name.slice(0, 50);
    if (typeof b.description === 'string') patch.description = b.description.slice(0, 500);
    if (typeof b.genre === 'string') patch.genre = b.genre;
    if (b.build && typeof b.build === 'object') patch.build = b.build;
    if (typeof b.published === 'boolean') patch.published = b.published;
    if (typeof b.thumbnail === 'string') patch.thumbnail = b.thumbnail;
    if (typeof b.maxPlayers === 'number') patch.maxPlayers = Math.min(Math.max(b.maxPlayers, 1), 50);
    const updated = db('games').update(g.id, patch);
    return gameCard(updated, true);
  }, { auth: true });

  router.del('/api/games/:id', async (req) => {
    const g = db('games').get(req.params.id);
    if (!g) throw httpError(404, 'Game not found.');
    if (g.creatorId !== req.user.id) throw httpError(403, 'Not your game.');
    db('games').remove(g.id);
    return { ok: true };
  }, { auth: true });

  router.post('/api/games/:id/like', async (req) => {
    const g = db('games').get(req.params.id);
    if (!g) throw httpError(404, 'Game not found.');
    const likedBy = new Set(g.likedBy || []);
    if (likedBy.has(req.user.id)) likedBy.delete(req.user.id);
    else likedBy.add(req.user.id);
    const updated = db('games').update(g.id, { likedBy: [...likedBy] });
    return { likes: updated.likedBy.length, liked: likedBy.has(req.user.id) };
  }, { auth: true });
}

export { gameCard, emptyBuild };
