import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes, matchPath, useLocation } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { configured, db, logout } from './lib/firebase.js';
import { DataProvider, useAuthUser, useData, useAccess } from './lib/store.jsx';
import { memberStatement, membersWithBalance, projectsWithSummary } from './lib/finance.js';
import { stableJson, writeStatements } from './lib/actions.js';
import { setAuditData } from './lib/audit.js';
import { Icon, Loading, ToastProvider } from './ui.jsx';
import Login, { NoAccess, VerifyEmail } from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import Project from './pages/Project.jsx';
import Operations from './pages/Operations.jsx';
import Team from './pages/Team.jsx';
import Member from './pages/Member.jsx';
import Savings, { SavingsAccount } from './pages/Savings.jsx';
import EmployeeShell from './pages/Employee.jsx';
import Reports from './pages/Reports.jsx';
import Journal from './pages/Journal.jsx';
import Settings from './pages/Settings.jsx';
import OperationForm from './components/OperationForm.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import { Brand, EasterEggProvider, Logo } from './components/Brand.jsx';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

// [путь, иконка, подпись в меню, подпись в нижней панели (null — только в боковом меню; на телефоне — через «Ещё»)]
const NAV = [
  ['/', 'home', 'Сводка', 'Главная'],
  ['/projects', 'folder', 'Проекты', 'Проекты'],
  ['/operations', 'list', 'Операции', 'Операции'],
  ['/team', 'users', 'Команда', 'Команда'],
  ['/savings', 'wallet', 'Счета', null],
  ['/reports', 'chart', 'Отчёты', null],
  ['/journal', 'history', 'Журнал', null],
  ['/settings', 'settings', 'Настройки', 'Ещё'],
];

export default function App() {
  if (!configured) return <NotConfigured />;
  return (
    <EasterEggProvider>
      <ToastProvider><Gate /></ToastProvider>
    </EasterEggProvider>
  );
}

function Gate() {
  const user = useAuthUser();
  const access = useAccess(user);
  if (user === undefined) return <Loading />;
  if (!user) return <Login />;
  if (!user.emailVerified) return <VerifyEmail user={user} />;
  if (access === undefined) return <Loading />;
  if (!access) return <NoAccess user={user} />;
  if (access.role === 'employee') return <EmployeeShell user={user} memberId={access.member_id} />;
  return (
    <DataProvider>
      <Shell user={user} role={access.role} />
    </DataProvider>
  );
}

function Shell({ user, role }) {
  const data = useData();
  const [opForm, setOpForm] = useState(null);
  const location = useLocation();
  const isAdmin = role === 'admin';

  const members = useMemo(() => membersWithBalance(data), [data]);
  const projects = useMemo(() => projectsWithSummary(data), [data]);
  useStatementSync(data, isAdmin);
  useEffect(() => setAuditData(data), [data]);

  // На странице проекта новая операция сразу привязывается к нему
  const currentProject = matchPath('/projects/:id', location.pathname)?.params.id;
  const newOperation = () => setOpForm(currentProject ? { project_id: currentProject } : {});

  const ctx = {
    me: { name: user.displayName || user.email.split('@')[0], email: user.email, role },
    isAdmin,
    data,
    members,
    projects,
    openOperation: (preset = {}) => isAdmin && setOpForm(preset),
    logout,
  };

  return (
    <AppCtx.Provider value={ctx}>
      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-head">
            <Brand />
            <ThemeToggle />
          </div>
          {NAV.map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className="nav-link"><Icon name={icon} />{label}</NavLink>
          ))}
          <div className="spacer" />
          {isAdmin && (
            <button type="button" className="btn primary" onClick={newOperation}><Icon name="plus" />Операция</button>
          )}
        </aside>

        <header className="topbar">
          <Logo size={34} />
          <strong className="grow">Plumit</strong>
          <ThemeToggle />
        </header>

        <main className="main">
          {data.error && <div className="error-box" style={{ marginBottom: 16 }}>Не удалось загрузить данные: {data.error.message}</div>}
          {!data.ready ? <Loading /> : (
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<Project />} />
              <Route path="/operations" element={<Operations />} />
              <Route path="/team" element={<Team />} />
              <Route path="/team/:id" element={<Member />} />
              <Route path="/savings" element={<Savings />} />
              <Route path="/savings/:id" element={<SavingsAccount />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </main>

        <nav className="tabbar">
          {NAV.filter((n) => n[3]).map(([to, icon, , short]) => (
            <NavLink key={to} to={to} end={to === '/'}><Icon name={icon} />{short}</NavLink>
          ))}
        </nav>
        {isAdmin && (
          <button type="button" className="fab" onClick={newOperation} aria-label="Добавить операцию"><Icon name="plus" /></button>
        )}
      </div>

      {opForm && <OperationForm initial={opForm} onClose={() => setOpForm(null)} onSaved={() => setOpForm(null)} />}
    </AppCtx.Provider>
  );
}

// Выписки сотрудников (statements/{memberId}) держим актуальными: приложение администратора
// пересчитывает их после каждого изменения данных и записывает только изменившиеся.
function useStatementSync(data, enabled) {
  const [existing, setExisting] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    return onSnapshot(collection(db, 'statements'), (snap) => {
      setExisting(new Map(snap.docs.map((d) => [d.id, stableJson(d.data())])));
    }, () => {});
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !existing || !data.ready) return undefined;
    const t = setTimeout(() => {
      const desired = new Map(data.members.map((m) => [m.id, memberStatement(data, m.id)]));
      writeStatements(desired, existing);
    }, 1200);
    return () => clearTimeout(t);
  }, [data, existing, enabled]);
}

function NotConfigured() {
  return (
    <div className="login">
      <div className="card stack">
        <h2>Firebase не настроен</h2>
        <p className="muted" style={{ margin: 0 }}>
          Создайте файл <code>.env.local</code> с ключами веб-приложения Firebase (образец — <code>.env.example</code>) и пересоберите приложение.
        </p>
      </div>
    </div>
  );
}
