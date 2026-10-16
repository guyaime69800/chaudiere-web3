export const r2ReadEnabled = (env = process.env) => env.VERCEL_ENV === "production"
  && env.CARNETPASS_R2_READ_ENABLED === "true";

// Use only after the route has authorised the account and exact document.
// A missing mapping/configuration or unavailable R2 leaves the existing Blob path in use.
export async function tryR2Delivery(db, entry, env = process.env, dependencies = {}) {
  if (!r2ReadEnabled(env) && !(env.VERCEL_ENV === "production" && entry.blob_pathname?.startsWith("r2://"))) return null;
  let client;
  try {
    const { data, error } = await db.from("platform_document_r2_copies")
      .select("sha256,size_bytes,object_key,verified_at").eq("sha256", entry.sha256).maybeSingle();
    if (error || !data || data.sha256 !== entry.sha256 || data.size_bytes !== entry.size_bytes
      || !data.verified_at || data.object_key !== `platform-documents/sha256/${entry.sha256}.pdf`) return null;
    const storage = dependencies.storage || await import("./r2-document-storage.js");
    const configuration = storage.r2Configuration(env);
    client = storage.r2Client(configuration);
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const head = await client.send(new HeadObjectCommand({ Bucket: configuration.bucket, Key: data.object_key }),
      { abortSignal: AbortSignal.timeout(15_000) });
    if (head.ContentLength !== entry.size_bytes || head.ContentType !== "application/pdf"
      || head.Metadata?.sha256 !== entry.sha256) return null;
    return { ...await storage.signedR2Document(client, configuration.bucket, entry, { ...data, key: data.object_key }),
      sha256: entry.sha256, sizeBytes: entry.size_bytes };
  } catch { return null; }
  finally { client?.destroy?.(); }
}
