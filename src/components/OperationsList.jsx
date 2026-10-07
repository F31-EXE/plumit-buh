import { useApp } from '../App.jsx';
import { OP_TYPES, dateLabel, money } from '../format.js';
import { Empty, Icon, OP_ICON } from '../ui.jsx';

export default function OperationsList({ operations, showProject = true, emptyText = 'Операций пока нет' }) {
  const { openOperation } = useApp();
  if (!operations.length) return <Empty title={emptyText}>Нажмите «+», чтобы добавить поступление или выплату.</Empty>;

  const groups = [];
  for (const op of operations) {
    const last = groups[groups.length - 1];
    if (last?.date === op.date) last.items.push(op);
    else groups.push({ date: op.date, items: [op] });
  }

  return (
    <div className="list">
      {groups.map((g) => (
        <div key={g.date}>
          <div className="list-group">{dateLabel(g.date)}</div>
          {g.items.map((op) => {
            const t = OP_TYPES[op.type];
            return (
              <div key={op.id} className="list-item" onClick={() => openOperation(op)} role="button" tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && openOperation(op)}>
                <span className={`op-icon ${op.type}`}><Icon name={OP_ICON[op.type]} /></span>
                <div className="grow">
                  <div className="ellipsis" style={{ fontWeight: 700 }}>{title(op)}</div>
                  <div className="faint small ellipsis">
                    {[t.label, op.is_advance && 'аванс', showProject && op.project_name, op.comment].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className={`op-amount ${t.tone}`}>{t.sign}{money(op.amount)}</div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function title(op) {
  switch (op.type) {
    case 'income': return op.project_name ? `Оплата: ${op.project_name}` : 'Поступление';
    case 'payout': return op.member_name || 'Выплата';
    case 'penalty': return `Штраф: ${op.member_name || ''}`;
    case 'transfer': return `${op.from_member_name || '?'} → ${op.member_name || '?'}`;
    default: return op.category || OP_TYPES[op.type].label;
  }
}
