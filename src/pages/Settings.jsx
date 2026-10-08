import { useEffect, useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase.js';
import { emailKey } from '../lib/store.jsx';
import { grantAccess, revokeAccess } from '../lib/actions.js';
import { listOperations } from '../lib/finance.js';
import { downloadCsv } from '../lib/csv.js';
import { loadDemo } from '../lib/demo.js';
import { planImport, runImport } from '../lib/importer.js';
import { Link } from 'react-router-dom';
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

      <Link to="/savings" className="card spread hide-desktop">
        <div className="row"><span className="op-icon income"><Icon name="wallet" /></span><div><h2>Накопительные счета</h2><div className="faint small">Резерв студии под проценты</div></div></div>
        <Icon name="right" width={20} />
      </Link>

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
      {isAdmin && <Import />}
      {isAdmin && !data.projects.length && <Demo />}

      <div><button type="button" className="btn danger" onClick={logout}><Icon name="logout" />Выйти</button></div>
    </div>
  );
}

export function PasswordForm() {
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
  const { me, members } = useApp();
  const toast = useToast();
  const [list, setList] = useState([]);
  const [f, setF] = useState({ email: '', name: '', role: 'viewer', member_id: '' });
  const [error, setError] = useState(null);

  useEffect(() => onSnapshot(collection(db, 'access'), (snap) => {
    setList(snap.docs.map((d) => ({ email: d.id, ...d.data() })).sort((a, b) => a.email.localeCompare(b.email)));
  }, setError), []);

  function add(e) {
    e.preventDefault();
    setError(null);
    try {
      const name = f.name || (f.role === 'employee' ? members.find((m) => m.id === f.member_id)?.name : '');
      grantAccess(f.email, f.role, name, f.member_id);
      setF({ email: '', name: '', role: 'viewer', member_id: '' });
      toast('Доступ выдан');
    } catch (err) { setError(err); }
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
              <div className="faint small">{u.name ? `${u.email} · ` : ''}{ROLE_LABEL[u.role] || u.role}</div>
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
              <option value="viewer">Только просмотр (видит всё)</option>
              <option value="employee">Сотрудник (видит только свои начисления)</option>
              <option value="admin">Администратор (может вносить и править)</option>
            </select>
          </Field>
          {f.role === 'employee' && (
            <Field label="Кто это в команде" className="full">
              <select className="input" value={f.member_id} onChange={(e) => setF({ ...f, member_id: e.target.value })} required>
                <option value="">Выберите участника…</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role ? ` (${m.role})` : ''}</option>)}
              </select>
            </Field>
          )}
        </div>
        <ErrorBox error={error} />
        <div><button className="btn primary">Выдать доступ</button></div>
      </form>
    </div>
  );
}

const ROLE_LABEL = { admin: 'администратор', viewer: 'просмотр', employee: 'сотрудник' };

function Import() {
  const { me, data } = useApp();
  const toast = useToast();
  const [plan, setPlan] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const json = JSON.parse(await file.text());
      setName(file.name);
      setPlan(planImport(json, data));
    } catch (err) { setPlan(null); setError(new Error(`Не удалось прочитать файл: ${err.message}`)); }
  }
  async function run() {
    setBusy(true);
    try {
      await runImport(plan, emailKey(me.email));
      toast('Данные загружены');
      setPlan(null);
    } catch (err) { setError(err); }
    setBusy(false);
  }

  return (
    <div className="card stack">
      <div>
        <h2>Импорт данных</h2>
        <div className="faint small" style={{ marginTop: 4 }}>Загрузка из файла .json — например, перенесённых из Excel. Перед записью покажем, что будет добавлено.</div>
      </div>
      <label className="btn wrap" style={{ alignSelf: 'flex-start' }}>
        <Icon name="upload" />Выбрать файл
        <input type="file" accept=".json,application/json" onChange={pick} hidden />
      </label>
      {plan && (
        <div className="stack" style={{ gap: 10 }}>
          <div><strong>{name}</strong></div>
          <div className="muted small">
            Будет добавлено: участников — {plan.counts.members}, проектов — {plan.counts.projects},
            итераций — {plan.counts.iterations}, операций — {plan.counts.operations}.
          </div>
          {plan.warnings.map((w) => <div key={w} className="small" style={{ color: 'var(--warn)' }}>⚠ {w}</div>)}
          {plan.errors.length > 0 && (
            <div className="error-box">
              Исправьте ошибки в файле:
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{plan.errors.slice(0, 10).map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          )}
          <div className="row wrap">
            <button type="button" className="btn primary" disabled={busy || plan.errors.length > 0 || !plan.docs.length} onClick={run}>
              {busy ? 'Загружаю…' : 'Загрузить в базу'}
            </button>
            <button type="button" className="btn ghost" onClick={() => setPlan(null)}>Отмена</button>
          </div>
        </div>
      )}
      <ErrorBox error={error} />
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
