import { useMemo, useState } from 'react';
import { addOperation, deleteOperation, updateOperation } from '../lib/actions.js';
import { categories as listCategories } from '../lib/finance.js';
import { useApp } from '../App.jsx';
import { OP_TYPES, memberLabel, today } from '../format.js';
import { ErrorBox, Field, Modal, MoneyInput, Segmented, parseMoney, useToast } from '../ui.jsx';

const NEEDS_MEMBER = ['payout', 'penalty', 'transfer'];
const NEEDS_PROJECT = ['income', 'payout', 'penalty'];
const HAS_CATEGORY = ['expense', 'tax'];
const DEFAULT_CATEGORIES = { expense: ['Банк', 'Сервера', 'Сервисы', 'Реклама'], tax: ['УСН', 'Взносы', 'НДФЛ'] };

export default function OperationForm({ initial, onClose, onSaved }) {
  const { members, projects, data, me } = useApp();
  const toast = useToast();
  const editing = Boolean(initial.id);
  const [f, setF] = useState(() => ({
    type: 'income',
    date: today(),
    project_id: '',
    member_id: '',
    from_member_id: '',
    category: '',
    comment: '',
    is_advance: false,
    ...initial,
    amount: initial.amount ? String(initial.amount) : '',
  }));
  const [error, setError] = useState(null);
  const categories = useMemo(() => listCategories(data), [data]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }));

  // Сначала участники выбранного проекта, затем остальные
  const memberOptions = useMemo(() => {
    const project = projects.find((p) => String(p.id) === String(f.project_id));
    const inProject = new Set(project?.summary?.team?.map((t) => t.member_id) || []);
    const active = members.filter((m) => m.active || String(m.id) === String(f.member_id) || String(m.id) === String(f.from_member_id));
    return [...active.filter((m) => inProject.has(m.id)), ...active.filter((m) => !inProject.has(m.id))];
  }, [members, projects, f.project_id, f.member_id, f.from_member_id]);

  const catOptions = [...new Set([...(DEFAULT_CATEGORIES[f.type] || []), ...categories])];

  function submit(e) {
    e.preventDefault();
    setError(null);
    const body = {
      ...f,
      amount: parseMoney(f.amount),
      project_id: f.project_id || null,
      member_id: f.member_id || null,
      from_member_id: f.from_member_id || null,
    };
    try {
      if (editing) updateOperation(f.id, body);
      else addOperation(body, me.email);
      toast(editing ? 'Сохранено' : 'Операция добавлена');
      onSaved();
    } catch (err) {
      setError(err);
    }
  }

  function remove() {
    if (!confirm('Удалить операцию?')) return;
    try {
      deleteOperation(f.id);
      toast('Удалено');
      onSaved();
    } catch (err) { setError(err); }
  }

  return (
    <Modal
      title={editing ? 'Операция' : 'Новая операция'}
      onClose={onClose}
      footer={(
        <>
          {editing && <button type="button" className="btn danger left" onClick={remove}>Удалить</button>}
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" form="op-form" className="btn primary">Сохранить</button>
        </>
      )}
    >
      <form id="op-form" className="stack" onSubmit={submit}>
        <Segmented
          value={f.type}
          onChange={set('type')}
          options={Object.entries(OP_TYPES).map(([k, v]) => [k, v.short])}
        />
        <div className="faint small">{hintFor(f.type)}</div>

        <div className="form-grid">
          <Field label="Сумма, ₽" className="full">
            <MoneyInput big value={f.amount} onChange={set('amount')} autoFocus={!editing} required />
          </Field>
          <Field label="Дата">
            <input type="date" className="input" value={f.date} onChange={set('date')} required />
          </Field>
          <Field label={NEEDS_PROJECT.includes(f.type) ? 'Проект' : 'Проект (необязательно)'}>
            <select className="input" value={f.project_id ?? ''} onChange={set('project_id')} required={NEEDS_PROJECT.includes(f.type)}>
              <option value="">— Общие (без проекта) —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          {f.type === 'transfer' && (
            <Field label="От кого">
              <select className="input" value={f.from_member_id ?? ''} onChange={set('from_member_id')} required>
                <option value="">Выберите…</option>
                {memberOptions.map((m) => <option key={m.id} value={m.id}>{memberLabel(m)}</option>)}
              </select>
            </Field>
          )}
          {NEEDS_MEMBER.includes(f.type) && (
            <Field label={f.type === 'penalty' ? 'Кому штраф' : 'Кому'}>
              <select className="input" value={f.member_id ?? ''} onChange={set('member_id')} required>
                <option value="">Выберите…</option>
                {memberOptions.map((m) => <option key={m.id} value={m.id}>{memberLabel(m)}</option>)}
              </select>
            </Field>
          )}
          {HAS_CATEGORY.includes(f.type) && (
            <Field label="Статья">
              <input className="input" list="op-categories" value={f.category} onChange={set('category')} placeholder="Например, Сервера" />
              <datalist id="op-categories">{catOptions.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
          )}
          {f.type === 'income' && (
            <label className="check full"><input type="checkbox" checked={!!f.is_advance} onChange={set('is_advance')} />Это аванс</label>
          )}
          <Field label="Комментарий" className="full">
            <textarea className="input" rows={2} value={f.comment} onChange={set('comment')} placeholder="Например: с авансовых денег, лежат на ИП" />
          </Field>
        </div>
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}

function hintFor(type) {
  return {
    income: 'Деньги от клиента по проекту. Увеличивают кассу проекта.',
    payout: 'Выплата участнику команды. Уменьшает кассу и долг перед участником.',
    expense: 'Расходы студии: банк, сервера, сервисы. Можно без проекта.',
    tax: 'Налоги и страховые взносы.',
    penalty: 'Штраф уменьшает сумму, начисленную участнику. Касса не меняется.',
    transfer: 'Передача денег между людьми внутри команды (например, PM → PM). Касса и долги не меняются — запись для журнала.',
  }[type];
}
