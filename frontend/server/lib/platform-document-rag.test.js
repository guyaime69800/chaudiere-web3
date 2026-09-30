import test from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import { cleanPdfText, documentTypeFromTitle, extractPdfItems, splitPageText } from "./platform-document-rag.js";
import { searchRagContext } from "./rag.js";

test("identifies exploded views before indexing", () => {
  assert.equal(documentTypeFromTitle("Vue éclatée Airwell"), "exploded_view");
  assert.equal(documentTypeFromTitle("Notice d'installation"), "installation_manual");
});

test("chunks page text with overlap and no lost ending", () => {
  const text = Array.from({ length: 80 }, (_, index) => `ligne ${index}: référence ${index}`).join("\n");
  const chunks = splitPageText(text, 250, 30);
  assert.ok(chunks.length > 1);
  assert.ok(chunks[0].includes("référence 0"));
  assert.ok(chunks.at(-1).includes("référence 79"));
  assert.ok(chunks.every((chunk) => chunk.length <= 250));
});

test("removes PDF text characters rejected by PostgreSQL JSONB", () => {
  assert.equal(cleanPdfText("pompe\u0000 123\uD800 X\uDC00"), "pompe 123\uFFFD X\uFFFD");
  assert.equal(splitPageText("référence\u0000 456")[0], "référence 456");
});

test("keeps PDF page numbers in the indexed passages", async () => {
  const pdf = new jsPDF();
  pdf.text("Notice de montage et fonctionnement du circulateur", 15, 20);
  pdf.addPage();
  pdf.text("10153774 Chassis - reference de piece", 15, 20);
  const result = await extractPdfItems(Buffer.from(pdf.output("arraybuffer")), { id: "test", title: "Vue éclatée" });
  assert.equal(result.pageCount, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].page, 1);
  assert.equal(result.items[1].page, 2);
  assert.equal(result.items[1].documentType, "exploded_view");
});

test("Shiba's existing RAG can search a published exploded-view index", async () => {
  const rag = { model: "test-embedding", items: [{
    chunkId: "airwell-page-3-chunk-1", documentId: "Vue éclatée", documentType: "exploded_view",
    page: 3, section: "Vue éclatée - page 3", text: "10153774 Chassis - référence de pièce", embedding: [1, 0],
  }] };
  const openai = { embeddings: { create: async () => ({ data: [{ embedding: [1, 0] }] }) } };
  const result = await searchRagContext(openai, rag, "trouve la référence du chassis");
  assert.equal(result.topResults[0].page, 3);
  assert.equal(result.topResults[0].documentType, "exploded_view");
  assert.match(result.contextText, /Page : 3/);
});
