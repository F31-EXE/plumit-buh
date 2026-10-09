import { useEffect, useState } from 'react';
import { getBlob, ref as storageRef } from 'firebase/storage';
import { storage } from '../lib/firebase.js';
import { DOC_KINDS } from '../lib/actions.js';
import { dateLabel } from '../format.js';
import { Empty, ErrorBox, Icon, Loading, Modal } from '../ui.jsx';
import PdfView from './PdfView.jsx';

const sizeLabel = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);

// Список документов. onEdit — только для администратора.
// Файлы из хранилища открываются внутри приложения (с проверкой прав), ссылки — в новой вкладке.
export default function DocumentList({ documents, onEdit }) {
  const [viewing, setViewing] = useState(null);
  if (!documents.length) return <Empty title="Документов пока нет">Договоры, акты и NDA появятся здесь.</Empty>;
  const sorted = [...documents].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_ms || 0) - (a.created_ms || 0));
  return (
    <>
      <div className="list">
        {sorted.map((d) => (
          <div key={d.id} className="list-item" style={{ cursor: 'default' }}>
            <span className="op-icon"><Icon name="doc" /></span>
            <div className="grow">
              <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{d.title}</div>
              <div className="faint small" style={{ overflowWrap: 'anywhere' }}>
                {[DOC_KINDS[d.kind], d.date && dateLabel(d.date), d.storage_path ? `${d.file_name} · ${sizeLabel(d.size || 0)}` : 'ссылка', d.notes].filter(Boolean).join(' · ')}
              </div>
            </div>
            {d.storage_path
              ? <button type="button" className="btn sm" onClick={() => setViewing(d)}><Icon name="doc" />Открыть</button>
              : <a className="btn sm" href={d.url} target="_blank" rel="noopener noreferrer"><Icon name="external" />Открыть</a>}
            {onEdit && <button type="button" className="btn sm ghost icon" onClick={() => onEdit(d)} aria-label="Изменить"><Icon name="edit" /></button>}
          </div>
        ))}
      </div>
      {viewing && <DocumentViewer document={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

// Просмотр файла: скачивается через Storage SDK с проверкой прав (без публичной ссылки).
// PDF и картинки показываются в приложении, остальные форматы — кнопкой «Скачать».
function DocumentViewer({ document: d, onClose }) {
  const [url, setUrl] = useState(null);
  const [blob, setBlob] = useState(null);
  const [error, setError] = useState(null);
  const previewable = /^application\/pdf$|^image\/(png|jpeg|gif|webp)$/.test(d.content_type || '');

  useEffect(() => {
    let objectUrl;
    let alive = true;
    getBlob(storageRef(storage, d.storage_path))
      .then((blob) => {
        // Тип задаём сами: показываем только PDF и картинки, всё остальное — как файл для скачивания
        const typed = new Blob([blob], { type: previewable ? d.content_type : 'application/octet-stream' });
        objectUrl = URL.createObjectURL(typed);
        if (alive) { setBlob(typed); setUrl(objectUrl); }
      })
      .catch((e) => alive && setError(new Error(e?.code === 'storage/unauthorized' ? 'Нет доступа к этому файлу' : e?.code === 'storage/object-not-found' ? 'Файл не найден' : 'Не удалось загрузить файл')));
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [d.storage_path, d.content_type, previewable]);

  return (
    <Modal
      wide
      title={d.title}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Закрыть</button>
          {url && <a className="btn primary" href={url} download={d.file_name}><Icon name="download" />Скачать</a>}
        </>
      )}
    >
      <ErrorBox error={error} />
      {!url && !error && <Loading />}
      {blob && previewable && d.content_type === 'application/pdf' && <PdfView blob={blob} />}
      {url && previewable && d.content_type.startsWith('image/') && <img className="doc-preview img" src={url} alt={d.title} />}
      {url && !previewable && <Empty title={d.file_name}>Предпросмотр для этого формата недоступен — скачайте файл.</Empty>}
    </Modal>
  );
}
