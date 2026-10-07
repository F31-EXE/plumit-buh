import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { money } from '../format.js';
import { Avatar, Empty, ErrorBox, Field, Icon, Modal, useToast } from '../ui.jsx';

export default function Team() {
  const { members, isAdmin, changed } = useApp();
  const [form, setForm] = useState(null);
  const totalDue = members.reduce((a, m) => a + m.balance.due, 0);

  return (
    <div>
      <div className="page-head">
        <div><h1>Команда</h1><div className="sub">Должны команде всего: <strong className="num">{money(totalDue)}</strong></div></div>
        {isAdmin && <button type="button" className="btn primary" onClick={() => setForm({})}><Icon name="plus" />Участник</button>}
      </div>
      <div className="card flush">
        {members.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Участник</th><th className="num">Начислено</th><th className="num hide-mobile">Штрафы</th><th className="num hide-mobile">Выплачено</th><th className="num">Осталось</th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className={`${isAdmin ? 'clickable' : ''} ${m.active ? '' : 'dim'}`} onClick={() => isAdmin && setForm(m)}>
                    <td><div className="row"><Avatar name={m.name} id={m.id} /><div><strong>{m.name}</strong><div className="faint small">{m.role}{m.active ? '' : ' · неактивен'}</div></div></div></td>
                    <td className="num">{money(m.balance.accrued)}</td>
                    <td className="num hide-mobile">{m.balance.penalties ? `−${money(m.balance.penalties)}` : '—'}</td>
                    <td className="num hide-mobile">{money(m.balance.paid)}</td>
                    <td className="num"><strong className={m.balance.due < 0 ? 'neg' : ''}>{money(m.balance.due)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="В команде пока никого">Добавьте PM, разработчиков и дизайнеров.</Empty>}
      </div>
      <p className="faint small">Начислено — сумма долей во всех итерациях (кроме отменённых). Отрицательный остаток — переплата.</p>
      {form && <MemberForm member={form.id ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); changed(); }} />}
    </div>
  );
}

function MemberForm({ member, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ name: member?.name || '', role: member?.role || '', active: member ? member.active : true });
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    try {
      if (member) await api.put(`/members/${member.id}`, f); else await api.post('/members', f);
      toast('Сохранено');
      onSaved();
    } catch (err) { setError(err); }
  }
  async function remove() {
    if (!confirm(`Удалить ${member.name}?`)) return;
    try { await api.del(`/members/${member.id}`); onSaved(); } catch (err) { setError(err); }
  }

  return (
    <Modal
      title={member ? member.name : 'Новый участник'}
      onClose={onClose}
      footer={(
        <>
          {member && <button type="button" className="btn danger left" onClick={remove}>Удалить</button>}
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" form="member-form" className="btn primary">Сохранить</button>
        </>
      )}
    >
      <form id="member-form" className="stack" onSubmit={submit}>
        <Field label="Имя"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoFocus={!member} /></Field>
        <Field label="Роль"><input className="input" list="roles" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="PM, Frontend, Backend…" /></Field>
        <datalist id="roles">{['PM', 'Frontend', 'Backend', 'Mobile', 'Design', 'QA', 'DevOps'].map((r) => <option key={r} value={r} />)}</datalist>
        {member && <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Активен (показывать в формах)</label>}
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}
