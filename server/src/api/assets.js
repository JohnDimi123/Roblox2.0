// Asset uploading & management. Stores user-uploaded images/models (as data
// URLs) and gives each an asset id usable as decals/textures/meshes in games.
import { db, newId } from '../db.js';
import { httpError } from '../http.js';

function assetCard(a) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    creatorId: a.creatorId,
    creatorName: a.creatorName,
    url: a.url,
    createdAt: a.createdAt
  };
}

export function registerAssetRoutes(router) {
  router.get('/api/assets', async (req) => {
    let assets = db('assets').all();
    if (req.query?.mine && req.user) assets = assets.filter((a) => a.creatorId === req.user.id);
    if (req.query?.type) assets = assets.filter((a) => a.type === req.query.type);
    return { assets: assets.map(assetCard) };
  });

  router.post('/api/assets', async (req) => {
    const { name, type, url } = req.body || {};
    if (!url || typeof url !== 'string' || !url.startsWith('data:'))
      throw httpError(400, 'Asset must be an uploaded data URL.');
    if (url.length > 20 * 1024 * 1024) throw httpError(413, 'Asset too large (max ~15MB).');
    const allowed = ['decal', 'texture', 'mesh', 'audio'];
    const t = allowed.includes(type) ? type : 'decal';
    const a = db('assets').insert({
      id: newId('a_'),
      name: (name || 'Untitled Asset').slice(0, 60),
      type: t,
      url,
      creatorId: req.user.id,
      creatorName: req.user.displayName || req.user.username
    });
    return assetCard(a);
  }, { auth: true });

  router.del('/api/assets/:id', async (req) => {
    const a = db('assets').get(req.params.id);
    if (!a) throw httpError(404, 'Asset not found.');
    if (a.creatorId !== req.user.id) throw httpError(403, 'Not your asset.');
    db('assets').remove(a.id);
    return { ok: true };
  }, { auth: true });
}
