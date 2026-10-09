import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { useApp } from '../App.jsx';
import { addClientProject, removeClientProject } from '../lib/actions.js';
import { clientView } from '../lib/finance.js';
import { ErrorBox, Field, Icon, useToast } from '../ui.jsx';
import DocumentForm from './DocumentForm.jsx';
import DocumentList from './DocumentList.jsx';
import { ClientProject } from '../pages/Client.jsx';

// Вкладка проекта «Заказчик»: кто из заказчиков видит проект, документы для заказчика и предпросмотр его кабинета
export default function ClientTab({ p }) {
  const { data, isAdmin } = useApp();
  const toast = useToast();
  const [list, setList] = useState([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [docForm, setDocForm] = useState(null);
  const [preview, setPreview] = useState(false);
  const documents = data.documents.filter((d) => d.project_id === p.id);
  const view = useMemo(() => clientView(data, p.id), [data, p.id]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    return onSnapshot(query(collection(db, 'access'), where('project_ids', 'array-contains', p.id)), (snap) => {
      setList(snap.docs.map((d) => ({ email: d.id, ...d.data() })));
    }, setError);
  }, [p.id, isAdmin]);

  async function invite(e) {
    e.preventDefault();
    setError(null);
    try { await addClientProject(email, p.id, name || p.client); setEmail(''); setName(''); toast('Доступ заказчику выдан'); } catch (err) { setError(err); }
  }
  async function remove(u) {
    if (!confirm(`Закрыть ${u.email} доступ к проекту «${p.name}»?`)) return;
    try { await removeClientProject(u.email, p.id, u.project_ids); } catch (err) { setError(err); }
  }

  return (
    <div className="stack">
      {isAdmin && (
        <div className="card stack">
          <div>
            <h2>Кабинет заказчика</h2>
            <div className="faint small" style={{ marginTop: 4 }}>
              Заказчик входит по своему email и видит только свои проекты: пункты договора и их статус, оплаты, сколько осталось оплатить и документы ниже.
              Доли команды, выплаты, расходы и внутренние комментарии он не видит.
            </div>
          </div>
          {list.map((u) => (
            <div key={u.email} className="spread">
              <div className="grow" style={{ overflowWrap: 'anywhere' }}>
                <strong>{u.name || u.email}</strong>
                <div className="faint small">{u.name ? `${u.email} · ` : ''}проектов в доступе: {u.project_ids?.length || 0}</div>
              </div>
              <button type="button" className="btn sm ghost danger" onClick={() => remove(u)}>Закрыть доступ</button>
            </div>
          ))}
          <form className="form-grid" onSubmit={invite}>
            <Field label="Email заказчика"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="director@company.ru" /></Field>
            <Field label="Имя или компания"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={p.client || 'ООО «Компания»'} /></Field>
            <div className="full"><button className="btn primary">Выдать доступ к проекту</button></div>
          </form>
          <ErrorBox error={error} />
        </div>
      )}

      <div className="card flush">
        <div className="card-head">
          <h2>Документы для заказчика</h2>
          {isAdmin && <button type="button" className="btn sm primary" onClick={() => setDocForm({})}><Icon name="plus" />Документ</button>}
        </div>
        <DocumentList documents={documents} onEdit={isAdmin ? setDocForm : undefined} />
      </div>

      <div>
        <button type="button" className="btn" onClick={() => setPreview((v) => !v)}>{preview ? 'Скрыть' : 'Как это видит заказчик'}</button>
      </div>
      {preview && view && <div className="client-preview"><ClientProject view={view} documents={documents} /></div>}

      {docForm && <DocumentForm projectId={p.id} document={docForm.id ? docForm : null} onClose={() => setDocForm(null)} />}
    </div>
  );
}
