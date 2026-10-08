import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { handleUploadPresigned } from "@vercel/blob/client";
import handler from "../api/platform-admin-documents.js";

const response = () => ({ setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });

test("document API rejects anonymous uploads and unsigned callbacks even when maintenance passes them", async () => {
  const previous = { ...process.env };
  Object.assign(process.env, {
    VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", CARNETPASS_PRODUCTION_ADMIN_ENABLED: "true",
    CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF: "abcdefghijklmnopqrst",
    VITE_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "public",
    SUPABASE_SECRET_KEY: "secret", BLOB_WEBHOOK_PUBLIC_KEY: "test-key",
  });
  try {
    const read = response();
    await handler({ method: "GET", headers: {}, query: {} }, read);
    assert.equal(read.statusCode, 403);
    const upload = response();
    await handler({ method: "POST", headers: {}, body: { type: "blob.generate-presigned-url", payload: { clientPayload: "{}" } } }, upload);
    assert.equal(upload.statusCode, 403);
    const callback = response();
    await handler({ method: "POST", headers: {}, body: { type: "blob.upload-completed", payload: {} } }, callback);
    assert.equal(callback.statusCode, 400);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test("Blob completion requires a valid signature before recording an upload", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const webhookPublicKey = publicKey.export({ type: "spki", format: "pem" });
  const body = { type: "blob.upload-completed", payload: { blob: { pathname: "platform-documents/test.pdf" }, tokenPayload: "{}" } };
  let recorded = 0;
  const signature = sign(null, Buffer.from(JSON.stringify(body)), privateKey).toString("hex");
  const options = { body, webhookPublicKey, getSignedToken: async () => { throw new Error("Unexpected signing request"); }, onUploadCompleted: async () => { recorded++; } };
  await handleUploadPresigned({ ...options, request: { headers: { "x-vercel-signature": signature } } });
  assert.equal(recorded, 1);
  await assert.rejects(handleUploadPresigned({ ...options, body: { ...body, payload: {} }, request: { headers: { "x-vercel-signature": signature } } }), /Invalid callback signature/);
  await assert.rejects(handleUploadPresigned({ ...options, request: { headers: {} } }), /Missing callback signature/);
  assert.equal(recorded, 1);
});
