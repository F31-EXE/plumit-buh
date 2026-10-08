import { DOC_KINDS } from '../lib/actions.js';
import { dateLabel } from '../format.js';
import { Empty, Icon } from '../ui.jsx';

// Список документов. onEdit — только для администратора; ссылка открывается в новой вкладке.
export default function DocumentList({ documents, onEdit }) {
  if (!documents.length) return <Empty title="Документов пока нет">Договоры, акты и NDA появятся здесь.</Empty>;
  const sorted = [...documents].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_ms || 0) - (a.created_ms || 0));
  return (
    <div className="list">
      {sorted.map((d) => (
        <div key={d.id} className="list-item" style={{ cursor: 'default' }}>
          <span className="op-icon"><Icon name="doc" /></span>
          <div className="grow">
            <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{d.title}</div>
            <div className="faint small">{[DOC_KINDS[d.kind], d.date && dateLabel(d.date), d.notes].filter(Boolean).join(' · ')}</div>
          </div>
          <a className="btn sm" href={d.url} target="_blank" rel="noopener noreferrer"><Icon name="external" />Открыть</a>
          {onEdit && <button type="button" className="btn sm ghost icon" onClick={() => onEdit(d)} aria-label="Изменить"><Icon name="edit" /></button>}
        </div>
      ))}
    </div>
  );
}
