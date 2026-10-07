import { useState } from 'react';
import { api } from '../api.js';
import { ITERATION_STATUS, money, today } from '../format.js';
import { ErrorBox, Field, Modal, MoneyInput, parseMoney, useToast } from '../ui.jsx';

export default function IterationForm({ project, iteration, onClose, onSaved }) {
  const toast = useToast();
  const prev = project.iterations.filter((it) => it.id !== iteration?.id && it.price > 0 && Object.keys(it.shares).length).at(-1);

  // Участники проекта + все, у кого уже есть доля в этой итерации
  const people = [...project.members];
  for (const t of project.summary.team) if (iteration?.shares[t.member_id] && !people.some((p) => p.id === t.member_id)) people.push({ id: t.member_id, name: t.name, role: t.role });

  const [f, setF] = useState(() => ({
    title: iteration?.title || '',
    price: iteration?.price ? String(iteration.price) : '',
    status: iteration?.status || 'planned',
    date: iteration?.date || '',
    notes: iteration?.notes || '',
    shares: Object.fromEntries(people.map((p) => [p.id, iteration?.shares[p.id] ? String(iteration.shares[p.id]) : ''])),
  }));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const setShare = (id) => (v) => setF((s) => ({ ...s, shares: { ...s.shares, [id]: v } }));

  const sharesTotal = Object.values(f.shares).reduce((a, v) => a + parseMoney(v), 0);
  const price = parseMoney(f.price);

  const copyPrev = () => setF((s) => ({ ...s, shares: Object.fromEntries(people.map((p) => [p.id, prev?.shares[p.id] ? String(prev.shares[p.id]) : ''])) }));
  const splitEven = () => {
    if (!people.length || !price) return;
    const each = Math.floor(price / people.length);
    setF((s) => ({ ...s, shares: Object.fromEntries(people.map((p) => [p.id, String(each)])) }));
  };

  async function submit(e) {
    e.preventDefault();
    const body = {
      ...f,
      price,
      date: f.date || (f.status === 'done' ? today() : ''),
      shares: Object.fromEntries(Object.entries(f.shares).map(([k, v]) => [k, parseMoney(v)])),
    };
    try {
      if (iteration) await api.put(`/iterations/${iteration.id}`, body);
      else await api.post(`/projects/${project.id}/iterations`, body);
      toast('Итерация сохранена');
      onSaved();
    } catch (err) { setError(err); }
  }

  async function remove() {
    if (!confirm('Удалить итерацию? Начисления по ней пропадут.')) return;
    try { await api.del(`/iterations/${iteration.id}`); onSaved(); } catch (err) { setError(err); }
  }

  return (
    <Modal
      wide
      title={iteration ? 'Итерация' : 'Новая итерация'}
      onClose={onClose}
      footer={(
        <>
          {iteration && <button type="button" className="btn danger left" onClick={remove}>Удалить</button>}
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" form="it-form" className="btn primary">Сохранить</button>
        </>
      )}
    >
      <form id="it-form" className="stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Что делаем" className="full">
            <textarea className="input" rows={2} value={f.title} onChange={set('title')} required autoFocus={!iteration} placeholder="Например: 5. Аватары пользователей" />
          </Field>
          <Field label="Стоимость для клиента, ₽"><MoneyInput value={f.price} onChange={set('price')} /></Field>
          <Field label="Статус">
            <select className="input" value={f.status} onChange={set('status')}>
              {Object.entries(ITERATION_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Дата сдачи"><input type="date" className="input" value={f.date} onChange={set('date')} /></Field>
        </div>

        <div className="card" style={{ padding: 16, boxShadow: 'none', background: 'var(--surface-2)' }}>
          <div className="spread" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            <h3>Кому сколько начисляем</h3>
            <div className="row">
              {prev && <button type="button" className="btn sm" onClick={copyPrev}>Как в прошлой</button>}
              <button type="button" className="btn sm" onClick={splitEven} disabled={!price}>Поровну</button>
            </div>
          </div>
          {people.length ? (
            <div className="form-grid">
              {people.map((p) => (
                <Field key={p.id} label={`${p.name}${p.role ? ` · ${p.role}` : ''}`}>
                  <MoneyInput value={f.shares[p.id] ?? ''} onChange={setShare(p.id)} />
                </Field>
              ))}
            </div>
          ) : <div className="faint small">Добавьте участников в настройках проекта.</div>}
          <div className="spread small" style={{ marginTop: 12 }}>
            <span className="muted">Команде: <strong className="num">{money(sharesTotal)}</strong></span>
            <span className={price - sharesTotal < 0 ? 'neg' : 'muted'}>Студии остаётся: <strong className="num">{money(price - sharesTotal)}</strong></span>
          </div>
        </div>
        <Field label="Заметки"><textarea className="input" value={f.notes} onChange={set('notes')} /></Field>
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}
