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

test("editing metadata preserves PDF passages and withdraws changed model identities", async () => {
  const previous = { ...process.env }, previousFetch = globalThis.fetch;
  Object.assign(process.env, { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", CARNETPASS_PRODUCTION_ADMIN_ENABLED: "true",
    CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF: "abcdefghijklmnopqrst", VITE_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: "public", SUPABASE_SECRET_KEY: "secret", BLOB_WEBHOOK_PUBLIC_KEY: "test" });
  const id = "00000000-0000-4000-8000-000000000001";
  const token = `header.${Buffer.from(JSON.stringify({ sub: id, aal: "aal2" })).toString("base64url")}.signature`;
  const current = { id, manufacturer: "Atlantic", model_reference: "023103", title: "Old notice", catalog_category: "heat_pump_indoor", status: "approved", rag_status: "ready", distribution_confirmed_at: "2026-10-08", rag_data: { items: [{ text: "Original PDF text", page: 12, embeddingQ8: "AQ==", embeddingScale: 0.1 }] } };
  let saved;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return Response.json({ id, email_confirmed_at: "2026-01-01", factors: [{ status: "verified" }] });
    if (url.includes("/platform_admins")) return Response.json({ role: "founder" });
    if (url.includes("/platform_document_intake")) {
      if (options.method === "PATCH") { saved = JSON.parse(options.body); return Response.json({ id }); }
      return Response.json(current);
    }
    throw Error("Unexpected request");
  };
  const edit = async (changes = {}) => {
    const res = response(); await handler({ method: "PATCH", headers: { authorization: `Bearer ${token}` }, body: { id, action: "edit", manufacturer: "Atlantic", modelReference: "023103", title: "New notice", category: "heat_pump_indoor", ...changes } }, res); return res;
  };
  try {
    const renamed = await edit(); assert.equal(renamed.statusCode, 200); assert.equal(renamed.body.withdrawn, false);
    assert.equal(saved.distribution_confirmed_at, current.distribution_confirmed_at);
    assert.equal(saved.rag_data.items[0].text, "Original PDF text"); assert.equal(saved.rag_data.items[0].page, 12); assert.equal(saved.rag_data.items[0].embeddingQ8, "AQ=="); assert.equal(saved.rag_data.items[0].documentId, "New notice");
    const changed = await edit({ modelReference: "023104" }); assert.equal(changed.body.withdrawn, true); assert.equal(saved.distribution_confirmed_at, null);
    current.rag_status = "indexing"; assert.equal((await edit()).statusCode, 409);
    assert.equal((await edit({ title: "" })).statusCode, 400);
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous);
  }
});
