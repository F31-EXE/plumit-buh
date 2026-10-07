import { useState } from 'react';
import { api, qs } from '../api.js';
import { useApp } from '../App.jsx';
import { OP_TYPES, thisMonth } from '../format.js';
import { ErrorBox, Icon, Loading, MonthPicker, Segmented, Stat, useLoad } from '../ui.jsx';
import MonthGrid from '../components/MonthGrid.jsx';
import OperationsList from '../components/OperationsList.jsx';

export default function Operations() {
  const { version, projects, members } = useApp();
  const [month, setMonth] = useState(thisMonth());
  const [allTime, setAllTime] = useState(false);
  const [type, setType] = useState('');
  const [projectId, setProjectId] = useState('');
  const [view, setView] = useState('list');
  const filters = { month: allTime ? '' : month, type, project_id: projectId };
  const { data, error } = useLoad(() => api.get(`/operations${qs(filters)}`), [month, allTime, type, projectId, version]);

  const sum = (t) => (data || []).filter((o) => o.type === t).reduce((a, o) => a + o.amount, 0);
  const gridMembers = projectId ? (projects.find((p) => String(p.id) === projectId)?.summary.team.map((t) => ({ id: t.member_id, name: t.name })) || []) : members.filter((m) => m.active);

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1>Операции</h1><div className="sub">Журнал всех поступлений, выплат и расходов</div></div>
        <a className="btn" href={`/api/export/operations.csv${qs(filters)}`}><Icon name="download" />CSV для Excel</a>
      </div>

      <div className="toolbar" style={{ marginBottom: 0 }}>
        {!allTime && <MonthPicker value={month} onChange={setMonth} />}
        <label className="check small"><input type="checkbox" checked={allTime} onChange={(e) => { setAllTime(e.target.checked); if (e.target.checked) setView('list'); }} />Всё время</label>
        <select className="input sm" style={{ width: 'auto' }} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Все проекты</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input sm" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Все типы</option>
          {Object.entries(OP_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {!allTime && <Segmented value={view} onChange={setView} options={[['list', 'Список'], ['grid', 'По дням']]} />}
      </div>

      {data && (
        <div className="stats four">
          <Stat label="Поступления" value={sum('income')} tone="pos" />
          <Stat label="Выплаты команде" value={sum('payout')} />
          <Stat label="Расходы" value={sum('expense')} />
          <Stat label="Налоги и взносы" value={sum('tax')} />
        </div>
      )}

      <ErrorBox error={error} />
      <div className="card flush">
        {!data ? <Loading /> : view === 'grid' && !allTime
          ? <MonthGrid month={month} operations={data} members={gridMembers} />
          : <OperationsList operations={data} emptyText={allTime ? 'Операций нет' : 'В этом месяце операций нет'} />}
      </div>
      {data?.length >= 1000 && <div className="faint small">Показаны последние 1000 операций — сузьте фильтр.</div>}
    </div>
  );
}
