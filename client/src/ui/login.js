import { el, toast } from './dom.js';
import { api, socket } from '../net.js';
import { state } from '../state.js';

export function renderLogin(root, { navigate }) {
  let mode = 'login';

  const username = el('input', { class: 'field', placeholder: 'Username', autocomplete: 'username' });
  const password = el('input', { class: 'field', type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
  const submit = el('button', { class: 'btn btn-primary btn-block' }, 'Log In');
  const toggle = el('a', { class: 'link' }, "Don't have an account? Sign up");
  const err = el('div', { class: 'form-error' });

  async function doSubmit() {
    err.textContent = '';
    submit.disabled = true;
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const data = await api(path, { method: 'POST', auth: false, body: { username: username.value.trim(), password: password.value } });
      state.token = data.token; state.user = data.user; state.save();
      socket.connect();
      toast(`Welcome, ${data.user.displayName}!`, 'success');
      navigate('home');
    } catch (e) {
      err.textContent = e.message;
    } finally {
      submit.disabled = false;
    }
  }

  submit.addEventListener('click', doSubmit);
  password.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubmit(); });
  toggle.addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    submit.textContent = mode === 'login' ? 'Log In' : 'Create Account';
    toggle.textContent = mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in';
    err.textContent = '';
  });

  root.appendChild(
    el('div', { class: 'login-wrap' },
      el('div', { class: 'login-card' },
        el('div', { class: 'logo-big' }, 'ROBLOX', el('span', { class: 'logo-2' }, '2.0')),
        el('p', { class: 'login-sub' }, 'Create, publish and play — a whole platform.'),
        username, password, err, submit, toggle,
        el('div', { class: 'login-hint' }, 'Tip: try user ', el('b', {}, 'Roblox'), ' / pass ', el('b', {}, 'admin'))
      )
    )
  );
  setTimeout(() => username.focus(), 50);
}
