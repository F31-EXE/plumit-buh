import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { useApp } from '../App.jsx';
import { ENTITIES } from '../lib/audit.js';
import { ACCOUNT_OPS, CAPITALIZATION, DOC_KINDS } from '../lib/actions.js';
import { ITERATION_STATUS, OP_TYPES, PROJECT_STATUS, dateLabel } from '../format.js';
import { Empty, ErrorBox, Icon, Loading } from '../ui.jsx';

const PAGE = 100;
const VERB = { create: 'добавил', update: 'изменил', delete: 'удалил' };
const VERB_ACCESS = { create: 'выдал', update: 'изменил', delete: 'закрыл' };

const FIELDS = {
  amount: 'Сумма', date: 'Дата', type: 'Тип', member_id: 'Кому', from_member_id: 'От кого', project_id: 'Проект',
  category: 'Статья', comment: 'Комментарий', is_advance: 'Аванс', name: 'Название', role: 'Роль', active: 'Активен',
  client: 'Клиент', budget: 'Стоимость проекта', status: 'Статус', start_date: 'Дата старта', notes: 'Заметки',
  member_ids: 'Команда', title: 'Название', price: 'Стоимость', url: 'Ссылка', kind: 'Тип документа', rate: 'Ставка',
  bank: 'Банк', capitalization: 'Капитализация', opened: 'Открыт', archived: 'Закрыт', account_id: 'Счёт', sort: 'Порядок',
};
const MONEY = new Set(['amount', 'budget', 'price']);

// Человекочитаемое значение поля
function useFormatter() {
  const { data } = useApp();
  return useMemo(() => {
    const name = (col, id) => data[col].find((x) => x.id === id)?.name || (id ? 'удалён' : '—');
    const rub = (k) => `${(Number(k || 0) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
    return (entity, field, v) => {
      if (v === null || v === undefined || v === '') return '—';
      if (field.startsWith('shares.')) return rub(v);
      if (MONEY.has(field)) return rub(v);
      if (typeof v === 'boolean') return v ? 'да' : 'нет';
      if (field === 'member_id' || field === 'from_member_id') return name('members', v);
      if (field === 'project_id') return name('projects', v);
      if (field === 'account_id') return name('accounts', v);
      if (field === 'member_ids') return v.map((id) => name('members', id)).join(', ') || '—';
      if (field === 'status') return ITERATION_STATUS[v] || PROJECT_STATUS[v] || v;
      if (field === 'type') return (entity === 'account_op' ? ACCOUNT_OPS[v] : OP_TYPES[v]?.label) || v;
      if (field === 'kind') return DOC_KINDS[v] || v;
      if (field === 'capitalization') return CAPITALIZATION[v] || v;
      if (field === 'rate') return `${v} %`;
      if (/date|opened/.test(field) && /^\d{4}-\d{2}-\d{2}$/.test(v)) return dateLabel(v);
      return String(v);
    };
  }, [data]);
}

export default function Journal() {
  const { data } = useApp();
  const fmt = useFormatter();
  const [count, setCount] = useState(PAGE);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [entity, setEntity] = useState('');
  const [user, setUser] = useState('');

  useEffect(() => onSnapshot(
    query(collection(db, 'audit'), orderBy('at', 'desc'), limit(count)),
    (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))),
    setError,
  ), [count]);

  const users = useMemo(() => [...new Set((rows || []).map((r) => r.user))].sort(), [rows]);
  const shown = (rows || []).filter((r) => (!entity || r.entity === entity) && (!user || r.user === user));

  // Группировка по дням
  const groups = [];
  for (const r of shown) {
    const t = r.at?.toDate ? r.at.toDate() : new Date(r.at_ms);
    const day = t.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const last = groups.at(-1);
    if (last?.day === day) last.items.push({ ...r, t }); else groups.push({ day, items: [{ ...r, t }] });
  }
  const memberName = (id) => data.members.find((m) => m.id === id)?.name;

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="grow"><h1>Журнал изменений</h1><div className="sub">Кто, когда и что добавил, изменил или удалил</div></div>
      </div>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <select className="input sm" style={{ width: 'auto' }} value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">Все разделы</option>
          {Object.entries(ENTITIES).map(([k, v]) => <option key={k} value={k}>{v[0].toUpperCase() + v.slice(1)}</option>)}
        </select>
        <select className="input sm" style={{ width: 'auto', maxWidth: '100%' }} value={user} onChange={(e) => setUser(e.target.value)}>
          <option value="">Все пользователи</option>
          {users.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <ErrorBox error={error} />
      <div className="card flush">
        {!rows ? <Loading /> : !shown.length ? <Empty title="Записей пока нет">Здесь появится каждое изменение данных.</Empty> : (
          <div className="list">
            {groups.map((g) => (
              <div key={g.day}>
                <div className="list-group">{g.day}</div>
                {g.items.map((r) => (
                  <div key={r.id} className="list-item" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                    <span className={`op-icon ${r.action === 'delete' ? 'expense' : r.action === 'create' ? 'income' : 'payout'}`}>
                      <Icon name={r.action === 'delete' ? 'close' : r.action === 'create' ? 'plus' : 'edit'} />
                    </span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div style={{ overflowWrap: 'anywhere' }}>
                        <strong>{r.user.split('@')[0]}</strong>{' '}
                        {r.entity === 'import' ? 'выполнил импорт'
                          : r.entity === 'demo' ? (r.action === 'delete' ? 'удалил демо-данные' : 'загрузил демо-данные')
                            : `${(r.entity === 'access' ? VERB_ACCESS : VERB)[r.action]} ${ENTITIES[r.entity] || r.entity}`}
                      </div>
                      {r.label && <div className="muted small" style={{ overflowWrap: 'anywhere' }}>{r.label}</div>}
                      {r.changes?.length > 0 && (
                        <ul className="changes">
                          {r.changes.map((c, i) => (
                            <li key={i}>
                              <span className="faint">{c.field.startsWith('shares.') ? `Доля: ${memberName(c.field.slice(7)) || 'удалён'}` : c.field === 'archived' && r.entity === 'project' ? 'В архиве' : FIELDS[c.field] || c.field}:</span>{' '}
                              <s className="faint">{fmt(r.entity, c.field, c.from)}</s> → <strong>{fmt(r.entity, c.field, c.to)}</strong>
                            </li>
                          ))}
                        </ul>
                      )}
                      {r.action === 'delete' && r.snapshot && (
                        <details className="small faint" style={{ marginTop: 4 }}>
                          <summary>Что было удалено</summary>
                          <ul className="changes">
                            {Object.entries(r.snapshot).filter(([k]) => FIELDS[k] && !/created/.test(k)).map(([k, v]) => (
                              <li key={k}>{FIELDS[k]}: {fmt(r.entity, k, v)}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                    <div className="faint small num">{r.t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      {rows?.length >= count && <div><button type="button" className="btn" onClick={() => setCount((c) => c + PAGE)}>Показать ещё</button></div>}
    </div>
  );
}
