import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../App.jsx';
import { PROJECT_STATUS, money } from '../format.js';
import { Empty, Icon } from '../ui.jsx';
import ProjectForm from '../components/ProjectForm.jsx';

export default function Projects() {
  const { projects, isAdmin, changed } = useApp();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  return (
    <div>
      <div className="page-head">
        <div><h1>Проекты</h1><div className="sub">{projects.length} всего</div></div>
        {isAdmin && <button type="button" className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" />Проект</button>}
      </div>

      {!projects.length && <div className="card"><Empty title="Проектов пока нет">Создайте первый проект, добавьте команду и итерации.</Empty></div>}

      <div className="projects-grid">
        {projects.map((p) => {
          const s = p.summary;
          const paidPct = s.budget ? Math.min(100, Math.round((s.income / s.budget) * 100)) : 0;
          return (
            <Link key={p.id} to={`/projects/${p.id}`} className="card project-card">
              <div className="spread">
                <div className="grow">
                  <h2 className="ellipsis">{p.name}</h2>
                  <div className="faint small ellipsis">{p.client || 'Клиент не указан'}</div>
                </div>
                <span className={`badge ${p.status}`}>{PROJECT_STATUS[p.status]}</span>
              </div>
              <div>
                <div className="spread small" style={{ marginBottom: 6 }}>
                  <span className="muted">Оплачено клиентом</span>
                  <span className="num"><strong>{money(s.income)}</strong> <span className="faint">из {money(s.budget)}</span></span>
                </div>
                <div className="progress"><span style={{ width: `${paidPct}%` }} /></div>
              </div>
              <div className="kv">
                <div><span>В кассе</span><strong>{money(s.cash)}</strong></div>
                <div><span>Долг команде</span><strong>{money(s.teamDue)}</strong></div>
                <div><span>Итерации</span><strong>{money(s.iterationsTotal)}</strong></div>
                <div><span>Чистые (план)</span><strong>{money(s.profitPlan)}</strong></div>
              </div>
            </Link>
          );
        })}
      </div>

      {creating && (
        <ProjectForm onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); changed(); if (id) navigate(`/projects/${id}`); }} />
      )}
    </div>
  );
}
