import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { useEmployeeData } from '../lib/store.jsx';
import { useTheme } from '../lib/theme.js';
import { OP_TYPES, dateLabel, money } from '../format.js';
import { Empty, ErrorBox, Icon, Loading, OP_ICON, Segmented, Stat } from '../ui.jsx';
import { Brand, Logo } from '../components/Brand.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import DocumentList from '../components/DocumentList.jsx';
import { StatementProjects } from './Member.jsx';
import { PasswordForm } from './Settings.jsx';

const NAV = [
  ['/', 'wallet', 'Мои начисления', 'Начисления'],
  ['/documents', 'doc', 'Документы', 'Документы'],
  ['/settings', 'settings', 'Настройки', 'Ещё'],
];
const R = (k) => k / 100;

// Кабинет сотрудника: только его выписка и документы
export default function EmployeeShell({ user, memberId }) {
  const { ready, error, statement, documents } = useEmployeeData(memberId);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-head"><Brand /><ThemeToggle /></div>
        {NAV.map(([to, icon, label]) => <NavLink key={to} to={to} end={to === '/'} className="nav-link"><Icon name={icon} />{label}</NavLink>)}
      </aside>
      <header className="topbar">
        <Logo size={34} />
        <strong className="grow">Plumit</strong>
        <ThemeToggle />
      </header>
      <main className="main">
        <ErrorBox error={error} />
        {!ready ? <Loading /> : (
          <Routes>
            <Route path="/" element={<MyStatement statement={statement} />} />
            <Route path="/documents" element={<MyDocuments documents={documents} />} />
            <Route path="/settings" element={<MySettings user={user} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
      <nav className="tabbar" style={{ gridTemplateColumns: `repeat(${NAV.length}, 1fr)` }}>
        {NAV.map(([to, icon, , short]) => <NavLink key={to} to={to} end={to === '/'}><Icon name={icon} />{short}</NavLink>)}
      </nav>
    </div>
  );
}

function MyStatement({ statement }) {
  if (!statement) {
    return <div className="card"><Empty title="Данных пока нет">Начисления появятся, как только администратор внесёт их в приложение.</Empty></div>;
  }
  const t = statement.totals;
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="grow"><h1>{statement.name}</h1><div className="sub">{statement.role || 'Мои начисления и выплаты'}</div></div>
      </div>
      <div className="stats four">
        <Stat accent label="Осталось выплатить" value={R(t.due)} />
        <Stat label="Начислено" value={R(t.accrued)} />
        <Stat label="Выплачено" value={R(t.paid)} tone="pos" />
        <Stat label="Штрафы" value={R(t.penalties)} />
      </div>
      <StatementProjects statement={statement} />
      <div className="card flush">
        <div className="card-head"><h2>История выплат</h2></div>
        {statement.history.length ? (
          <div className="list">
            {statement.history.map((h, i) => {
              const sign = h.type === 'payout' || (h.type === 'transfer' && h.direction === 'in') ? '+' : '−';
              const title = h.type === 'transfer' ? (h.direction === 'in' ? `Перевод от: ${h.other}` : `Перевод: ${h.other}`) : h.type === 'payout' ? 'Выплата' : OP_TYPES[h.type].label;
              return (
                <div key={i} className="list-item" style={{ cursor: 'default' }}>
                  <span className={`op-icon ${h.type === 'payout' ? 'income' : h.type === 'penalty' ? 'expense' : ''}`}><Icon name={h.type === 'payout' ? 'in' : OP_ICON[h.type]} /></span>
                  <div className="grow">
                    <div style={{ fontWeight: 700 }}>{title}</div>
                    <div className="faint small ellipsis">{[dateLabel(h.date), h.project, h.comment].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className={`op-amount ${h.type === 'penalty' ? 'neg' : h.type === 'payout' ? 'pos' : ''}`}>{sign}{money(R(h.amount))}</div>
                </div>
              );
            })}
          </div>
        ) : <Empty title="Выплат пока не было" />}
      </div>
    </div>
  );
}

function MyDocuments({ documents }) {
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}><div className="grow"><h1>Документы</h1><div className="sub">Договоры, акты и другие файлы</div></div></div>
      <div className="card flush"><DocumentList documents={documents} /></div>
    </div>
  );
}

function MySettings({ user }) {
  const { theme, setTheme } = useTheme();
  const hasPassword = user.providerData.some((p) => p.providerId === 'password');
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="page-head" style={{ marginBottom: 0 }}><div className="grow"><h1>Настройки</h1><div className="sub">{user.email} · сотрудник</div></div></div>
      <div className="card stack">
        <h2>Оформление</h2>
        <Segmented className="fit" value={theme} onChange={(t) => setTheme(t)} options={[['auto', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']]} />
      </div>
      {hasPassword && <PasswordForm />}
      <div><button type="button" className="btn danger" onClick={() => signOut(auth)}><Icon name="logout" />Выйти</button></div>
    </div>
  );
}
