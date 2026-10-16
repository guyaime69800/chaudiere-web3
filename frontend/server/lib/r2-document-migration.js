import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { r2Configuration, r2Client, checkR2Access, copyVerifiedPdfToR2, signedR2Document } from "./r2-document-storage.js";

function migrationStore(env) {
  const url = env.UPSTASH_REDIS_REST_KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Migration lock unavailable");
  return new Redis({ url, token });
}

// Caller must verify production and either the founder's AAL2 session or the
// signed Blob completion webhook for an administratively authorized upload.
export async function migrateR2Document(db, entry, loadSource, deps = {}) {
  const env = deps.env || process.env;
  const store = deps.store || migrationStore(env);
  const lockKey = "carnetpass:r2:migration:production:lock";
  const operationId = randomUUID();
  if (!await store.set(lockKey, operationId, { nx: true, ex: 600 })) {
    throw Object.assign(new Error("Une copie R2 est déjà en cours."), { status: 409 });
  }
  let started = false;
  let client;
  let reason = "tracking_unavailable";
  try {
    const start = await db.from("platform_document_r2_attempts").insert({ id: operationId,
      document_id: entry.id, outcome: "started" });
    if (start.error) throw new Error("Tracking unavailable");
    started = true;
    const existing = await db.from("platform_document_r2_copies").select("sha256,size_bytes,object_key,verified_at")
      .eq("sha256", entry.sha256).maybeSingle();
    if (existing.error) throw new Error("Tracking unavailable");
    let copy;
    let outcome;
    if (existing.data) {
      if (existing.data.size_bytes !== entry.size_bytes) throw new Error("Tracking mismatch");
      copy = { ...existing.data, key: existing.data.object_key };
      outcome = "reused";
    } else {
      reason = "source_invalid";
      const source = await loadSource(entry);
      if (!source?.ok) throw new Error("Source unavailable");
      reason = "r2_unavailable";
      const configuration = r2Configuration(env, true);
      client = deps.client || r2Client(configuration);
      copy = await copyVerifiedPdfToR2(client, configuration.bucket, entry, source.bytes);
      reason = "tracking_unavailable";
      const saved = await db.from("platform_document_r2_copies").insert({ sha256: copy.sha256,
        size_bytes: copy.size_bytes, object_key: copy.key, verified_at: copy.verified_at });
      if (saved.error) throw new Error("Tracking unavailable");
      outcome = "verified";
    }
    const finish = await db.from("platform_document_r2_attempts").update({ outcome,
      finished_at: new Date().toISOString() }).eq("id", operationId);
    if (finish.error) throw new Error("Tracking unavailable");
    return { ok: true, operationId, outcome, bytes: copy.size_bytes };
  } catch {
    if (started) await db.from("platform_document_r2_attempts").update({ outcome: "failed", reason,
      finished_at: new Date().toISOString() }).eq("id", operationId).then(() => {}, () => {});
    throw Object.assign(new Error("Copie suspendue. Consultez le suivi R2 ; le PDF Blob est conservé."), { status: 503 });
  } finally {
    client?.destroy?.();
    // Compare the owner before releasing; never remove another execution's lock.
    await store.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
      [lockKey], [operationId]);
  }
}

export async function inspectR2(db, env = process.env) {
  const configuration = r2Configuration(env);
  const client = r2Client(configuration);
  try {
    await checkR2Access(client, configuration.bucket);
    const copies = await db.from("platform_document_r2_copies").select("sha256", { count: "exact", head: true });
    const attempts = await db.from("platform_document_r2_attempts").select("id,document_id,outcome,reason,started_at,finished_at")
      .order("started_at", { ascending: false }).limit(20);
    if (copies.error || attempts.error) throw new Error("Tracking unavailable");
    return { ok: true, readAccess: true, copies: copies.count, attempts: attempts.data };
  } finally { client.destroy(); }
}

export async function previewR2Document(db, entry, env = process.env) {
  const { data, error } = await db.from("platform_document_r2_copies")
    .select("sha256,size_bytes,object_key,verified_at").eq("sha256", entry.sha256).maybeSingle();
  if (error || !data) throw new Error("Verified copy unavailable");
  const configuration = r2Configuration(env);
  const client = r2Client(configuration);
  try { return await signedR2Document(client, configuration.bucket, entry, { ...data, key: data.object_key }); }
  finally { client.destroy(); }
}
