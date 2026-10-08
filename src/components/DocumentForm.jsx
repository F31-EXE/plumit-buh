import { useState } from 'react';
import { DOC_KINDS, deleteDocument, saveDocument } from '../lib/actions.js';
import { ErrorBox, Field, Modal, useToast } from '../ui.jsx';

export default function DocumentForm({ memberId, document, onClose }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({
    title: document?.title || '', kind: document?.kind || 'contract', url: document?.url || '',
    date: document?.date || '', notes: document?.notes || '',
  }));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  function submit(e) {
    e.preventDefault();
    try { saveDocument(document?.id, { ...f, member_id: memberId }); toast('Документ сохранён'); onClose(); } catch (err) { setError(err); }
  }

  return (
    <Modal
      title={document ? 'Документ' : 'Новый документ'}
      onClose={onClose}
      footer={(
        <>
          {document && <button type="button" className="btn danger left" onClick={() => { if (confirm('Удалить документ из списка? Сам файл на диске останется.')) { deleteDocument(document.id); onClose(); } }}>Удалить</button>}
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" form="doc-form" className="btn primary">Сохранить</button>
        </>
      )}
    >
      <form id="doc-form" className="stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Название" className="full"><input className="input" value={f.title} onChange={set('title')} required autoFocus={!document} placeholder="Договор подряда №12" /></Field>
          <Field label="Тип">
            <select className="input" value={f.kind} onChange={set('kind')}>
              {Object.entries(DOC_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Дата"><input type="date" className="input" value={f.date} onChange={set('date')} /></Field>
          <Field label="Ссылка на файл" className="full">
            <input className="input" type="url" inputMode="url" value={f.url} onChange={set('url')} required placeholder="https://disk.yandex.ru/… или https://drive.google.com/…" />
          </Field>
          <Field label="Заметки" className="full"><input className="input" value={f.notes} onChange={set('notes')} /></Field>
        </div>
        <div className="faint small">Откройте доступ по ссылке на диске, иначе сотрудник не сможет открыть файл.</div>
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}
