import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { copyVerifiedPdfToR2, signedR2Document, r2Configuration } from "../server/lib/r2-document-storage.js";

const bytes = Buffer.from("%PDF-1.7\nexample\n%%EOF");
const document = { size_bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
test("migration validates source before writing and verifies downloaded R2 bytes before producing a mapping", async () => {
  const calls = [];
  const client = { send: async command => {
    calls.push(command.constructor.name);
    return command.constructor.name === "PutObjectCommand" ? {} : {
      ContentLength: bytes.length, ContentType: "application/pdf", Body: Readable.from([bytes]) };
  } };
  await assert.rejects(copyVerifiedPdfToR2(client, "bucket", document, Buffer.from("invalid")));
  assert.deepEqual(calls, []);
  const copy = await copyVerifiedPdfToR2(client, "bucket", document, bytes);
  assert.deepEqual(calls, ["PutObjectCommand", "GetObjectCommand"]);
  assert.equal(copy.sha256, document.sha256);
  await assert.rejects(signedR2Document(client, "bucket", document, { ...copy, sha256: "b".repeat(64) }));
  let scope;
  await signedR2Document(client, "bucket", document, copy, async (_client, command, options) => {
    scope = { command, options }; return "https://example.invalid/signed";
  });
  assert.equal(scope.command.input.Key, copy.key);
  assert.equal(scope.options.expiresIn, 60);
});
test("uncertain or corrupt copy cannot produce a verified mapping", async () => {
  const client = { send: async command => command.constructor.name === "PutObjectCommand" ? {} : {
    ContentLength: bytes.length, ContentType: "application/pdf", Body: Readable.from([Buffer.alloc(bytes.length)]) } };
  await assert.rejects(copyVerifiedPdfToR2(client, "bucket", document, bytes), /integrity/);
});
test("migration never reuses the production read credentials and configuration requires EU endpoint", () => {
  const env = { R2_ENDPOINT: `https://${"a".repeat(32)}.eu.r2.cloudflarestorage.com`,
    R2_BUCKET_NAME: "carnetpass-documents-production", R2_ACCESS_KEY_ID: "read", R2_SECRET_ACCESS_KEY: "read-secret" };
  assert.equal(r2Configuration(env).credentials.accessKeyId, "read");
  assert.throws(() => r2Configuration(env, true), /missing/);
  assert.throws(() => r2Configuration({ ...env, R2_ENDPOINT: "https://attacker.invalid" }), /endpoint/);
});
