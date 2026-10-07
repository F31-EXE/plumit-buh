import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useApp } from '../App.jsx';
import { ITERATION_STATUS, PROJECT_STATUS, money, thisMonth } from '../format.js';
import { Avatar, Empty, ErrorBox, Icon, Loading, MonthPicker, Segmented, Stat, Tabs, useLoad } from '../ui.jsx';
import IterationForm from '../components/IterationForm.jsx';
import MonthGrid from '../components/MonthGrid.jsx';
import OperationsList from '../components/OperationsList.jsx';
import ProjectForm from '../components/ProjectForm.jsx';

export default function Project() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { version, changed, isAdmin, openOperation } = useApp();
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [iterForm, setIterForm] = useState(null);
  const { data: p, error } = useLoad(() => api.get(`/projects/${id}`), [id, version]);
  const ops = useLoad(() => api.get(`/operations${qs({ project_id: id })}`), [id, version]);

  if (!p) return error ? <ErrorBox error={error} /> : <Loading />;
  const s = p.summary;

  return (
    <div>
      <Link to="/projects" className="back"><Icon name="left" width={16} />Проекты</Link>
      <div className="page-head">
        <div className="grow">
          <div className="row wrap"><h1>{p.name}</h1><span className={`badge ${p.status}`}>{PROJECT_STATUS[p.status]}</span></div>
          <div className="sub">{[p.client, p.members.map((m) => m.name).join(', ')].filter(Boolean).join(' · ')}</div>
        </div>
        {isAdmin && (
          <div className="row">
            <button type="button" className="btn icon" onClick={() => setEditing(true)} aria-label="Настройки проекта"><Icon name="edit" /></button>
            <button type="button" className="btn primary hide-mobile" onClick={() => openOperation({ project_id: p.id })}><Icon name="plus" />Операция</button>
          </div>
        )}
      </div>

      <Tabs value={tab} onChange={setTab} options={[['overview', 'Обзор'], ['iterations', `Итерации · ${p.iterations.length}`], ['operations', 'Операции'], ['calendar', 'По дням']]} />

      {tab === 'overview' && <Overview p={p} s={s} />}
      {tab === 'iterations' && <Iterations p={p} onEdit={setIterForm} />}
      {tab === 'operations' && (
        <div className="card flush">{ops.data ? <OperationsList operations={ops.data} showProject={false} /> : <Loading />}</div>
      )}
      {tab === 'calendar' && <Calendar p={p} operations={ops.data || []} />}

      {editing && (
        <ProjectForm project={p} onClose={() => setEditing(false)} onSaved={(pid) => { setEditing(false); changed(); if (!pid) navigate('/projects'); }} />
      )}
      {iterForm && (
        <IterationForm project={p} iteration={iterForm.id ? iterForm : null} onClose={() => setIterForm(null)} onSaved={() => { setIterForm(null); changed(); }} />
      )}
    </div>
  );
}

