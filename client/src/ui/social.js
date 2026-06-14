import { el, clear, toast, avatarSwatch } from './dom.js';
import { api, socket } from '../net.js';

export function renderSocial(root, ctx) {
  const page = el('div', { class: 'page' });
  const requestsBox = el('div', { class: 'friend-list' });
  const friendsBox = el('div', { class: 'friend-list' });
  const addInput = el('input', { class: 'field', placeholder: 'Username to add' });
  const addBtn = el('button', { class: 'btn btn-primary' }, 'Send Request');

  addBtn.addEventListener('click', async () => {
    const username = addInput.value.trim();
    if (!username) return;
    try { await api('/api/friends/request', { method: 'POST', body: { username } }); toast('Friend request sent!', 'success'); addInput.value = ''; }
    catch (e) { toast(e.message, 'error'); }
  });

  async function load() {
    try {
      const { friends, requests } = await api('/api/friends');
      clear(requestsBox); clear(friendsBox);
      if (!requests.length) requestsBox.appendChild(el('div', { class: 'muted small' }, 'No pending requests.'));
      for (const r of requests) requestsBox.appendChild(requestRow(r));
      if (!friends.length) friendsBox.appendChild(el('div', { class: 'muted small' }, 'No friends yet. Add someone above!'));
      for (const f of friends) friendsBox.appendChild(friendRow(f));
    } catch (e) { toast(e.message, 'error'); }
  }

  function requestRow(u) {
    const accept = el('button', { class: 'btn btn-small btn-primary' }, 'Accept');
    accept.addEventListener('click', async () => { await api('/api/friends/accept', { method: 'POST', body: { userId: u.id } }); toast('Friend added!', 'success'); load(); });
    return el('div', { class: 'friend-row' }, avatarSwatch(u.avatar), el('div', { class: 'friend-name' }, u.displayName), accept);
  }
  function friendRow(u) {
    const remove = el('button', { class: 'btn btn-small btn-ghost' }, 'Remove');
    remove.addEventListener('click', async () => { await api('/api/friends/remove', { method: 'POST', body: { userId: u.id } }); load(); });
    return el('div', { class: 'friend-row' },
      avatarSwatch(u.avatar),
      el('div', { class: 'friend-name' }, u.displayName, el('span', { class: u.online ? 'dot online' : 'dot' }, u.online ? ' ● online' : ' ○ offline')),
      remove);
  }

  page.append(
    el('h1', {}, 'Friends'),
    el('div', { class: 'toolbar' }, addInput, addBtn),
    el('h3', {}, 'Requests'), requestsBox,
    el('h3', {}, 'Your Friends'), friendsBox
  );
  root.appendChild(page);
  load();

  const off = socket.on('friendRequest', () => { toast('New friend request!', 'info'); load(); });
  ctx.onDispose(off);
}
