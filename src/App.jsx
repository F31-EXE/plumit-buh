import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, matchPath, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { Icon, Loading, ToastProvider } from './ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import Project from './pages/Project.jsx';
import Operations from './pages/Operations.jsx';
import Team from './pages/Team.jsx';
import Settings from './pages/Settings.jsx';
import OperationForm from './components/OperationForm.jsx';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const NAV = [
  ['/', 'home', 'Сводка', 'Главная'],
  ['/projects', 'folder', 'Проекты', 'Проекты'],
  ['/operations', 'list', 'Операции', 'Операции'],
  ['/team', 'users', 'Команда', 'Команда'],
  ['/settings', 'settings', 'Настройки', 'Ещё'],
];

export function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

export default function App() {
  const [me, setMe] = useState(undefined);

  useEffect(() => {
    try { applyTheme(localStorage.getItem('theme')); } catch { /* приватный режим */ }
    api.get('/auth/me').then(setMe).catch(() => setMe(null));
    const onUnauthorized = () => setMe(null);
    window.addEventListener('plumit:unauthorized', onUnauthorized);
    return () => window.removeEventListener('plumit:unauthorized', onUnauthorized);
  }, []);

  if (me === undefined) return <Loading />;
  return <ToastProvider>{me ? <Shell me={me} onLogout={() => setMe(null)} /> : <Login onLogin={setMe} />}</ToastProvider>;
}

function Shell({ me, onLogout }) {
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [version, setVersion] = useState(0);
  const [opForm, setOpForm] = useState(null);

  const loadRefs = useCallback(() => {
    api.get('/members').then(setMembers).catch(() => {});
    api.get('/projects').then(setProjects).catch(() => {});
  }, []);
  useEffect(loadRefs, [loadRefs, version]);

  const changed = useCallback(() => setVersion((v) => v + 1), []);
  const isAdmin = me.role === 'admin';
  const location = useLocation();
  // На странице проекта новая операция сразу привязывается к нему
  const currentProject = matchPath('/projects/:id', location.pathname)?.params.id;
  const newOperation = () => setOpForm(currentProject ? { project_id: Number(currentProject) } : {});

  const ctx = {
    me, isAdmin, members, projects, version, changed, onLogout,
    openOperation: (preset = {}) => isAdmin && setOpForm(preset),
  };

  return (
    <AppCtx.Provider value={ctx}>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <img src="/icon.svg" alt="" />
            <div>Plumit<small>Бухгалтерия проектов</small></div>
          </div>
          {NAV.map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className="nav-link"><Icon name={icon} />{label}</NavLink>
          ))}
          <div className="spacer" />
          {isAdmin && (
            <button type="button" className="btn primary" onClick={newOperation}><Icon name="plus" />Операция</button>
          )}
        </aside>

        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<Project />} />
            <Route path="/operations" element={<Operations />} />
            <Route path="/team" element={<Team />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
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

      {opForm && (
        <OperationForm
          initial={opForm}
          onClose={() => setOpForm(null)}
          onSaved={() => { setOpForm(null); changed(); }}
        />
      )}
    </AppCtx.Provider>
  );
}
