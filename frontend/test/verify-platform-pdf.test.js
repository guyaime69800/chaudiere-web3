import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import test from "node:test";
import { verifyPlatformPdf } from "../server/lib/verify-platform-pdf.js";

const pathname = "platform-documents/example.pdf";
const pdf = Buffer.from("%PDF-1.7\nexample\n%%EOF\n");
const entry = {
  blob_pathname: pathname,
  size_bytes: pdf.length,
  sha256: createHash("sha256").update(pdf).digest("hex"),
};

function stored(bytes, metadata = {}) {
  return {
    blob: { pathname, size: 0, contentType: "application/octet-stream", ...metadata },
    stream: Readable.toWeb(Readable.from([bytes.subarray(0, 5), bytes.subarray(5)])),
  };
}

test("accepts exact PDF bytes even if Blob metadata is incomplete", async () => {
  const result = await verifyPlatformPdf(stored(pdf), entry);
  assert.equal(result.ok, true);
  assert.deepEqual(result.bytes, pdf);
});

test("rejects missing and modified PDF bytes", async () => {
  assert.deepEqual(await verifyPlatformPdf(null, entry), { ok: false, reason: "missing" });
  const changed = Buffer.from("%PDF-1.7\nchanged\n%%EOF\n");
  assert.equal((await verifyPlatformPdf(stored(changed), entry)).reason, "mismatch");
});
