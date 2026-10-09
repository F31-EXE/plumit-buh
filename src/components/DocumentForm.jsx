import { useState } from 'react';
import { DOC_KINDS, FILE_ACCEPT, MAX_FILE_MB, deleteDocument, fileMime, saveDocument, uploadDocument } from '../lib/actions.js';
import { storage } from '../lib/firebase.js';
import { ErrorBox, Field, Modal, Segmented, useToast } from '../ui.jsx';

const STORAGE_ERRORS = {
  'storage/unauthorized': 'Нет прав на загрузку или такой тип файла не разрешён',
  'storage/canceled': 'Загрузка отменена',
  'storage/retry-limit-exceeded': 'Нет связи — попробуйте ещё раз',
  'storage/bucket-not-found': 'Хранилище файлов не создано — см. README, раздел «Документы-файлы»',
  'storage/project-not-found': 'Хранилище файлов не создано — см. README, раздел «Документы-файлы»',
};
const storageError = (e) => new Error(STORAGE_ERRORS[e?.code] || e?.message || 'Ошибка');

export default function DocumentForm({ memberId, document, onClose }) {
  const toast = useToast();
  const isFileDoc = Boolean(document?.storage_path);
  const [mode, setMode] = useState(document ? (isFileDoc ? 'file' : 'link') : (storage ? 'file' : 'link'));
  const [f, setF] = useState(() => ({
    title: document?.title || '', kind: document?.kind || 'contract', url: document?.url || '',
    date: document?.date || '', notes: document?.notes || '',
  }));
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  function pick(e) {
    const picked = e.target.files?.[0] || null;
    setError(null);
    if (picked && !fileMime(picked)) { setError(new Error('Такой тип файла не поддерживается. Подойдут PDF, Word, Excel, картинки, текст, архив')); return; }
    if (picked && picked.size > MAX_FILE_MB * 1024 * 1024) { setError(new Error(`Файл больше ${MAX_FILE_MB} МБ`)); return; }
    setFile(picked);
    if (picked && !f.title) setF((s) => ({ ...s, title: picked.name.replace(/\.[^.]+$/, '') }));
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      if (!document && mode === 'file') {
        if (!file) throw new Error('Выберите файл');
        setProgress(0);
        await uploadDocument({ ...f, member_id: memberId }, file, setProgress);
        toast('Файл загружен');
      } else {
        saveDocument(document?.id, { ...f, member_id: memberId });
        toast('Документ сохранён');
      }
      onClose();
    } catch (err) {
      setProgress(null);
      setError(err.code ? storageError(err) : err);
    }
  }

  async function remove() {
    if (!confirm(isFileDoc ? 'Удалить документ вместе с файлом?' : 'Удалить документ из списка? Сам файл на диске останется.')) return;
    try { await deleteDocument(document.id); toast('Документ удалён'); onClose(); } catch (err) { setError(storageError(err)); }
  }

  const uploading = progress !== null;
  return (
    <Modal
      title={document ? 'Документ' : 'Новый документ'}
      onClose={() => !uploading && onClose()}
      footer={(
        <>
          {document && <button type="button" className="btn danger left" onClick={remove}>Удалить</button>}
          <button type="button" className="btn" onClick={onClose} disabled={uploading}>Отмена</button>
          <button type="submit" form="doc-form" className="btn primary" disabled={uploading}>
            {uploading ? `Загрузка ${Math.round(progress * 100)}%` : 'Сохранить'}
          </button>
        </>
      )}
    >
      <form id="doc-form" className="stack" onSubmit={submit}>
        {!document && (
          <Segmented className="fit" value={mode} onChange={setMode} options={[['file', 'Файл'], ['link', 'Ссылка на диск']]} />
        )}
        <div className="form-grid">
          {mode === 'file' && !document && (
            <div className="field full">
              <span>Файл (до {MAX_FILE_MB} МБ: PDF, Word, Excel, картинки)</span>
              <label className="file-drop">
                <input type="file" accept={FILE_ACCEPT} onChange={pick} hidden disabled={uploading} />
                {file ? <><strong style={{ overflowWrap: 'anywhere' }}>{file.name}</strong><span className="faint small">{(file.size / 1024 / 1024).toFixed(2)} МБ · нажмите, чтобы выбрать другой</span></>
                  : <><strong>Выбрать файл</strong><span className="faint small">с компьютера или телефона</span></>}
              </label>
              {uploading && <div className="progress" style={{ marginTop: 8 }}><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
            </div>
          )}
          {document && isFileDoc && (
            <div className="field full"><span>Файл</span><div className="muted" style={{ overflowWrap: 'anywhere' }}>{document.file_name}</div></div>
          )}
          <Field label="Название" className="full"><input className="input" value={f.title} onChange={set('title')} required={mode !== 'file' || !!document} placeholder="Договор подряда №12" /></Field>
          <Field label="Тип">
            <select className="input" value={f.kind} onChange={set('kind')}>
              {Object.entries(DOC_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Дата"><input type="date" className="input" value={f.date} onChange={set('date')} /></Field>
          {mode === 'link' && !isFileDoc && (
            <Field label="Ссылка на файл" className="full">
              <input className="input" type="url" inputMode="url" value={f.url} onChange={set('url')} required placeholder="https://disk.yandex.ru/… или https://drive.google.com/…" />
            </Field>
          )}
          <Field label="Заметки" className="full"><input className="input" value={f.notes} onChange={set('notes')} /></Field>
        </div>
        {mode === 'link' && !isFileDoc && <div className="faint small">Откройте доступ по ссылке на диске, иначе сотрудник не сможет открыть файл.</div>}
        {mode === 'file' && !document && <div className="faint small">Файл увидит только этот сотрудник и администраторы.</div>}
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}
