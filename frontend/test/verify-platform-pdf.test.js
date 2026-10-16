import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import test from "node:test";
import { loadPlatformPdf, verifyPlatformPdf } from "../server/lib/verify-platform-pdf.js";

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

test("recovers a Production PDF stored with a space before .pdf only after checking its bytes", async () => {
  const canonical = "platform-documents/1070f959-e8e1-49f6-aaa5-7fe02b54c600.pdf";
  const spaced = canonical.replace(/\.pdf$/, " .pdf");
  const calls = [];
  const migrated = { ...entry, blob_pathname: canonical };
  const readBlob = async (candidate) => {
    calls.push(candidate);
    return candidate === spaced ? stored(pdf, { pathname: spaced }) : null;
  };
  const result = await loadPlatformPdf(migrated, "production", readBlob);
  assert.equal(result.ok, true);
  assert.equal(result.pathname, spaced);
  assert.deepEqual(calls, [canonical, spaced]);
  calls.length = 0;
  assert.equal((await loadPlatformPdf(migrated, "preview", readBlob)).reason, "missing");
  assert.deepEqual(calls, [canonical]);
});

test("does not accept a different PDF at the spaced Production pathname", async () => {
  const canonical = "platform-documents/1070f959-e8e1-49f6-aaa5-7fe02b54c600.pdf";
  const spaced = canonical.replace(/\.pdf$/, " .pdf");
  const altered = Buffer.from(pdf);
  altered[10] = altered[10] === 120 ? 121 : 120;
  const result = await loadPlatformPdf({ ...entry, blob_pathname: canonical }, "production",
    async (candidate) => candidate === spaced ? stored(altered, { pathname: spaced }) : null);
  assert.equal(result.reason, "mismatch");
});
