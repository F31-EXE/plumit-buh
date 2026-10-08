import { useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import { buildReport, buildWorkbook, dataMonthRange, monthName, monthsBetween } from '../lib/report.js';
import { money, thisMonth } from '../format.js';
import { Empty, ErrorBox, Icon, Segmented, Stat, useToast } from '../ui.jsx';
import CashChart from '../components/CashChart.jsx';

function presetRange(preset, data) {
  const now = thisMonth();
  const [y, m] = now.split('-').map(Number);
  if (preset === 'month') return [now, now];
  if (preset === 'quarter') {
    const q = Math.floor((m - 1) / 3) * 3 + 1;
    return [`${y}-${String(q).padStart(2, '0')}`, `${y}-${String(q + 2).padStart(2, '0')}`];
  }
  if (preset === 'year') return [`${y}-01`, `${y}-12`];
  const range = dataMonthRange(data);
  return range ? [range[0], range[1] > now ? range[1] : now] : [now, now];
}

export default function Reports() {
  const { data, projects } = useApp();
  const toast = useToast();
  const [preset, setPreset] = useState('year');
  const [custom, setCustom] = useState(() => presetRange('year', data));
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [from, to] = preset === 'custom' ? custom : presetRange(preset, data);
  const report = useMemo(() => buildReport(data, { from, to, projectId: projectId || null }), [data, from, to, projectId]);
  const allMonths = useMemo(() => {
    const r = dataMonthRange(data);
    const now = thisMonth();
    return monthsBetween(r ? (r[0] < now ? r[0] : now) : now, r && r[1] > now ? r[1] : now).reverse();
  }, [data]);

  async function exportXlsx() {
    setBusy(true);
    setError(null);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = buildWorkbook(ExcelJS, data, report);
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      // Имя файла латиницей: браузеры иногда теряют кириллицу в имени скачиваемого файла
      const slug = projectId ? `-${(projects.find((p) => p.id === projectId)?.name || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'project'}` : '';
      const a = Object.assign(document.createElement('a'), { href: url, download: `plumit-report${slug}-${from}${from !== to ? `_${to}` : ''}.xlsx` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Файл Excel сохранён');
    } catch (e) { setError(e); }
    setBusy(false);
  }

  const t = report.total;
  const cols = [['income', 'Поступления'], ['payouts', 'Выплаты'], ['expenses', 'Расходы'], ['taxes', 'Налоги'], ['profit', 'Прибыль']];
  const CashTable = ({ rows, nameLabel }) => (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>{nameLabel}</th>{cols.map(([k, l]) => <th key={k} className={`num ${k === 'expenses' || k === 'taxes' ? 'hide-mobile' : ''}`}>{l}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.name}</td>
              {cols.map(([k]) => <td key={k} className={`num ${k === 'expenses' || k === 'taxes' ? 'hide-mobile' : ''} ${k === 'profit' && r[k] < 0 ? 'neg' : ''}`}>{r[k] ? money(r[k]) : '—'}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td>Итого</td>{cols.map(([k]) => <td key={k} className={`num ${k === 'expenses' || k === 'taxes' ? 'hide-mobile' : ''}`}>{money(t[k])}</td>)}</tr>
        </tfoot>
      </table>
    </div>
  );

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="grow">
          <h1>Отчёты</h1>
          <div className="sub">{from === to ? monthName(from) : `${monthName(from)} — ${monthName(to)}`}</div>
        </div>
        <button type="button" className="btn primary" onClick={exportXlsx} disabled={busy}><Icon name="download" />{busy ? 'Готовлю файл…' : 'Выгрузить в Excel'}</button>
      </div>

      <div className="toolbar" style={{ marginBottom: 0 }}>
        <Segmented value={preset} onChange={setPreset} options={[['month', 'Месяц'], ['quarter', 'Квартал'], ['year', 'Год'], ['all', 'Всё время'], ['custom', 'Период']]} />
        <select className="input sm" style={{ width: 'auto' }} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Все проекты</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {preset === 'custom' && (
        <div className="row wrap">
          <span className="muted small">с</span>
          <select className="input sm" style={{ width: 'auto' }} value={custom[0]} onChange={(e) => setCustom(([, b]) => [e.target.value, e.target.value > b ? e.target.value : b])}>
            {allMonths.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
          <span className="muted small">по</span>
          <select className="input sm" style={{ width: 'auto' }} value={custom[1]} onChange={(e) => setCustom(([a]) => [e.target.value < a ? e.target.value : a, e.target.value])}>
            {allMonths.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
        </div>
      )}
      <ErrorBox error={error} />

      <div className="stats four">
        <Stat label="Поступления" value={t.income} tone="pos" />
        <Stat label="Выплаты команде" value={t.payouts} />
        <Stat label="Расходы и налоги" value={t.expenses + t.taxes} />
        <Stat accent label="Прибыль" value={t.profit} hint="Поступления − выплаты − расходы − налоги" />
      </div>

      {!report.operationsCount ? (
        <div className="card"><Empty title="За этот период операций нет">Выберите другой период или проект.</Empty></div>
      ) : (
        <>
          {report.months.length > 1 && (
            <div className="card">
              <div className="card-head">
                <h2>По месяцам</h2>
                <div className="legend">
                  <span><i style={{ background: 'var(--chart-income)' }} />Поступления</span>
                  <span><i style={{ background: 'var(--chart-outflow)' }} />Выплаты и расходы</span>
                </div>
              </div>
              <CashChart series={report.byMonth.map((m) => ({ month: m.month, income: m.income, outflow: m.outflow }))} />
            </div>
          )}

          <div className="card flush">
            <div className="card-head"><h2>По месяцам</h2></div>
            <CashTable nameLabel="Месяц" rows={report.byMonth.map((m) => ({ ...m, key: m.month, name: monthName(m.month) }))} />
          </div>

          {!projectId && (
            <div className="card flush">
              <div className="card-head"><h2>По проектам</h2></div>
              <CashTable nameLabel="Проект" rows={report.byProject.map((p) => ({ ...p, key: p.project_id || 'none' }))} />
            </div>
          )}

          <div className="grid-2">
            <div className="card flush">
              <div className="card-head"><h2>Расходы и налоги по статьям</h2></div>
              {report.byCategory.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <tbody>
                      {report.byCategory.map((c) => (
                        <tr key={`${c.type}:${c.category}`}><td>{c.category}{c.type === 'tax' ? <span className="faint small"> · налоги</span> : ''}</td><td className="num">{money(c.amount)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty title="Расходов нет" />}
            </div>
            <div className="card flush">
              <div className="card-head"><h2>Выплаты по людям</h2></div>
              {report.byPerson.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Участник</th><th className="num">Выплачено</th><th className="num">Штрафы</th></tr></thead>
                    <tbody>
                      {report.byPerson.map((p) => (
                        <tr key={p.member_id}><td>{p.name}</td><td className="num">{money(p.paid)}</td><td className="num">{p.penalties ? `−${money(p.penalties)}` : '—'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty title="Выплат нет" />}
            </div>
          </div>
          <p className="faint small">
            Отчёт денежный: показывает, сколько денег пришло и ушло за период. Начисления команде и долги — на страницах проектов и в «Команде».
            В Excel — сводка и отдельный лист на каждый проект: выплаты команде, итерации с долями, таблицы по дням и журнал операций.
          </p>
        </>
      )}
    </div>
  );
}
