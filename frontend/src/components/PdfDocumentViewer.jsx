import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/build/pdf.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfDocumentViewer({ url, title }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(320);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = containerRef.current;
    const observer = new ResizeObserver(() => setWidth(Math.max(200, element.clientWidth - 24)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    const task = getDocument({ url });
    task.promise.then(document => {
      if (!active) return;
      const requested = Number(/(?:#|&)page=(\d+)/.exec(url)?.[1]) || 1;
      setPage(Math.min(document.numPages, Math.max(1, requested)));
      setPdf(document);
    }).catch(() => {
      if (active) {
        setError("Impossible d’afficher ce PDF ici. Utilisez « Ouvrir dans un nouvel onglet » ou « Télécharger le PDF ».");
        setBusy(false);
      }
    });
    return () => { active = false; void task.destroy().catch(() => {}); };
  }, [url]);

  useEffect(() => {
    if (!pdf) return;
    let active = true;
    let renderTask;
    async function render() {
      const pdfPage = await pdf.getPage(page);
      if (!active) return;
      setBusy(true);
      setError("");
      const natural = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: width / natural.width * zoom });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      renderTask = pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await renderTask.promise;
      if (active) setBusy(false);
    }
    render().catch(() => {
      if (active) { setError("Cette page n’a pas pu être affichée. Ouvrez le PDF dans un nouvel onglet."); setBusy(false); }
    });
    return () => { active = false; renderTask?.cancel(); };
  }, [pdf, page, width, zoom]);

  return <div className="pdf-document-viewer">
    <div className="pdf-document-viewer__toolbar" aria-label="Navigation du PDF">
      <button type="button" disabled={!pdf || page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Page précédente">←</button>
      <label>Page <input type="number" min="1" max={pdf?.numPages || 1} value={page} disabled={!pdf} onChange={e => {
        const value = Number(e.target.value);
        if (Number.isInteger(value) && value >= 1 && value <= pdf.numPages) setPage(value);
      }} /></label>
      <span>/ {pdf?.numPages || "…"}</span>
      <button type="button" disabled={!pdf || page >= pdf.numPages} onClick={() => setPage(p => p + 1)} aria-label="Page suivante">→</button>
      <button type="button" disabled={!pdf || zoom <= 1} onClick={() => setZoom(z => Math.max(1, z - 0.5))} aria-label="Réduire le zoom">−</button>
      <button type="button" disabled={!pdf || zoom >= 3} onClick={() => setZoom(z => Math.min(3, z + 0.5))} aria-label="Agrandir le PDF">+</button>
    </div>
    <div ref={containerRef} className="pdf-document-viewer__pages" aria-busy={busy}>
      {busy && <p role="status">Chargement de la page…</p>}
      {error && <p role="alert">{error}</p>}
      <canvas ref={canvasRef} hidden={!pdf || Boolean(error)} role="img" aria-label={`${title || "Document PDF"} — page ${page}`} />
    </div>
  </div>;
}
