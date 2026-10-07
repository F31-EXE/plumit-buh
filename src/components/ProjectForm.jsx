import { useState } from 'react';
import { deleteProject, saveProject } from '../lib/actions.js';
import { useApp } from '../App.jsx';
import { PROJECT_STATUS, memberLabel } from '../format.js';
import { ErrorBox, Field, Modal, MoneyInput, parseMoney, useToast } from '../ui.jsx';

export default function ProjectForm({ project, onClose, onSaved }) {
  const { members } = useApp();
  const toast = useToast();
  const [f, setF] = useState(() => ({
    name: project?.name || '',
    client: project?.client || '',
    budget: project?.budget ? String(project.budget) : '',
    status: project?.status || 'active',
    start_date: project?.start_date || '',
    notes: project?.notes || '',
    members: project?.member_ids || [],
  }));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const toggle = (id) => setF((s) => ({ ...s, members: s.members.includes(id) ? s.members.filter((x) => x !== id) : [...s.members, id] }));

  function submit(e) {
    e.preventDefault();
    try {
      const id = saveProject(project?.id, { ...f, budget: parseMoney(f.budget) });
      toast(project ? 'Проект сохранён' : 'Проект создан');
      onSaved(id);
    } catch (err) { setError(err); }
  }

  function remove() {
    if (!confirm(`Удалить проект «${project.name}» вместе со всеми итерациями и операциями?`)) return;
    try { deleteProject(project.id); toast('Проект удалён'); onSaved(null); } catch (err) { setError(err); }
  }

  return (
    <Modal
      title={project ? 'Настройки проекта' : 'Новый проект'}
      onClose={onClose}
      footer={(
        <>
          {project && <button type="button" className="btn danger left" onClick={remove}>Удалить</button>}
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" form="project-form" className="btn primary">Сохранить</button>
        </>
      )}
    >
      <form id="project-form" className="stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Название" className="full"><input className="input" value={f.name} onChange={set('name')} required autoFocus={!project} /></Field>
          <Field label="Клиент"><input className="input" value={f.client} onChange={set('client')} /></Field>
          <Field label="Стоимость проекта, ₽"><MoneyInput value={f.budget} onChange={set('budget')} /></Field>
          <Field label="Статус">
            <select className="input" value={f.status} onChange={set('status')}>
              {Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Дата старта"><input type="date" className="input" value={f.start_date} onChange={set('start_date')} /></Field>
        </div>
        <div className="field">
          <span>Команда проекта</span>
          <div className="row wrap">
            {members.filter((m) => m.active || f.members.includes(m.id)).map((m) => (
              <button type="button" key={m.id} className={`btn sm ${f.members.includes(m.id) ? 'primary' : ''}`} onClick={() => toggle(m.id)}>{memberLabel(m)}</button>
            ))}
            {!members.length && <span className="faint small">Сначала добавьте людей в разделе «Команда».</span>}
          </div>
        </div>
        <Field label="Заметки"><textarea className="input" value={f.notes} onChange={set('notes')} /></Field>
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}
