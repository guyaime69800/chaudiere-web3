import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Configuration, r2Client, r2DocumentKey } from "./r2-document-storage.js";
import { readVerifiedR2Pdf, r2NativePathname } from "./r2-native-documents.js";

const ticketKey = (id) => `carnetpass:r2:upload:${id}`;
const maxSize = 30 * 1024 * 1024;
const failure = (status, message) => Object.assign(new Error(message), { status });
function storeFrom(env) {
  const url = env.UPSTASH_REDIS_REST_KV_REST_API_URL, token = env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
  if (!url || !token) throw failure(503, "Envoi R2 indisponible.");
  return new Redis({ url, token });
}
export function directUploadMetadata(body, userId) {
  const text = (key, min, max) => {
    const value = String(body[key] || "").trim();
    if (value.length < min || value.length > max) throw failure(400, "Renseignez le fabricant, le modèle, sa référence et le titre.");
    return value;
  };
  const metadata = { userId, manufacturer: text("manufacturer", 2, 120), modelName: text("modelName", 2, 160),
    modelReference: text("modelReference", 2, 160), title: text("title", 2, 200), filename: text("filename", 1, 255),
    hotlinePhone: String(body.hotlinePhone || "").trim(), sha256: body.sha256, size: body.size };
  if (!metadata.filename.toLowerCase().endsWith(".pdf") || !/^[a-f0-9]{64}$/.test(metadata.sha256 || "")
    || !Number.isInteger(metadata.size) || metadata.size < 5 || metadata.size > maxSize
    || (metadata.hotlinePhone && (!/^[+0-9(). -]{6,32}$/.test(metadata.hotlinePhone)
      || (metadata.hotlinePhone.match(/\d/g) || []).length < 6))) throw failure(400, "PDF ou métadonnées invalides.");
  const aliases = body.modelAliases || [];
  if (!Array.isArray(aliases) || aliases.length > 10 || aliases.some(value => typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 160)) {
    throw failure(400, "Références associées invalides.");
  }
  if (aliases.length) metadata.modelAliases = [...new Set(aliases.map(value => value.trim()))];
  return metadata;
}

// The route checks an administrative AAL2 session and production before either call.
export async function beginDirectR2Upload(body, userId, deps = {}) {
  const metadata = directUploadMetadata(body, userId), env = deps.env || process.env;
  if (env.VERCEL_ENV !== "production") throw failure(403, "Envoi R2 réservé à la production.");
  const store = deps.store || storeFrom(env), config = deps.configuration || r2Configuration(env, "upload");
  const id = randomUUID(), key = `platform-documents/incoming/${id}.pdf`;
  const client = deps.client || r2Client(config);
  try {
    const url = await (deps.signer || getSignedUrl)(client, new PutObjectCommand({ Bucket: config.bucket,
      Key: key, ContentType: "application/pdf", ContentLength: metadata.size }),
    { expiresIn: 600, signableHeaders: new Set(["content-type", "content-length"]) });
    await store.set(ticketKey(id), { ...metadata, id, key }, { ex: 3600 });
    return { ok: true, uploadId: id, url, headers: { "Content-Type": "application/pdf" } };
  } finally { client.destroy?.(); }
}

export async function completeDirectR2Upload(db, id, userId, deps = {}) {
  const env = deps.env || process.env;
  if (env.VERCEL_ENV !== "production") throw failure(403, "Envoi R2 réservé à la production.");
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)) throw failure(400, "Envoi invalide.");
  const store = deps.store || storeFrom(env);
  const ticket = await store.get(ticketKey(id));
  if (!ticket || ticket.userId !== userId || ticket.id !== id || ticket.key !== `platform-documents/incoming/${id}.pdf`) {
    throw failure(403, "Envoi expiré ou non autorisé.");
  }
  if (ticket.result) return ticket.result;
  const lockKey = ticketKey(id) + ":lock", owner = randomUUID();
  if (!await store.set(lockKey, owner, { nx: true, ex: 600 })) throw failure(409, "Vérification déjà en cours.");
  let client;
  try {
    const config = deps.configuration || r2Configuration(env, "upload");
    client = deps.client || r2Client(config);
    const entry = { id, size_bytes: ticket.size, sha256: ticket.sha256,
      blob_pathname: r2NativePathname(ticket.sha256, id) };
    const key = r2DocumentKey(ticket.sha256);
    const existing = await db.from("platform_document_r2_copies").select("sha256,size_bytes,object_key,verified_at")
      .eq("sha256", ticket.sha256).maybeSingle();
    if (existing.error) throw failure(503, "Suivi R2 indisponible.");
    const staged = await readVerifiedR2Pdf(client, config.bucket, ticket.key, entry);
    if (!staged.etag) throw failure(503, "Vérification R2 indisponible.");
    let reused = false;
    if (existing.data) {
      if (existing.data.object_key !== key || existing.data.size_bytes !== ticket.size || !existing.data.verified_at) {
        throw failure(503, "Suivi R2 incohérent.");
      }
      await readVerifiedR2Pdf(client, config.bucket, key, entry);
      reused = true;
    } else {
      // Copy inside R2, pinned to the exact object just verified. The browser's
      // PUT URL can never modify the permanent, content-addressed object.
      await client.send(new CopyObjectCommand({ Bucket: config.bucket, Key: key,
        CopySource: `${config.bucket}/${ticket.key}`, CopySourceIfMatch: staged.etag,
        MetadataDirective: "REPLACE", Metadata: { sha256: ticket.sha256 },
        ContentType: "application/pdf", CacheControl: "private, no-store" }),
      { abortSignal: AbortSignal.timeout(60_000) });
      const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
      if (head.ContentLength !== ticket.size || head.ContentType !== "application/pdf"
        || head.Metadata?.sha256 !== ticket.sha256 || head.ETag !== staged.etag) {
        throw failure(503, "Vérification R2 indisponible.");
      }
      const saved = await db.from("platform_document_r2_copies").upsert({ sha256: ticket.sha256,
        size_bytes: ticket.size, object_key: key, verified_at: new Date().toISOString() },
      { onConflict: "sha256", ignoreDuplicates: true });
      if (saved.error) throw failure(503, "Enregistrement R2 indisponible.");
    }
    const saved = await db.from("platform_document_intake").upsert({ id, uploaded_by: userId,
      manufacturer: ticket.manufacturer, model_name: ticket.modelName, model_reference: ticket.modelReference,
      title: ticket.title, original_filename: ticket.filename, hotline_phone: ticket.hotlinePhone || null,
      ...(ticket.modelAliases?.length ? { model_aliases: ticket.modelAliases } : {}),
      blob_pathname: entry.blob_pathname, size_bytes: ticket.size, sha256: ticket.sha256 },
    { onConflict: "blob_pathname", ignoreDuplicates: true });
    if (saved.error) throw failure(503, "Enregistrement du document indisponible. Réessayez la finalisation.");
    const attempt = await db.from("platform_document_r2_attempts").insert({ id: randomUUID(), document_id: id,
      outcome: reused ? "reused" : "verified", finished_at: new Date().toISOString() });
    if (attempt.error) throw failure(503, "Enregistrement du suivi indisponible. Réessayez la finalisation.");
    const result = { ok: true, documentId: id, pathname: entry.blob_pathname, provider: "r2", verified: true };
    await store.set(ticketKey(id), { ...ticket, result }, { ex: 3600 });
    // Only a temporary upload object is removed, after permanent verification.
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: ticket.key })).catch(() => {});
    return result;
  } finally {
    client?.destroy?.();
    await store.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
      [lockKey], [owner]);
  }
}
