import { useState } from 'react';
import { api } from '../api.js';
import { applyTheme, useApp } from '../App.jsx';
import { ErrorBox, Field, Icon, Segmented, useLoad, useToast } from '../ui.jsx';

export default function Settings() {
  const { me, isAdmin, onLogout } = useApp();
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('theme') || 'auto'; } catch { return 'auto'; } });

  function changeTheme(t) {
    setTheme(t);
    try { localStorage.setItem('theme', t); } catch { /* приватный режим */ }
    applyTheme(t);
  }
  async function logout() {
    await api.post('/auth/logout').catch(() => {});
    onLogout();
  }

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="page-head" style={{ marginBottom: 0 }}><div><h1>Настройки</h1><div className="sub">{me.name} · {me.role === 'admin' ? 'администратор' : 'только просмотр'}</div></div></div>

      <div className="card stack">
        <h2>Оформление</h2>
        <Segmented value={theme} onChange={changeTheme} options={[['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']]} />
      </div>

      <div className="card stack">
        <h2>Приложение на телефоне</h2>
        <div className="muted small">
          <p style={{ marginTop: 0 }}><strong>iPhone:</strong> откройте сайт в Safari → «Поделиться» → «На экран „Домой“».</p>
          <p style={{ marginBottom: 0 }}><strong>Android:</strong> откройте в Chrome → меню ⋮ → «Установить приложение».</p>
        </div>
      </div>

      <div className="card stack">
        <h2>Экспорт</h2>
        <div><a className="btn" href="/api/export/operations.csv"><Icon name="download" />Все операции в CSV (открывается в Excel)</a></div>
      </div>

      <PasswordForm />
      {isAdmin && <Users />}

      <div><button type="button" className="btn danger" onClick={logout}><Icon name="logout" />Выйти</button></div>
    </div>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '' });
  const [error, setError] = useState(null);
  async function submit(e) {
    e.preventDefault();
    setError(null);
    try { await api.post('/auth/password', f); setF({ current: '', next: '' }); toast('Пароль изменён'); } catch (err) { setError(err); }
  }
  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Смена пароля</h2>
      <div className="form-grid">
        <Field label="Текущий пароль"><input type="password" className="input" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></Field>
        <Field label="Новый пароль"><input type="password" className="input" autoComplete="new-password" minLength={8} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required /></Field>
      </div>
      <ErrorBox error={error} />
      <div><button className="btn">Сменить пароль</button></div>
    </form>
  );
}

function Users() {
  const { me } = useApp();
  const toast = useToast();
  const { data, reload } = useLoad(() => api.get('/users'), []);
  const [f, setF] = useState({ login: '', name: '', password: '', role: 'viewer' });
  const [error, setError] = useState(null);

  async function add(e) {
    e.preventDefault();
    setError(null);
    try { await api.post('/users', f); setF({ login: '', name: '', password: '', role: 'viewer' }); toast('Доступ выдан'); reload(); } catch (err) { setError(err); }
  }
  async function remove(u) {
    if (!confirm(`Закрыть доступ для ${u.login}?`)) return;
    try { await api.del(`/users/${u.id}`); reload(); } catch (err) { setError(err); }
  }

  return (
    <div className="card stack">
      <h2>Доступ</h2>
      <div className="list">
        {data?.map((u) => (
          <div key={u.id} className="spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div><strong>{u.name}</strong> <span className="faint small">· {u.login} · {u.role === 'admin' ? 'администратор' : 'просмотр'}</span></div>
            {u.id !== me.id && <button type="button" className="btn sm ghost danger" onClick={() => remove(u)}>Удалить</button>}
          </div>
        ))}
      </div>
      <form className="stack" onSubmit={add}>
        <div className="form-grid">
          <Field label="Логин"><input className="input" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} required /></Field>
          <Field label="Имя"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Пароль (мин. 8 символов)"><input className="input" type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
          <Field label="Права">
            <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="viewer">Только просмотр</option>
              <option value="admin">Администратор (может вносить)</option>
            </select>
          </Field>
        </div>
        <ErrorBox error={error} />
        <div><button className="btn primary">Добавить пользователя</button></div>
      </form>
    </div>
  );
}
