import { createHash } from "node:crypto";
import { isR2NativeDocument, loadR2Pdf } from "./r2-native-documents.js";

const maximumSizeInBytes = 30 * 1024 * 1024;

export async function verifyPlatformPdf(stored, entry) {
  if (!stored?.stream || stored.blob?.pathname !== entry.blob_pathname) {
    return { ok: false, reason: "missing" };
  }

  const hash = createHash("sha256");
  const chunks = [];
  let size = 0;
  let header = Buffer.alloc(0);
  for await (const chunk of stored.stream) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maximumSizeInBytes || size > entry.size_bytes) {
      return { ok: false, reason: "mismatch" };
    }
    chunks.push(bytes);
    hash.update(bytes);
    if (header.length < 1024) {
      header = Buffer.concat([header, bytes.subarray(0, 1024 - header.length)]);
    }
  }

  if (size !== entry.size_bytes || !header.toString("latin1").includes("%PDF-")
    || hash.digest("hex") !== entry.sha256) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, bytes: Buffer.concat(chunks, size) };
}

export async function loadPlatformPdf(entry, environment, getBlob, db) {
  if (isR2NativeDocument(entry)) {
    if (environment !== "production" || !db) return { ok: false, reason: "storage" };
    return loadR2Pdf(db, entry);
  }
  if (db && environment === "production" && process.env.CARNETPASS_R2_READ_ENABLED === "true") {
    const stored = await loadR2Pdf(db, entry);
    if (stored.ok) return stored;
  }
  const pathnames = [entry.blob_pathname];
  // Two PDFs transferred to Paris 2 were stored with a space before .pdf.
  if (environment === "production" && /^platform-documents\/[0-9a-f-]{36}\.pdf$/i.test(entry.blob_pathname)) {
    pathnames.push(entry.blob_pathname.replace(/\.pdf$/i, " .pdf"));
  }
  for (const pathname of pathnames) {
    const stored = await getBlob(pathname);
    if (!stored) continue;
    const verified = await verifyPlatformPdf(stored, { ...entry, blob_pathname: pathname });
    return { ...verified, pathname };
  }
  return { ok: false, reason: "missing" };
}
