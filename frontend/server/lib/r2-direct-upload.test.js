import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { beginDirectR2Upload, completeDirectR2Upload } from "./r2-direct-upload.js";
import { loadR2Pdf, r2NativePathname } from "./r2-native-documents.js";
import { loadPlatformPdf } from "./verify-platform-pdf.js";
import { uploadDirectR2 } from "../../src/services/r2DirectUpload.js";
import { r2Client } from "./r2-document-storage.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bytes = Buffer.from("%PDF-1.7\nDirect R2 test\n%%EOF");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const metadata = { manufacturer: "Frisquet", modelName: "Gazliner", modelReference: "9702000", title: "Installation",
  filename: "notice.pdf", size: bytes.length, sha256 };
const user = "00000000-0000-4000-8000-000000000001";
const config = { bucket: "carnetpass-documents-production" };
test("actual presigned PUT binds size/type without signing an empty SDK checksum", async () => {
  const client = r2Client({ endpoint: "https://example.com", credentials: { accessKeyId: "test", secretAccessKey: "test" } });
  try {
    const url = new URL(await getSignedUrl(client, new PutObjectCommand({ Bucket: "test", Key: "incoming/pdf",
      ContentType: "application/pdf", ContentLength: bytes.length }),
    { expiresIn: 600, signableHeaders: new Set(["content-length", "content-type"]) }));
    assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "content-length;content-type;host");
    assert.equal(url.searchParams.has("x-amz-checksum-crc32"), false);
  } finally { client.destroy(); }
});
function fixture() {
  const values = new Map(), objects = new Map(), copies = new Map(), records = new Map(), attempts = [], calls = [];
  const store = { get: async key => values.get(key), set: async (key, value, options) => {
    if (options?.nx && values.has(key)) return null;
    values.set(key, value); return "OK";
  }, eval: async (_script, [key], [owner]) => { if (values.get(key) === owner) values.delete(key); } };
  const db = { from: table => ({ select: () => ({ eq: (_column, value) => ({ maybeSingle: async () => ({ data: copies.get(value) || null }) }) }),
    upsert: async value => {
      if (table === "platform_document_r2_copies") { if (!copies.has(value.sha256)) copies.set(value.sha256, value); }
      else if (table === "platform_document_intake") { if (!records.has(value.blob_pathname)) records.set(value.blob_pathname, value); }
      else assert.fail(`Unexpected table ${table}`);
      return {};
    }, insert: async value => { assert.equal(table, "platform_document_r2_attempts"); attempts.push(value); return {}; } }) };
  const client = { destroy() {}, send: async command => {
    calls.push(command.constructor.name);
    const input = command.input;
    if (command.constructor.name === "GetObjectCommand") {
      const object = objects.get(input.Key); if (!object) throw Error("Missing PDF");
      return { ContentLength: object.bytes.length, ContentType: "application/pdf", ETag: object.etag,
        Body: Readable.from([object.bytes]) };
    }
    if (command.constructor.name === "CopyObjectCommand") {
      const source = objects.get(input.CopySource.slice(config.bucket.length + 1));
      assert.equal(input.CopySourceIfMatch, source.etag);
      objects.set(input.Key, { ...source, metadata: input.Metadata }); return {};
    }
    if (command.constructor.name === "HeadObjectCommand") {
      const object = objects.get(input.Key);
      return { ContentLength: object.bytes.length, ContentType: "application/pdf", ETag: object.etag, Metadata: object.metadata };
    }
    if (command.constructor.name === "DeleteObjectCommand") { objects.delete(input.Key); return {}; }
    assert.fail(`Unexpected command ${command.constructor.name}`);
  } };
  const deps = { env: { VERCEL_ENV: "production" }, store, configuration: config, client,
    signer: async (_client, command, options) => {
      assert.equal(command.constructor.name, "PutObjectCommand");
      assert.equal(command.input.ContentLength, bytes.length);
      assert.ok(options.signableHeaders.has("content-type"));
      return "https://upload.test/";
    } };
  const start = async () => {
    const result = await beginDirectR2Upload(metadata, user, deps);
    objects.set(`platform-documents/incoming/${result.uploadId}.pdf`, { bytes, etag: '"verified-etag"' });
    return result;
  };
  return { values, objects, copies, records, attempts, calls, deps, db, start };
}

