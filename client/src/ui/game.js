import { el, clear, toast } from './dom.js';
import { api, socket } from '../net.js';
import { state } from '../state.js';
import { Engine } from '../engine/engine.js';
import { Input } from '../engine/input.js';

export async function renderGame(root, ctx) {
  const gameId = ctx.params.gameId;
  const wrap = el('div', { class: 'game-view' });
  const canvas = el('canvas', { class: 'game-canvas' });
  const loading = el('div', { class: 'game-loading' }, 'Loading game…');
  wrap.append(canvas, loading);
  root.appendChild(wrap);

  let game;
  try { game = await api(`/api/games/${gameId}`, { auth: false }); }
  catch (e) { loading.textContent = 'Failed to load: ' + e.message; return; }

  // HUD
  const scoreEl = el('span', { class: 'hud-score' }, '0');
  const healthFill = el('div', { class: 'health-fill' });
  const playerCount = el('span', {}, '1');
  const leaderboard = el('div', { class: 'leaderboard' });
  const banner = el('div', { class: 'game-banner hidden' });

  const hud = el('div', { class: 'hud' },
    el('div', { class: 'hud-top' },
      el('button', { class: 'btn btn-ghost', onclick: () => ctx.navigate('home') }, '← Leave'),
      el('div', { class: 'hud-title' }, game.name),
      el('div', { class: 'hud-players' }, '👥 ', playerCount)
    ),
    el('div', { class: 'hud-left' },
      el('div', { class: 'hud-pill' }, '⭐ Score: ', scoreEl),
      el('div', { class: 'hud-health' }, el('div', { class: 'health-bar' }, healthFill)),
      leaderboard
    ),
    el('div', { class: 'hud-help' }, 'WASD move · Space jump · Shift run · Mouse look · Click to lock' + (game.build?.mode === 'pvp' ? ' · Click shoot' : '')),
    banner
  );
  wrap.appendChild(hud);

  // chat overlay
  const chatLog = el('div', { class: 'chat-log' });
  const chatInput = el('input', { class: 'chat-input', placeholder: 'Press Enter to chat…' });
  const chat = el('div', { class: 'game-chat' }, chatLog, chatInput);
  wrap.appendChild(chat);

  // --- engine setup ---
  const engine = new Engine(canvas);
  const input = new Input(canvas);
  engine.setInput(input);
  engine.load(game.build, state.user.avatar, { mode: game.build?.mode });
  engine.setSelfConnId(socket.connId);
  input.attach();
  engine.start();
  loading.remove();

  // network: join room
  socket.connect();
  socket.send({ t: 'join', gameId });
  engine.setSelfConnId(socket.connId);

  const offs = [];
  offs.push(socket.on('roomState', (m) => { engine.setSelfConnId(socket.connId); engine.applySnapshot(m.players); updateCount(m.players.length); }));
  offs.push(socket.on('snapshot', (m) => { engine.applySnapshot(m.players); updateCount(m.players.length); updateLeaderboard(m.players); }));
  offs.push(socket.on('playerJoined', (m) => { engine.addRemote(m.player); addChat('system', `${m.player.name} joined`); }));
  offs.push(socket.on('playerLeft', (m) => engine.removeRemote(m.connId)));
  offs.push(socket.on('event', (m) => engine.handleEvent(m)));
  offs.push(socket.on('chat', (m) => { if (m.scope === 'game') addChat(m.name, m.text); }));

  function updateCount(n) { playerCount.textContent = String(n); }

  // engine -> network
  engine.on('state', (s) => socket.send({ t: 'state', ...s }));
  engine.on('shoot', (d) => socket.send({ t: 'event', name: 'shoot', data: d }));
  engine.on('hit', (d) => socket.send({ t: 'event', name: 'hit', data: d }));
  engine.on('score', async (score) => {
    scoreEl.textContent = String(score);
    socket.send({ t: 'score', score });
    saveScore(score);
  });
  engine.on('damaged', (hp) => setHealth(hp));
  engine.on('died', () => { setHealth(100); flash('💀 You died! Respawning…'); });
  engine.on('checkpoint', () => toast('Checkpoint reached!', 'success'));
  engine.on('win', (score) => {
    flash('🏆 You Win!', true);
    saveScore(Math.max(score, 100));
  });

  function setHealth(hp) { healthFill.style.width = Math.max(0, hp) + '%'; }
  setHealth(100);

  let saveT;
  function saveScore(score) {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      api(`/api/datastore/${gameId}/score`, { method: 'PUT', body: { value: score } }).catch(() => {});
    }, 800);
  }

  function flash(text, win = false) {
    banner.textContent = text;
    banner.classList.remove('hidden');
    banner.classList.toggle('win', win);
    setTimeout(() => banner.classList.add('hidden'), win ? 4000 : 1500);
  }

  function addChat(name, text) {
    const line = name === 'system'
      ? el('div', { class: 'chat-line system' }, text)
      : el('div', { class: 'chat-line' }, el('b', {}, name + ': '), text);
    chatLog.appendChild(line);
    chatLog.scrollTop = chatLog.scrollHeight;
    while (chatLog.children.length > 60) chatLog.removeChild(chatLog.firstChild);
  }

  async function updateLeaderboard(players) {
    const top = [...players].sort((a, b) => b.score - a.score).slice(0, 5);
    clear(leaderboard);
    leaderboard.appendChild(el('div', { class: 'lb-title' }, '🏅 Leaderboard'));
    for (const p of top) {
      leaderboard.appendChild(el('div', { class: 'lb-row' + (p.connId === socket.connId ? ' me' : '') },
        el('span', {}, p.name), el('b', {}, String(p.score))));
    }
  }

  // chat input handling: capture Enter, release pointer lock while typing
  chatInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const text = chatInput.value.trim();
      if (text) socket.send({ t: 'chat', scope: 'game', text });
      chatInput.value = '';
      chatInput.blur();
      canvas.focus();
    } else if (e.key === 'Escape') { chatInput.blur(); }
  });
  const focusChat = (e) => { if (e.code === 'Enter' && document.activeElement !== chatInput) { e.preventDefault(); input.exitLock(); chatInput.focus(); } };
  window.addEventListener('keydown', focusChat);

  ctx.onDispose(() => {
    window.removeEventListener('keydown', focusChat);
    for (const off of offs) off();
    socket.send({ t: 'leave' });
    input.detach();
    engine.dispose();
  });
}
