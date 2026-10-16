import test from "node:test";
import assert from "node:assert/strict";
import { copyCompletedUploadToR2 } from "./r2-upload-completion.js";
const entry = { id: "document", blob_pathname: "private/pdf", sha256: "a".repeat(64), size_bytes: 42 };
function database(result) {
  return { from(table) {
    assert.equal(table, "platform_document_intake");
    return { select() { return { eq(column, value) {
      assert.equal(column, "blob_pathname"); assert.equal(value, entry.blob_pathname);
      return { single: async () => result };
    } }; } };
  } };
}
test("completed production upload copies its saved record before completing", async () => {
  const db = database({ data: entry }); const source = async () => ({ ok: true });
  let called = false;
  const result = await copyCompletedUploadToR2(db, entry.blob_pathname, { name: "production" }, source,
    async (actualDb, actualEntry, actualSource) => {
      assert.equal(actualDb, db); assert.equal(actualEntry, entry); assert.equal(actualSource, source);
      called = true; return { outcome: "verified" };
    });
  assert.ok(called); assert.equal(result.outcome, "verified");
});
test("preview uploads never access production R2", async () => {
  await copyCompletedUploadToR2(null, "ignored", { name: "preview" }, null, () => assert.fail());
});
test("storage failure remains visible so the completion callback can retry", async () => {
  await assert.rejects(copyCompletedUploadToR2(database({ data: entry }), entry.blob_pathname,
    { name: "production" }, null, async () => { throw new Error("Storage unavailable"); }), /Storage unavailable/);
});
test("missing saved record cannot produce an untracked copy", async () => {
  await assert.rejects(copyCompletedUploadToR2(database({ data: null }), entry.blob_pathname,
    { name: "production" }, null, () => assert.fail()), /tracking unavailable/);
});