test("direct import becomes verified R2-only intake, reads without Blob, and finalization is idempotent", async () => {
  const f = fixture(), upload = await f.start();
  const result = await completeDirectR2Upload(f.db, upload.uploadId, user, f.deps);
  assert.equal(result.provider, "r2"); assert.equal(result.verified, true);
  const entry = [...f.records.values()][0];
  assert.equal(entry.uploaded_by, user); assert.equal(entry.model_reference, metadata.modelReference);
  assert.equal(entry.blob_pathname, r2NativePathname(sha256, upload.uploadId));
  assert.ok(!("status" in entry), "database keeps pending review default");
  assert.equal(f.attempts.length, 1);
  assert.equal(f.objects.has(`platform-documents/incoming/${upload.uploadId}.pdf`), false);
  assert.deepEqual(await completeDirectR2Upload(f.db, upload.uploadId, user, f.deps), result);
  assert.equal(f.records.size, 1); assert.equal(f.attempts.length, 1);
  const read = await loadR2Pdf(f.db, entry, f.deps.env, f.deps);
  assert.ok(read.ok); assert.deepEqual(read.bytes, bytes);
  assert.ok(!f.calls.includes("PutObjectCommand"), "permanent copy stays inside R2");
});

test("identical PDFs keep separate model records and reuse one permanent R2 object", async () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) {
    const upload = await f.start(); await completeDirectR2Upload(f.db, upload.uploadId, user, f.deps);
  }
  assert.equal(f.records.size, 2); assert.equal(f.copies.size, 1);
  assert.deepEqual(f.attempts.map(item => item.outcome), ["verified", "reused"]);
  assert.equal(f.calls.filter(name => name === "CopyObjectCommand").length, 1);
});

test("another user cannot finalize a ticket; corrupt PDF cannot be published or registered", async () => {
  const f = fixture(), upload = await f.start();
  await assert.rejects(completeDirectR2Upload(f.db, upload.uploadId, "other", f.deps), /non autoris/);
  assert.equal(f.calls.length, 0);
  f.objects.get(`platform-documents/incoming/${upload.uploadId}.pdf`).bytes = Buffer.alloc(bytes.length);
  await assert.rejects(completeDirectR2Upload(f.db, upload.uploadId, user, f.deps), /integrity/);
  assert.equal(f.records.size, 0); assert.equal(f.copies.size, 0);
});

test("native references never request Blob, even with missing DB or in Preview", async () => {
  const entry = { blob_pathname: r2NativePathname(sha256, user), sha256, size_bytes: bytes.length };
  const blob = () => assert.fail("Native PDF must not use Blob");
  assert.equal((await loadPlatformPdf(entry, "production", blob)).ok, false);
  assert.equal((await loadPlatformPdf(entry, "preview", blob, {})).ok, false);
});

test("invalid metadata and Preview cannot obtain a direct upload URL", async () => {
  const f = fixture();
  await assert.rejects(beginDirectR2Upload({ ...metadata, size: 40 * 1024 * 1024 }, user, f.deps));
  await assert.rejects(beginDirectR2Upload(metadata, user, { ...f.deps, env: { VERCEL_ENV: "preview" } }));
  assert.equal(f.values.size, 0);
});

test("browser sends PDF bytes only to R2, no auth token to storage and only JSON to Vercel", async () => {
  const id = user, requests = [], file = new File([bytes], "notice.pdf", { type: "application/pdf" });
  const fetcher = async (url, options) => {
    requests.push({ url: String(url), options });
    if (options.method === "PUT") return new Response("", { status: 200 });
    const body = JSON.parse(options.body);
    if (body.action === "r2-init") return Response.json({ uploadId: id,
      url: `https://521d9298e733d9b187f6eb2acb2e17de.eu.r2.cloudflarestorage.com/carnetpass-documents-production/platform-documents/incoming/${id}.pdf` });
    return Response.json({ provider: "r2", verified: true });
  };
  await uploadDirectR2(file, metadata, "private-token", () => {}, fetcher);
  assert.equal(requests.length, 3);
  assert.equal(requests[1].options.body, file);
  assert.equal(requests[1].options.headers.Authorization, undefined);
  assert.equal(requests[1].options.credentials, "omit");
  for (const request of [requests[0], requests[2]]) {
    assert.equal(request.url, "/api/platform-admin-documents");
    assert.equal(typeof request.options.body, "string");
    assert.ok(!request.options.body.includes("%PDF-"));
  }
});

test("browser never falls back to Blob after R2 rejects upload", async () => {
  const file = new File([bytes], "notice.pdf"), requests = [];
  const fetcher = async (url, options) => {
    requests.push(String(url));
    if (options.method === "PUT") return new Response("", { status: 403 });
    return Response.json({ uploadId: user,
      url: `https://521d9298e733d9b187f6eb2acb2e17de.eu.r2.cloudflarestorage.com/carnetpass-documents-production/platform-documents/incoming/${user}.pdf` });
  };
  await assert.rejects(uploadDirectR2(file, metadata, "token", () => {}, fetcher), /refus/);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(url => !url.includes("blob.vercel")));
});
