import { useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Field } from '../ui.jsx';

export default function Login({ onLogin }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { onLogin(await api.post('/auth/login', { login, password })); } catch (err) { setError(err); setBusy(false); }
  }

  return (
    <div className="login">
      <form className="card stack" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}>
          <img src="/icon.svg" alt="" />
          <div>Plumit<small>Бухгалтерия проектов</small></div>
        </div>
        <Field label="Логин"><input className="input" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus required /></Field>
        <Field label="Пароль"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
      </form>
    </div>
  );
}
