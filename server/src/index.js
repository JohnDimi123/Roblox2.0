// Roblox 2.0 — platform server entrypoint.
// Serves the REST API, the realtime multiplayer gateway, and the game client.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, serveStatic, send } from './http.js';
import { Hub } from './realtime/gateway.js';
import { registerAccountRoutes } from './api/accounts.js';
import { registerGameRoutes } from './api/games.js';
import { registerAssetRoutes } from './api/assets.js';
import { registerSocialRoutes } from './api/social.js';
import { seed, TEMPLATES } from './seed.js';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, '..', '..', 'client');
const PORT = process.env.PORT || 3000;

seed();

const hub = new Hub();
const router = new Router();

registerAccountRoutes(router);
registerGameRoutes(router, hub);
registerAssetRoutes(router);
registerSocialRoutes(router, hub);

// Game creation templates (used by Studio).
router.get('/api/templates', async () => ({
  templates: TEMPLATES.map((t) => ({ key: t.key, name: t.name, genre: t.genre }))
}));
router.get('/api/templates/:key', async (req) => {
  const t = TEMPLATES.find((x) => x.key === req.params.key);
  if (!t) return { error: 'not found' };
  return { key: t.key, name: t.name, genre: t.genre, build: t.build() };
});

// Platform stats for the home page.
router.get('/api/stats', async () => ({
  users: db('users').count(),
  games: db('games').find((g) => g.published).length,
  online: hub.byUser.size
}));

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  req.query = Object.fromEntries(url.searchParams.entries());

  if (url.pathname.startsWith('/api/')) {
    const handled = await router.handle(req, res, url.pathname);
    if (!handled && !res.writableEnded) send(res, 404, { error: 'not found' });
    return;
  }

  // Everything else: serve the game client (SPA).
  serveStatic(CLIENT_DIR, url.pathname, res);
});

hub.attach(server);
hub.startHeartbeat();

server.listen(PORT, () => {
  console.log('');
  console.log('  ╦═╗┌─┐┌┐ ┬  ┌─┐─┐ ┬  ┌─┐ ┌─┐');
  console.log('  ╠╦╝│ │├┴┐│  │ │┌┴┬┘  ┌─┘ │ │');
  console.log('  ╩╚═└─┘└─┘┴─┘└─┘┴ └─  └─┘o└─┘');
  console.log('');
  console.log(`  Roblox 2.0 platform running at  http://localhost:${PORT}`);
  console.log(`  REST API: /api   •   Multiplayer: ws://localhost:${PORT}/ws`);
  console.log('');
});
