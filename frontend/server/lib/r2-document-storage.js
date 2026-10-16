import { createHash } from "node:crypto";
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const shaPattern = /^[a-f0-9]{64}$/;
export function r2Configuration(env = process.env, migration = false) {
  const endpoint = env.R2_ENDPOINT;
  if (!/^https:\/\/[a-f0-9]{32}\.eu\.r2\.cloudflarestorage\.com$/.test(endpoint || "")) {
    throw new Error("R2 EU endpoint configuration invalid");
  }
  if (env.R2_BUCKET_NAME !== "carnetpass-documents-production") throw new Error("R2 bucket configuration invalid");
  if (migration === "upload" && Boolean(env.R2_UPLOAD_ACCESS_KEY_ID) !== Boolean(env.R2_UPLOAD_SECRET_ACCESS_KEY)) {
    throw new Error("R2 upload credentials incomplete");
  }
  const dedicatedUpload = migration === "upload" && env.R2_UPLOAD_ACCESS_KEY_ID;
  const accessKeyId = dedicatedUpload ? env.R2_UPLOAD_ACCESS_KEY_ID : migration ? env.R2_MIGRATION_ACCESS_KEY_ID : env.R2_ACCESS_KEY_ID;
  const secretAccessKey = dedicatedUpload ? env.R2_UPLOAD_SECRET_ACCESS_KEY : migration ? env.R2_MIGRATION_SECRET_ACCESS_KEY : env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) throw new Error("R2 credentials missing");
  return { endpoint, bucket: env.R2_BUCKET_NAME, credentials: { accessKeyId, secretAccessKey } };
}

export function r2Client(configuration) {
  return new S3Client({ endpoint: configuration.endpoint, region: "auto", forcePathStyle: true,
    credentials: configuration.credentials, maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
}

export function r2DocumentKey(sha256) {
  if (!shaPattern.test(sha256 || "")) throw new Error("Invalid PDF SHA256");
  return `platform-documents/sha256/${sha256}.pdf`;
}

export async function checkR2Access(client, bucket) {
  await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }), { abortSignal: AbortSignal.timeout(15_000) });
  return { ok: true, operation: "read_access" };
}

// Migration input must come from an authorised, verified Blob document.
// No deletion, no retry and no index generation. A failed verification returns no usable mapping.
export async function copyVerifiedPdfToR2(client, bucket, document, bytes) {
  const content = Buffer.from(bytes);
  const sha256 = createHash("sha256").update(content).digest("hex");
  if (content.length !== document.size_bytes || sha256 !== document.sha256
      || content.subarray(0, 5).toString() !== "%PDF-" || content.length > 30 * 1024 * 1024) {
    throw new Error("Source PDF integrity check failed");
  }
  const key = r2DocumentKey(sha256);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: content,
    ContentType: "application/pdf", CacheControl: "private, no-store", Metadata: { sha256 } }),
  { abortSignal: AbortSignal.timeout(60_000) });
  const stored = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }),
    { abortSignal: AbortSignal.timeout(60_000) });
  if (stored.ContentLength !== content.length || stored.ContentType !== "application/pdf" || !stored.Body) {
    stored.Body?.destroy?.();
    throw new Error("R2 PDF integrity check failed");
  }
  const digest = createHash("sha256");
  let size = 0;
  for await (const chunk of stored.Body) {
    size += chunk.length;
    if (size > content.length) { stored.Body.destroy?.(); throw new Error("R2 PDF integrity check failed"); }
    digest.update(chunk);
  }
  if (size !== content.length || digest.digest("hex") !== sha256) throw new Error("R2 PDF integrity check failed");
  return { key, sha256, size_bytes: size, verified_at: new Date().toISOString() };
}

export async function signedR2Document(client, bucket, document, copy, signer = getSignedUrl) {
  if (!copy?.verified_at || copy.sha256 !== document.sha256 || copy.size_bytes !== document.size_bytes
      || copy.key !== r2DocumentKey(document.sha256)) throw new Error("Unverified R2 copy");
  const url = await signer(client, new GetObjectCommand({ Bucket: bucket, Key: copy.key,
    ResponseContentType: "application/pdf", ResponseCacheControl: "private, no-store" }), { expiresIn: 60 });
  return { url, expiresAt: new Date(Date.now() + 60_000).toISOString(), provider: "r2" };
}
