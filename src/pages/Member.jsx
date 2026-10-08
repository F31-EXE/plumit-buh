import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { useApp } from '../App.jsx';
import { memberStatement } from '../lib/finance.js';
import { grantAccess, revokeAccess } from '../lib/actions.js';
import { ITERATION_STATUS, PROJECT_STATUS, money } from '../format.js';
import { Avatar, Empty, ErrorBox, Field, Icon, Stat, useToast } from '../ui.jsx';
import DocumentForm from '../components/DocumentForm.jsx';
import DocumentList from '../components/DocumentList.jsx';
import { MemberForm } from './Team.jsx';

const R = (k) => k / 100;

export default function Member() {
  const { id } = useParams();
  const { data, isAdmin } = useApp();
  const [docForm, setDocForm] = useState(null);
  const [edit, setEdit] = useState(false);
  const member = data.members.find((m) => m.id === id);
  const st = useMemo(() => memberStatement(data, id), [data, id]);
  const documents = data.documents.filter((d) => d.member_id === id);

  if (!member || !st) return <Empty title="Участник не найден"><Link to="/team" className="btn sm" style={{ marginTop: 10 }}>К команде</Link></Empty>;

  return (
    <div className="stack">
      <div>
        <Link to="/team" className="back"><Icon name="left" width={16} />Команда</Link>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div className="row grow">
            <Avatar name={member.name} id={member.id} />
            <div className="grow"><h1>{member.name}</h1><div className="sub">{member.role}{member.active === false ? ' · неактивен' : ''}</div></div>
          </div>
          {isAdmin && <button type="button" className="btn icon" onClick={() => setEdit(true)} aria-label="Изменить"><Icon name="edit" /></button>}
        </div>
      </div>

      <div className="stats four">
        <Stat label="Начислено" value={R(st.totals.accrued)} />
        <Stat label="Штрафы" value={R(st.totals.penalties)} />
        <Stat label="Выплачено" value={R(st.totals.paid)} tone="pos" />
        <Stat accent label="Осталось выплатить" value={R(st.totals.due)} />
      </div>

      <StatementProjects statement={st} />

      <div className="card flush">
        <div className="card-head">
          <h2>Документы</h2>
          {isAdmin && <button type="button" className="btn sm primary" onClick={() => setDocForm({})}><Icon name="plus" />Документ</button>}
        </div>
        <DocumentList documents={documents} onEdit={isAdmin ? setDocForm : undefined} />
      </div>

      {isAdmin && <EmployeeAccess member={member} />}

      {docForm && <DocumentForm memberId={id} document={docForm.id ? docForm : null} onClose={() => setDocForm(null)} />}
      {edit && <MemberForm member={member} onClose={() => setEdit(false)} onSaved={() => setEdit(false)} />}
    </div>
  );
}

// Начисления по проектам и пунктам — общий блок для администратора и для кабинета сотрудника
export function StatementProjects({ statement }) {
  if (!statement.projects.length) return <div className="card"><Empty title="Проектов пока нет">Начисления появятся, когда участника добавят в итерации.</Empty></div>;
  return statement.projects.map((p) => (
    <div key={p.project_id} className="card flush">
      <div className="card-head">
        <div className="grow">
          <h2>{p.name}</h2>
          <div className="faint small">{PROJECT_STATUS[p.status]}</div>
        </div>
        <div className="right">
          <div className="faint small">Осталось</div>
          <strong className="num">{money(R(p.due))}</strong>
        </div>
      </div>
      <div className="row wrap small muted" style={{ padding: '0 20px 12px', gap: 16 }}>
        <span>Начислено: <strong className="num">{money(R(p.accrued))}</strong></span>
        {p.penalties > 0 && <span>Штрафы: <strong className="num neg">−{money(R(p.penalties))}</strong></span>}
        <span>Выплачено: <strong className="num">{money(R(p.paid))}</strong></span>
      </div>
      {p.items.length > 0 && (
        <div className="list">
          {p.items.map((it, i) => (
            <div key={i} className="list-item" style={{ cursor: 'default', alignItems: 'flex-start' }}>
              <div className="grow">
                <div style={{ overflowWrap: 'anywhere', opacity: it.status === 'cancelled' ? 0.55 : 1 }}>{it.title}</div>
                <span className={`badge ${it.status}`} style={{ marginTop: 6 }}>{ITERATION_STATUS[it.status]}</span>
              </div>
              <div className="op-amount">{money(R(it.amount))}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  ));
}

function EmployeeAccess({ member }) {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => onSnapshot(query(collection(db, 'access'), where('member_id', '==', member.id)), (snap) => {
    setList(snap.docs.map((d) => ({ email: d.id, ...d.data() })));
  }, setError), [member.id]);

  function invite(e) {
    e.preventDefault();
    setError(null);
    try { grantAccess(email, 'employee', member.name, member.id); setEmail(''); toast('Доступ выдан'); } catch (err) { setError(err); }
  }

  return (
    <div className="card stack">
      <div>
        <h2>Личный кабинет</h2>
        <div className="faint small" style={{ marginTop: 4 }}>
          Сотрудник входит по этому email и видит только свои начисления, выплаты и документы — без чужих сумм и проектов студии.
        </div>
      </div>
      {list.map((u) => (
        <div key={u.email} className="spread">
          <div className="grow" style={{ overflowWrap: 'anywhere' }}><strong>{u.email}</strong><div className="faint small">{u.role === 'employee' ? 'сотрудник' : u.role}</div></div>
          <button type="button" className="btn sm ghost danger" onClick={() => confirm(`Закрыть доступ для ${u.email}?`) && revokeAccess(u.email)}>Закрыть доступ</button>
        </div>
      ))}
      <form className="row wrap" onSubmit={invite}>
        <Field label="Email сотрудника" className="grow"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@mail.ru" /></Field>
        <button className="btn primary" style={{ alignSelf: 'flex-end' }}>Выдать доступ</button>
      </form>
      <ErrorBox error={error} />
    </div>
  );
}
