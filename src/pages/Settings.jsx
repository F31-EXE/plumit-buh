import { useEffect, useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase.js';
import { emailKey } from '../lib/store.jsx';
import { grantAccess, revokeAccess } from '../lib/actions.js';
import { listOperations } from '../lib/finance.js';
import { downloadCsv } from '../lib/csv.js';
import { loadDemo } from '../lib/demo.js';
import { useApp } from '../App.jsx';
import { useTheme } from '../lib/theme.js';
import { authError } from './Login.jsx';
import { ErrorBox, Field, Icon, Segmented, useToast } from '../ui.jsx';

export default function Settings() {
  const { me, isAdmin, logout, data } = useApp();
  const { theme, setTheme } = useTheme();
  const hasPassword = auth.currentUser?.providerData.some((p) => p.providerId === 'password');

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="grow"><h1>Настройки</h1><div className="sub">{me.email} · {me.role === 'admin' ? 'администратор' : 'только просмотр'}</div></div>
      </div>

      <div className="card stack">
        <h2>Оформление</h2>
        <Segmented className="fit" value={theme} onChange={(t) => setTheme(t)} options={[['auto', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']]} />
        <div className="faint small">«Авто» — как в настройках телефона или компьютера.</div>
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
        <div><button type="button" className="btn wrap" onClick={() => downloadCsv(listOperations(data))}><Icon name="download" />Скачать все операции (CSV для Excel)</button></div>
      </div>

      {hasPassword && <PasswordForm />}
      {isAdmin && <Access />}
      {isAdmin && !data.projects.length && <Demo />}

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
    try {
      if (f.next.length < 8) throw new Error('Новый пароль — минимум 8 символов');
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, f.current));
      await updatePassword(user, f.next);
      setF({ current: '', next: '' });
      toast('Пароль изменён');
    } catch (err) { setError(err.code ? authError(err) : err); }
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

function Access() {
  const { me } = useApp();
  const toast = useToast();
  const [list, setList] = useState([]);
  const [f, setF] = useState({ email: '', name: '', role: 'viewer' });
  const [error, setError] = useState(null);

  useEffect(() => onSnapshot(collection(db, 'access'), (snap) => {
    setList(snap.docs.map((d) => ({ email: d.id, ...d.data() })).sort((a, b) => a.email.localeCompare(b.email)));
  }, setError), []);

  function add(e) {
    e.preventDefault();
    setError(null);
    try { grantAccess(f.email, f.role, f.name); setF({ email: '', name: '', role: 'viewer' }); toast('Доступ выдан'); } catch (err) { setError(err); }
  }
  function remove(u) {
    if (confirm(`Закрыть доступ для ${u.email}?`)) revokeAccess(u.email);
  }

  return (
    <div className="card stack">
      <div>
        <h2>Доступ</h2>
        <div className="faint small" style={{ marginTop: 4 }}>Добавьте email человека — он войдёт через Google или зарегистрируется по почте на странице входа.</div>
      </div>
      <div>
        {list.map((u) => (
          <div key={u.email} className="spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div className="grow" style={{ overflowWrap: 'anywhere' }}>
              <strong>{u.name || u.email}</strong>
              <div className="faint small">{u.name ? `${u.email} · ` : ''}{u.role === 'admin' ? 'администратор' : 'просмотр'}</div>
            </div>
            {u.email !== emailKey(me.email) && <button type="button" className="btn sm ghost danger" onClick={() => remove(u)}>Удалить</button>}
          </div>
        ))}
      </div>
      <form className="stack" onSubmit={add}>
        <div className="form-grid">
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
          <Field label="Имя"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Права" className="full">
            <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="viewer">Только просмотр</option>
              <option value="admin">Администратор (может вносить и править)</option>
            </select>
          </Field>
        </div>
        <ErrorBox error={error} />
        <div><button className="btn primary">Выдать доступ</button></div>
      </form>
    </div>
  );
}

function Demo() {
  const { me } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function run() {
    setBusy(true);
    try { await loadDemo(emailKey(me.email)); } catch (err) { setError(err); setBusy(false); }
  }
  return (
    <div className="card stack">
      <h2>Демо-данные</h2>
      <div className="muted small">База пустая. Можно загрузить два вымышленных проекта с командой и операциями, чтобы посмотреть, как всё работает, а потом удалить их.</div>
      <ErrorBox error={error} />
      <div><button type="button" className="btn" onClick={run} disabled={busy}>{busy ? 'Загружаю…' : 'Загрузить демо-данные'}</button></div>
    </div>
  );
}
