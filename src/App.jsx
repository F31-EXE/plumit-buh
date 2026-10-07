import { createContext, useContext, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes, matchPath, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, configured } from './lib/firebase.js';
import { DataProvider, useAuthUser, useData, useRole } from './lib/store.jsx';
import { membersWithBalance, projectsWithSummary } from './lib/finance.js';
import { Icon, Loading, ToastProvider } from './ui.jsx';
import Login, { NoAccess, VerifyEmail } from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import Project from './pages/Project.jsx';
import Operations from './pages/Operations.jsx';
import Team from './pages/Team.jsx';
import Settings from './pages/Settings.jsx';
import OperationForm from './components/OperationForm.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import { Brand, EasterEggProvider, Logo } from './components/Brand.jsx';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const NAV = [
  ['/', 'home', 'Сводка', 'Главная'],
  ['/projects', 'folder', 'Проекты', 'Проекты'],
  ['/operations', 'list', 'Операции', 'Операции'],
  ['/team', 'users', 'Команда', 'Команда'],
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
  const role = useRole(user);
  if (user === undefined) return <Loading />;
  if (!user) return <Login />;
  if (!user.emailVerified) return <VerifyEmail user={user} />;
  if (role === undefined) return <Loading />;
  if (!role) return <NoAccess user={user} />;
  return (
    <DataProvider>
      <Shell user={user} role={role} />
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
    logout: () => signOut(auth),
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
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </main>

        <nav className="tabbar">
          {NAV.map(([to, icon, , short]) => (
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
