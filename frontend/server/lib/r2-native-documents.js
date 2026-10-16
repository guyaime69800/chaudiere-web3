import { createHash } from "node:crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Configuration, r2Client, r2DocumentKey } from "./r2-document-storage.js";

const nativePattern = /^r2:\/\/platform-documents\/sha256\/([a-f0-9]{64})\.pdf#([a-f0-9-]{36})$/;
export const isR2NativeDocument = (entry) => String(entry?.blob_pathname || "").startsWith("r2://");
export function r2NativePathname(sha, id) {
  r2DocumentKey(sha);
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid document identity");
  return `r2://${r2DocumentKey(sha)}#${id}`;
}

export async function readVerifiedR2Pdf(client, bucket, key, entry) {
  const stored = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }),
    { abortSignal: AbortSignal.timeout(60_000) });
  if (stored.ContentLength !== entry.size_bytes || stored.ContentType !== "application/pdf" || !stored.Body) {
    stored.Body?.destroy?.(); throw new Error("Invalid R2 PDF metadata");
  }
  const hash = createHash("sha256"), parts = [];
  let size = 0;
  for await (const part of stored.Body) {
    size += part.length;
    if (size > entry.size_bytes || size > 30 * 1024 * 1024) {
      stored.Body.destroy?.(); throw new Error("Invalid R2 PDF size");
    }
    parts.push(Buffer.from(part)); hash.update(part);
  }
  const bytes = Buffer.concat(parts, size);
  if (size !== entry.size_bytes || hash.digest("hex") !== entry.sha256
    || bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Invalid R2 PDF integrity");
  return { bytes, etag: stored.ETag };
}

// Uses a mapping produced only after verification; native records never fall back to Blob.
export async function loadR2Pdf(db, entry, env = process.env, deps = {}) {
  if (env.VERCEL_ENV !== "production") return { ok: false, reason: "storage" };
  const native = isR2NativeDocument(entry);
  if (native && (!nativePattern.test(entry.blob_pathname)
    || entry.blob_pathname.match(nativePattern)[1] !== entry.sha256)) return { ok: false, reason: "mismatch" };
  let client;
  try {
    const { data, error } = await db.from("platform_document_r2_copies")
      .select("sha256,size_bytes,object_key,verified_at").eq("sha256", entry.sha256).maybeSingle();
    if (error || !data || !data.verified_at || data.size_bytes !== entry.size_bytes
      || data.sha256 !== entry.sha256 || data.object_key !== r2DocumentKey(entry.sha256)) return { ok: false, reason: "missing" };
    const config = deps.configuration || r2Configuration(env);
    client = deps.client || r2Client(config);
    const result = await readVerifiedR2Pdf(client, config.bucket, data.object_key, entry);
    return { ok: true, bytes: result.bytes, pathname: entry.blob_pathname, provider: "r2" };
  } catch { return { ok: false, reason: "storage" }; }
  finally { client?.destroy?.(); }
}
