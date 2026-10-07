import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../App.jsx';
import { PROJECT_STATUS, money, monthLabel, thisMonth } from '../format.js';
import { Avatar, Empty, MonthPicker, Stat } from '../ui.jsx';
import { dashboard, listOperations } from '../lib/finance.js';
import CashChart from '../components/CashChart.jsx';
import OperationsList from '../components/OperationsList.jsx';

export default function Dashboard() {
  const { data: all, me } = useApp();
  const navigate = useNavigate();
  const [month, setMonth] = useState(thisMonth());
  const data = useMemo(() => dashboard(all, month), [all, month]);
  const recent = useMemo(() => listOperations(all, { limit: 8 }), [all]);
  const { total, monthFlow } = data;
  const due = data.teamDue.reduce((a, m) => a + m.due, 0);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Привет, {me.name.split(' ')[0]}</h1>
          <div className="sub">Деньги студии по всем проектам</div>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      <div className="stats">
        <Stat accent label="В кассе сейчас" value={total.cash} hint="Поступления − выплаты − расходы − налоги" />
        <Stat label="Должны команде" value={due} hint="Начислено, но не выплачено" />
        <Stat label="Ждём от клиентов" value={data.projects.filter((p) => p.status !== 'done').reduce((a, p) => a + Math.max(0, p.receivable), 0)} hint="По активным проектам" />
        <Stat label={`Поступления · ${monthLabel(month).split(' ')[0].toLowerCase()}`} value={monthFlow.income} tone="pos" />
        <Stat label="Выплаты команде за месяц" value={monthFlow.payouts} />
        <Stat label="Расходы и налоги за месяц" value={monthFlow.expenses + monthFlow.taxes} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Движение денег</h2>
            <div className="legend">
              <span><i style={{ background: 'var(--chart-income)' }} />Поступления</span>
              <span><i style={{ background: 'var(--chart-outflow)' }} />Выплаты и расходы</span>
            </div>
          </div>
          <CashChart series={data.series} />
        </div>

        <div className="card flush">
          <div className="card-head"><h2>Долг перед командой</h2></div>
          {data.teamDue.length ? (
            <div className="list" style={{ marginTop: 6 }}>
              {data.teamDue.map((m) => (
                <Link to="/team" key={m.member_id} className="list-item">
                  <Avatar name={m.name} id={m.member_id} />
                  <div className="grow">
                    <div style={{ fontWeight: 700 }}>{m.name}</div>
                    <div className="faint small">{m.role} · выплачено {money(m.paid)} из {money(m.accrued - m.penalties)}</div>
                  </div>
                  <div className={`op-amount ${m.due < 0 ? 'neg' : ''}`}>{money(m.due)}</div>
                </Link>
              ))}
            </div>
          ) : <Empty title="Все рассчитаны">Долгов перед командой нет.</Empty>}
        </div>
      </div>

      <div className="grid-2">
        <div className="card flush">
          <div className="card-head"><h2>Проекты</h2><Link to="/projects" className="btn sm ghost">Все</Link></div>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="table">
              <thead><tr><th>Проект</th><th className="num">Стоимость</th><th className="num">Получено</th><th className="num hide-mobile">В кассе</th><th className="num hide-mobile">Чистые</th></tr></thead>
              <tbody>
                {data.projects.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/projects/${p.id}`)}>
                    <td><Link to={`/projects/${p.id}`} style={{ fontWeight: 700 }}>{p.name}</Link><div className="faint small">{PROJECT_STATUS[p.status]}</div></td>
                    <td className="num">{money(p.budget)}</td>
                    <td className="num">{money(p.income)}</td>
                    <td className="num hide-mobile">{money(p.cash)}</td>
                    <td className="num hide-mobile">{money(p.profitPlan)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.projects.length && <Empty title="Проектов пока нет"><Link to="/projects" className="btn sm" style={{ marginTop: 10 }}>Создать проект</Link></Empty>}
          </div>
        </div>

        <div className="card flush">
          <div className="card-head"><h2>Последние операции</h2><Link to="/operations" className="btn sm ghost">Все</Link></div>
          <OperationsList operations={recent} />
        </div>
      </div>
    </div>
  );
}
