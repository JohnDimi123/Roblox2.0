import { el, clear, toast } from './dom.js';
import { api } from '../net.js';

export function renderBrowse(root, { navigate }) {
  const grid = el('div', { class: 'game-grid' });
  const statsBar = el('div', { class: 'stats-bar' });
  const search = el('input', { class: 'field search', placeholder: 'Search games…' });
  const sortSel = el('select', { class: 'field select' },
    el('option', { value: 'popular' }, 'Popular'),
    el('option', { value: 'new' }, 'Newest'),
    el('option', { value: 'liked' }, 'Most Liked')
  );

  async function loadStats() {
    try {
      const s = await api('/api/stats', { auth: false });
      clear(statsBar);
      statsBar.append(
        stat('🎮', s.games, 'Games'),
        stat('👥', s.users, 'Players'),
        stat('🟢', s.online, 'Online now')
      );
    } catch {}
  }

  async function load() {
    clear(grid);
    grid.appendChild(el('div', { class: 'muted' }, 'Loading games…'));
    try {
      const q = encodeURIComponent(search.value.trim());
      const { games } = await api(`/api/games?sort=${sortSel.value}&q=${q}`, { auth: false });
      clear(grid);
      if (!games.length) { grid.appendChild(el('div', { class: 'muted' }, 'No games found.')); return; }
      for (const g of games) grid.appendChild(gameCard(g, navigate));
    } catch (e) {
      clear(grid); grid.appendChild(el('div', { class: 'muted' }, 'Failed to load: ' + e.message));
    }
  }

  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  sortSel.addEventListener('change', load);

  root.appendChild(
    el('div', { class: 'page' },
      el('div', { class: 'hero' },
        el('h1', {}, 'Discover'),
        statsBar
      ),
      el('div', { class: 'toolbar' }, search, sortSel),
      grid
    )
  );
  loadStats();
  load();
}

function stat(icon, n, label) {
  return el('div', { class: 'stat' }, el('span', { class: 'stat-icon' }, icon), el('b', {}, String(n)), el('span', { class: 'stat-label' }, label));
}

function gameCard(g, navigate) {
  const thumb = el('div', { class: 'thumb', style: { background: thumbBg(g) } },
    el('div', { class: 'thumb-genre' }, g.genre || 'All'),
    g.activePlayers > 0 ? el('div', { class: 'thumb-live' }, `● ${g.activePlayers} playing`) : null
  );
  const card = el('div', { class: 'card' },
    thumb,
    el('div', { class: 'card-body' },
      el('div', { class: 'card-title' }, g.name),
      el('div', { class: 'card-creator' }, 'by ' + g.creatorName),
      el('div', { class: 'card-stats' },
        el('span', {}, `▶ ${formatNum(g.plays)}`),
        el('span', {}, `👍 ${g.likes}`)
      )
    )
  );
  card.addEventListener('click', () => navigate('play', { gameId: g.id }));
  return card;
}

function thumbBg(g) {
  const colors = {
    Adventure: 'linear-gradient(135deg,#36d1dc,#5b86e5)',
    Shooter: 'linear-gradient(135deg,#cb2d3e,#ef473a)',
    Racing: 'linear-gradient(135deg,#f7971e,#ffd200)',
    Sandbox: 'linear-gradient(135deg,#11998e,#38ef7d)',
    All: 'linear-gradient(135deg,#667eea,#764ba2)'
  };
  return colors[g.genre] || colors.All;
}

function formatNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
