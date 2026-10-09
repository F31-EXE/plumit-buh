import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useClientData } from '../lib/store.jsx';
import { ITERATION_STATUS, PROJECT_STATUS, dateLabel, money } from '../format.js';
import { Empty, ErrorBox, Icon, Loading, Stat } from '../ui.jsx';
import { Brand, Logo } from '../components/Brand.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import DocumentList from '../components/DocumentList.jsx';
import { MySettings } from './Employee.jsx';

const NAV = [
  ['/', 'folder', 'Мои проекты', 'Проекты'],
  ['/documents', 'doc', 'Документы', 'Документы'],
  ['/settings', 'settings', 'Настройки', 'Ещё'],
];
const R = (k) => k / 100;

// Кабинет заказчика: только его проекты — этапы, оплаты, суммы к оплате и документы
export default function ClientShell({ user, projectIds }) {
  const { ready, error, views, documents } = useClientData(projectIds);
  const projects = projectIds.map((id) => views[id]).filter(Boolean);

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
            <Route path="/" element={projects.length === 1 ? <ClientProject view={projects[0]} documents={documents[projects[0].project_id] || []} /> : <ClientProjects projects={projects} />} />
            <Route path="/p/:id" element={<ClientProjectPage views={views} documents={documents} />} />
            <Route path="/documents" element={<ClientDocuments projects={projects} documents={documents} />} />
            <Route path="/settings" element={<MySettings user={user} roleLabel="заказчик" />} />
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

function ClientProjects({ projects }) {
  if (!projects.length) {
    return <div className="card"><Empty title="Проектов пока нет">Как только студия откроет вам доступ к проекту, он появится здесь.</Empty></div>;
  }
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}><div className="grow"><h1>Мои проекты</h1><div className="sub">Этапы работ, оплаты и документы</div></div></div>
      <div className="projects-grid">
        {projects.map((v) => {
          const pct = v.progress.total ? Math.round((v.progress.done / v.progress.total) * 100) : 0;
          return (
            <Link key={v.project_id} to={`/p/${v.project_id}`} className="card project-card">
              <div className="spread">
                <h2 className="grow ellipsis">{v.name}</h2>
                <span className={`badge ${v.status}`}>{PROJECT_STATUS[v.status]}</span>
              </div>
              <div>
                <div className="spread small" style={{ marginBottom: 6 }}>
                  <span className="muted">Выполнено пунктов</span><strong>{v.progress.done} из {v.progress.total}</strong>
                </div>
                <div className="progress"><span style={{ width: `${pct}%` }} /></div>
              </div>
              <div className="kv">
                <div><span>Оплачено</span><strong>{money(R(v.paid))}</strong></div>
                <div><span>Осталось оплатить</span><strong>{money(R(v.remaining))}</strong></div>
              </div>
              {v.due_now > 0 && <div className="due-banner small">К оплате сейчас: <strong>{money(R(v.due_now))}</strong></div>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ClientProjectPage({ views, documents }) {
  const { id } = useParams();
  const v = views[id];
  if (!v) return <Empty title="Проект не найден"><Link to="/" className="btn sm" style={{ marginTop: 10 }}>К проектам</Link></Empty>;
  return (
    <div className="stack">
      <Link to="/" className="back"><Icon name="left" width={16} />Мои проекты</Link>
      <ClientProject view={v} documents={documents[id] || []} />
    </div>
  );
}

// Карточка проекта глазами заказчика (используется и в кабинете, и в предпросмотре у администратора)
export function ClientProject({ view: v, documents }) {
  const pct = v.progress.total ? Math.round((v.progress.done / v.progress.total) * 100) : 0;
  const inWork = v.items.filter((it) => it.status === 'in_work');
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="grow">
          <div className="row wrap"><h1>{v.name}</h1><span className={`badge ${v.status}`}>{PROJECT_STATUS[v.status]}</span></div>
          {v.start_date && <div className="sub">Старт: {dateLabel(v.start_date)}</div>}
        </div>
      </div>

      {v.due_now > 0 && (
        <div className="due-banner">
          <Icon name="wallet" width={20} />
          <div>К оплате сейчас <strong className="num">{money(R(v.due_now))}</strong> — выполнено работ больше, чем оплачено.</div>
        </div>
      )}

      <div className="stats four">
        <Stat label="Стоимость по договору" value={R(v.budget)} />
        <Stat label="Оплачено" value={R(v.paid)} tone="pos" hint={v.advance ? `в т.ч. аванс ${money(R(v.advance))}` : undefined} />
        <Stat accent label="Осталось оплатить" value={R(v.remaining)} />
        <Stat label="Выполнено работ на" value={R(v.done_value)} hint={`${v.progress.done} из ${v.progress.total} пунктов`} />
      </div>

      <div className="card stack" style={{ gap: 10 }}>
        <div className="spread small"><span className="muted">Готовность проекта</span><strong>{pct}%</strong></div>
        <div className="progress"><span style={{ width: `${pct}%` }} /></div>
        {inWork.length > 0 && (
          <div className="small muted">
            <strong>Сейчас в работе:</strong> {inWork.map((it) => it.title).join('; ')}
          </div>
        )}
      </div>

      <div className="card flush">
        <div className="card-head"><h2>Пункты договора</h2></div>
        {v.items.length ? (
          <div className="list">
            {v.items.map((it, i) => (
              <div key={i} className="list-item" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                <span className={`step-dot ${it.status}`} aria-hidden="true">{it.status === 'done' ? '✓' : i + 1}</span>
                <div className="grow">
                  <div style={{ overflowWrap: 'anywhere' }}>{it.title}</div>
                  <div className="row wrap" style={{ marginTop: 6, gap: 8 }}>
                    <span className={`badge ${it.status}`}>{ITERATION_STATUS[it.status]}</span>
                    {it.date && <span className="faint small">{it.status === 'done' ? 'сдано' : 'срок'} {dateLabel(it.date)}</span>}
                  </div>
                </div>
                <div className="op-amount">{it.price ? money(R(it.price)) : '—'}</div>
              </div>
            ))}
          </div>
        ) : <Empty title="Пункты пока не добавлены" />}
      </div>

      <div className="grid-2">
        <div className="card flush">
          <div className="card-head"><h2>Оплаты</h2></div>
          {v.payments.length ? (
            <div className="list">
              {v.payments.map((pay, i) => (
                <div key={i} className="list-item" style={{ cursor: 'default' }}>
                  <span className="op-icon income"><Icon name="in" /></span>
                  <div className="grow"><div style={{ fontWeight: 700 }}>{pay.is_advance ? 'Аванс' : 'Оплата'}</div><div className="faint small">{dateLabel(pay.date)}</div></div>
                  <div className="op-amount pos">{money(R(pay.amount))}</div>
                </div>
              ))}
            </div>
          ) : <Empty title="Оплат пока не было" />}
        </div>
        <div className="card flush">
          <div className="card-head"><h2>Документы</h2></div>
          <DocumentList documents={documents} />
        </div>
      </div>
    </div>
  );
}

function ClientDocuments({ projects, documents }) {
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}><div className="grow"><h1>Документы</h1><div className="sub">Договоры, акты и счета по вашим проектам</div></div></div>
      {projects.map((v) => (
        <div key={v.project_id} className="card flush">
          <div className="card-head"><h2>{v.name}</h2></div>
          <DocumentList documents={documents[v.project_id] || []} />
        </div>
      ))}
      {!projects.length && <div className="card"><Empty title="Документов пока нет" /></div>}
    </div>
  );
}