function Overview({ p, s }) {
  const { isAdmin, openOperation } = useApp();
  const paidPct = s.budget ? Math.min(100, Math.round((s.income / s.budget) * 100)) : 0;
  const totals = s.team.reduce((a, m) => ({ accrued: a.accrued + m.accrued, penalties: a.penalties + m.penalties, paid: a.paid + m.paid, due: a.due + m.due }), { accrued: 0, penalties: 0, paid: 0, due: 0 });

  return (
    <div className="stack">
      <div className="stats">
        <Stat accent label="Стоимость проекта" value={s.budget} hint={s.iterationsTotal !== s.budget ? `Сумма итераций: ${money(s.iterationsTotal)}` : undefined} />
        <Stat label="Получено от клиента" value={s.income} hint={s.advance ? `в т.ч. аванс ${money(s.advance)}` : undefined} tone="pos" />
        <Stat label="Осталось получить" value={s.receivable} />
        <Stat label="В кассе проекта" value={s.cash} />
        <Stat label="Должны команде" value={s.teamDue} />
        <Stat label="Чистые (план)" value={s.profitPlan} hint="Стоимость − команда − расходы − налоги" />
      </div>

      <div className="card">
        <div className="spread small" style={{ marginBottom: 8 }}>
          <span className="muted">Оплачено клиентом</span><strong>{paidPct}%</strong>
        </div>
        <div className="progress"><span style={{ width: `${paidPct}%` }} /></div>
        <div className="row wrap small muted" style={{ marginTop: 12, gap: 18 }}>
          <span>Выплачено команде: <strong className="num">{money(s.payouts)}</strong></span>
          <span>Расходы: <strong className="num">{money(s.expenses)}</strong></span>
          <span>Налоги и взносы: <strong className="num">{money(s.taxes)}</strong></span>
        </div>
      </div>

      <div className="card flush">
        <div className="card-head"><h2>Расчёты с командой</h2></div>
        {s.team.length ? (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="table">
              <thead>
                <tr><th>Участник</th><th className="num">Начислено</th><th className="num hide-mobile">Штрафы</th><th className="num">Выплачено</th><th className="num">Осталось</th>{isAdmin && <th />}</tr>
              </thead>
              <tbody>
                {s.team.map((m) => (
                  <tr key={m.member_id}>
                    <td><div className="row"><Avatar name={m.name} id={m.member_id} /><div><strong>{m.name}</strong><div className="faint small">{m.role}</div></div></div></td>
                    <td className="num">{money(m.accrued)}</td>
                    <td className="num hide-mobile">{m.penalties ? <span className="neg">−{money(m.penalties)}</span> : '—'}</td>
                    <td className="num">{money(m.paid)}</td>
                    <td className="num"><strong className={m.due < 0 ? 'neg' : ''}>{money(m.due)}</strong></td>
                    {isAdmin && (
                      <td className="right">
                        {m.due > 0 && (
                          <button type="button" className="btn sm" onClick={() => openOperation({ type: 'payout', project_id: p.id, member_id: m.member_id, amount: m.due })}>Выплатить</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>Итого</td><td className="num">{money(totals.accrued)}</td><td className="num hide-mobile">{totals.penalties ? `−${money(totals.penalties)}` : '—'}</td><td className="num">{money(totals.paid)}</td><td className="num">{money(totals.due)}</td>{isAdmin && <td />}</tr>
              </tfoot>
            </table>
          </div>
        ) : <Empty title="Команда не назначена">Добавьте участников в настройках проекта.</Empty>}
      </div>

      {p.notes && <div className="card"><h3 style={{ marginBottom: 6 }}>Заметки</h3><div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{p.notes}</div></div>}
    </div>
  );
}

function Iterations({ p, onEdit }) {
  const { isAdmin } = useApp();
  const people = [...p.members];
  for (const t of p.summary.team) if (!people.some((x) => x.id === t.member_id)) people.push({ id: t.member_id, name: t.name, role: t.role });
  const live = p.iterations.filter((it) => it.status !== 'cancelled');
  const sumBy = (fn) => live.reduce((a, it) => a + fn(it), 0);

  return (
    <div className="card flush">
      <div className="card-head">
        <h2>Итерации и начисления</h2>
        {isAdmin && <button type="button" className="btn sm primary" onClick={() => onEdit({})}><Icon name="plus" />Итерация</button>}
      </div>
      {p.iterations.length ? (
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Итерация</th>
                <th className="num">Стоимость</th>
                {people.map((m) => <th key={m.id} className="num">{m.name}</th>)}
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {p.iterations.map((it) => (
                <tr key={it.id} className={`${isAdmin ? 'clickable' : ''} ${it.status === 'cancelled' ? 'dim' : ''}`} onClick={() => isAdmin && onEdit(it)}>
                  <td style={{ minWidth: 220, maxWidth: 420 }}>{it.title}</td>
                  <td className="num">{money(it.price)}</td>
                  {people.map((m) => <td key={m.id} className="num">{it.shares[m.id] ? money(it.shares[m.id]) : <span className="faint">—</span>}</td>)}
                  <td><span className={`badge ${it.status}`}>{ITERATION_STATUS[it.status]}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Итого (без отменённых)</td>
                <td className="num">{money(sumBy((it) => it.price))}</td>
                {people.map((m) => <td key={m.id} className="num">{money(sumBy((it) => it.shares[m.id] || 0))}</td>)}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : <Empty title="Итераций пока нет">Добавьте пункты работ и распределите, кому сколько начисляется.</Empty>}
    </div>
  );
}

function Calendar({ p, operations }) {
  const latest = operations[0]?.date?.slice(0, 7);
  const [month, setMonth] = useState(latest || thisMonth());
  const [view, setView] = useState('grid');
  const inMonth = operations.filter((o) => o.date.startsWith(month));
  return (
    <div className="stack">
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <MonthPicker value={month} onChange={setMonth} />
        <Segmented value={view} onChange={setView} options={[['grid', 'Таблица'], ['list', 'Список']]} />
      </div>
      <div className="card flush">
        {view === 'grid' ? <MonthGrid month={month} operations={inMonth} members={p.members} /> : <OperationsList operations={inMonth} showProject={false} emptyText="В этом месяце операций нет" />}
      </div>
    </div>
  );
}
