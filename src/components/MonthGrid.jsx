import { useApp } from '../App.jsx';
import { daysInMonth, num } from '../format.js';

// Месячная таблица «как в Excel»: строки — статьи, столбцы — дни месяца.
export default function MonthGrid({ month, operations, members }) {
  const { openOperation } = useApp();
  const days = daysInMonth(month);
  const [y, m] = month.split('-').map(Number);
  const weekend = (d) => [0, 6].includes(new Date(y, m - 1, d).getDay());

  const ops = operations.filter((o) => o.date.startsWith(month));
  const rowFor = (match) => {
    const cells = Array.from({ length: days }, () => ({ sum: 0, ops: [] }));
    for (const o of ops) {
      if (!match(o)) continue;
      const c = cells[Number(o.date.slice(8, 10)) - 1];
      c.sum += o.amount;
      c.ops.push(o);
    }
    return cells;
  };

  const payoutMembers = new Map(members.map((mm) => [mm.id, mm.name]));
  for (const o of ops) if (o.type === 'payout' && o.member_id && !payoutMembers.has(o.member_id)) payoutMembers.set(o.member_id, o.member_name);

  const rows = [
    { section: 'Поступления' },
    { label: 'Поступления', kind: 'in', cells: rowFor((o) => o.type === 'income') },
    { section: 'Платежи' },
    ...[...payoutMembers].map(([id, name]) => ({ label: name, kind: 'out', cells: rowFor((o) => o.type === 'payout' && o.member_id === id) })),
    { label: 'Расходы', kind: 'out', cells: rowFor((o) => o.type === 'expense') },
    { label: 'Налоги / взносы', kind: 'out', cells: rowFor((o) => o.type === 'tax') },
  ];

  return (
    <div className="table-wrap">
      <table className="month-grid">
        <thead>
          <tr>
            <th className="sticky">Число</th>
            <th className="total">Всего</th>
            {Array.from({ length: days }, (_, i) => <th key={i} className={weekend(i + 1) ? 'we' : ''}>{i + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (r.section ? (
            <tr key={i} className="section"><td className="sticky">{r.section}</td><td colSpan={days + 1} /></tr>
          ) : (
            <tr key={i}>
              <td className="sticky">{r.label}</td>
              <td className="total">{num(r.cells.reduce((a, c) => a + c.sum, 0))}</td>
              {r.cells.map((c, d) => (c.sum ? (
                <td key={d} className={`has ${r.kind}`} title={c.ops.map((o) => `${num(o.amount)} ₽ ${o.comment || ''}`).join('\n')}
                  onClick={() => openOperation(c.ops[0])}>{num(c.sum)}</td>
              ) : <td key={d} className="zero">0</td>))}
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
}
