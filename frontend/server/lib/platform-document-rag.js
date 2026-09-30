import { createHash } from "node:crypto";
import { get } from "@vercel/blob";
import OpenAI from "openai";
// pdfjs utilise ce module comme worker intégré en Node ; l'import statique
// garantit sa présence dans le bundle de la fonction Vercel.
import "pdfjs-dist/legacy/build/pdf.worker.mjs";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 512;
const MAX_PAGES = 600;
const MAX_CHUNKS = 1800;

// PostgreSQL JSONB rejects NUL and malformed UTF-16 emitted by some PDF fonts.
export function cleanPdfText(value) {
  return String(value || "").replace(/\u0000/g, "").replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
}

// Compact vectors keep large manuals below the database statement timeout.
export function packEmbedding(values) {
  if (!Array.isArray(values) || !values.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding invalide.");
  }
  const scale = Math.max(...values.map(Math.abs)) / 127 || 1;
  const bytes = Buffer.from(values.map((value) => Math.round(value / scale) & 0xff));
  return { embeddingQ8: bytes.toString("base64"), embeddingScale: scale };
}

export function documentTypeFromTitle(title) {
  return /vue\s*eclat|vue\s*éclat|pi[eè]ces?\s+d[eé]tach|spare\s+parts|exploded/i.test(title || "")
    ? "exploded_view" : "installation_manual";
}

export function splitPageText(text, maxLength = 2800, overlap = 250) {
  const value = cleanPdfText(text).replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  if (!value) return [];
  const chunks = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(start + maxLength, value.length);
    if (end < value.length) {
      const boundary = Math.max(value.lastIndexOf("\n", end), value.lastIndexOf(" ", end));
      if (boundary > start + maxLength * 0.65) end = boundary;
    }
    chunks.push(value.slice(start, end).trim());
    if (end === value.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks.filter(Boolean);
}

export async function extractPdfItems(bytes, entry) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, disableFontFace: true });
  const pdf = await loadingTask.promise;
  try {
    if (pdf.numPages > MAX_PAGES) throw new Error(`PDF de ${pdf.numPages} pages : limite d'indexation de ${MAX_PAGES} pages.`);
    const items = [];
    let blankPages = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => `${item.str || ""}${item.hasEOL ? "\n" : " "}`).join("");
      if (pageText.trim().length < 30) blankPages += 1;
      for (const [index, text] of splitPageText(pageText, pdf.numPages > 200 ? 4000 : 2800).entries()) {
        items.push({
          chunkId: `${entry.id}-page-${pageNumber}-chunk-${index + 1}`,
          documentId: entry.title,
          documentType: documentTypeFromTitle(entry.title),
          page: pageNumber,
          section: `${entry.title} - page ${pageNumber}`,
          text,
        });
      }
      page.cleanup();
      if (items.length > MAX_CHUNKS) throw new Error(`PDF trop long : plus de ${MAX_CHUNKS} passages à indexer.`);
    }
    return { items, pageCount: pdf.numPages, blankPages };
  } finally {
    await loadingTask.destroy();
  }
}

export async function indexPlatformDocument(db, entry) {
  if (entry.rag_status === "indexing") {
    const started = Date.parse(entry.rag_started_at || "");
    if (!Number.isFinite(started) || Date.now() - started < 15 * 60 * 1000) return { status: "indexing" };
    const { error: resetError } = await db.from("platform_document_intake")
      .update({ rag_status: "failed", rag_error: "Indexation interrompue ; nouvel essai autorisé." })
      .eq("id", entry.id).eq("rag_status", "indexing").lt("rag_started_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());
    if (resetError) throw resetError;
  }
  const { data: claimed, error: claimError } = await db.from("platform_document_intake")
    .update({ rag_status: "indexing", rag_error: null, rag_started_at: new Date().toISOString() })
    .eq("id", entry.id).eq("status", "approved")
    .in("rag_status", ["pending", "failed", "needs_ocr"])
    .select("id").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { status: "indexing" };

  try {
    const stored = await get(entry.blob_pathname, { access: "private", useCache: false });
    if (!stored?.stream || stored.blob?.pathname !== entry.blob_pathname
      || stored.blob?.contentType !== "application/pdf" || stored.blob?.size !== entry.size_bytes) {
      throw new Error("PDF privé indisponible ou modifié.");
    }
    const parts = [];
    let size = 0;
    const hash = createHash("sha256");
    for await (const part of stored.stream) {
      const bytes = Buffer.from(part);
      size += bytes.length;
      if (size > entry.size_bytes) throw new Error("Taille du PDF incohérente.");
      parts.push(bytes); hash.update(bytes);
    }
    if (size !== entry.size_bytes || hash.digest("hex") !== entry.sha256) throw new Error("Empreinte du PDF incohérente.");
    const { items, pageCount, blankPages } = await extractPdfItems(Buffer.concat(parts), entry);
    if (!items.length || blankPages > pageCount * 0.8) {
      await db.from("platform_document_intake").update({ rag_status: "needs_ocr", rag_error: "PDF scanné ou texte insuffisant : OCR nécessaire.", rag_data: null })
        .eq("id", entry.id).eq("rag_status", "indexing");
      return { status: "needs_ocr" };
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    for (let offset = 0; offset < items.length; offset += 32) {
      const batch = items.slice(offset, offset + 32);
      const result = await openai.embeddings.create({ model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, input: batch.map((item) => item.text) });
      for (const value of result.data || []) Object.assign(batch[value.index], packEmbedding(value.embedding));
      if (batch.some((item) => !item.embeddingQ8)) throw new Error("Embedding incomplet.");
    }
    const { error } = await db.from("platform_document_intake").update({
      rag_status: "ready", rag_error: null, rag_indexed_at: new Date().toISOString(),
      rag_data: { model: EMBEDDING_MODEL, embeddingDimensions: EMBEDDING_DIMENSIONS, items },
    }).eq("id", entry.id).eq("rag_status", "indexing");
    if (error) throw error;
    return { status: "ready", pageCount, chunkCount: items.length };
  } catch (cause) {
    const message = String(cause?.message || "Indexation indisponible.").slice(0, 300);
    await db.from("platform_document_intake").update({ rag_status: "failed", rag_error: message, rag_data: null })
      .eq("id", entry.id).eq("rag_status", "indexing");
    return { status: "failed", error: message };
  }
}
