import { state, bus } from './state.js';
import { socket } from './net.js';
import { el, clear, toast, avatarSwatch } from './ui/dom.js';
import { renderLogin } from './ui/login.js';
import { renderBrowse } from './ui/browse.js';
import { renderAvatar } from './ui/avatar.js';
import { renderStudio } from './ui/studio.js';
import { renderSocial } from './ui/social.js';
import { renderAssets } from './ui/assets.js';
import { renderGame } from './ui/game.js';

const app = document.getElementById('app');
let disposers = [];
let onlineCount = 0;

const views = {
  login: renderLogin,
  home: renderBrowse,
  avatar: renderAvatar,
  studio: renderStudio,
  friends: renderSocial,
  assets: renderAssets,
  play: renderGame
};

function navigate(view, params = {}) {
  for (const d of disposers) { try { d(); } catch {} }
  disposers = [];
  state.view = view;
  clear(app);

  if (!state.token && view !== 'login') { return navigate('login'); }

  const fullscreen = view === 'login' || view === 'play';
  if (!fullscreen) app.appendChild(buildNav(view));

  const content = el('div', { class: fullscreen ? 'content-full' : 'content' });
  app.appendChild(content);

  const ctx = {
    navigate,
    params,
    onDispose: (fn) => disposers.push(fn)
  };
  const fn = views[view] || views.home;
  fn(content, ctx);
}

function buildNav(active) {
  const link = (id, label, icon) =>
    el('a', { class: 'nav-link' + (active === id ? ' active' : ''), onclick: () => navigate(id) }, icon + ' ' + label);

  const robux = el('span', { class: 'robux' }, '💎 ' + (state.user?.robux ?? 0));
  const online = el('span', { class: 'online-count', id: 'online-count' }, `🟢 ${onlineCount} online`);

  const profile = el('div', { class: 'nav-profile' },
    avatarSwatch(state.user?.avatar),
    el('span', {}, state.user?.displayName || 'Player'),
    el('button', { class: 'btn btn-small btn-ghost', onclick: logout }, 'Logout')
  );

  return el('nav', { class: 'topnav' },
    el('div', { class: 'logo', onclick: () => navigate('home') }, 'ROBLOX', el('span', { class: 'logo-2' }, '2.0')),
    el('div', { class: 'nav-links' },
      link('home', 'Discover', '🎮'),
      link('studio', 'Studio', '🛠'),
      link('avatar', 'Avatar', '🧍'),
      link('friends', 'Friends', '👥'),
      link('assets', 'Assets', '🖼')
    ),
    el('div', { class: 'nav-right' }, online, robux, profile)
  );
}

function logout() {
  state.clear();
  toast('Logged out.', 'info');
  navigate('login');
}

// global socket wiring
socket.on('presence', (m) => {
  onlineCount = m.online;
  const elc = document.getElementById('online-count');
  if (elc) elc.textContent = `🟢 ${m.online} online`;
});
socket.on('chat', (m) => { if (m.scope === 'global') bus.emit('globalChat', m); });
socket.on('authError', () => { toast('Session expired. Please log in again.', 'error'); state.clear(); navigate('login'); });

// boot
state.load();
if (state.token) { socket.connect(); navigate('home'); }
else navigate('login');

// refresh profile from server if logged in
if (state.token) {
  import('./net.js').then(({ api }) => api('/api/me').then((u) => { state.user = u; state.save(); }).catch(() => {}));
}
