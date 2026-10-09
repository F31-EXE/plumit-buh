import { useEffect, useRef, useState } from 'react';
import { Loading } from '../ui.jsx';

const MAX_PAGES = 50;

// Показ PDF страницами на canvas через pdf.js — работает и там, где браузер сам PDF не показывает (Chrome на Android).
// Библиотека загружается только при открытии PDF.
export default function PdfView({ blob }) {
  const box = useRef(null);
  const [state, setState] = useState({ loading: true, error: null, pages: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;
    let pdf;
    (async () => {
      try {
        const [pdfjs, worker] = await Promise.all([
          import('pdfjs-dist/build/pdf.min.mjs'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        // isEvalSupported: false — pdf.js не выполняет код из файла (защита от вредоносных PDF)
        pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
        const container = box.current;
        if (cancelled || !container) return;
        container.innerHTML = '';
        const width = container.clientWidth || 600;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const total = Math.min(pdf.numPages, MAX_PAGES);
        for (let n = 1; n <= total; n++) {
          const page = await pdf.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = 'pdf-page';
          container.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          setState({ loading: false, error: null, pages: n, total: pdf.numPages });
        }
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e, pages: 0, total: 0 });
      }
    })();
    return () => { cancelled = true; pdf?.destroy(); };
  }, [blob]);

  return (
    <div className="pdf-view">
      {state.loading && <Loading />}
      {state.error && <div className="empty"><strong>Не удалось показать PDF</strong>Скачайте файл, чтобы открыть его.</div>}
      <div ref={box} />
      {state.total > MAX_PAGES && <div className="faint small" style={{ textAlign: 'center', padding: 8 }}>Показаны первые {MAX_PAGES} страниц из {state.total} — полностью в скачанном файле.</div>}
    </div>
  );
}
