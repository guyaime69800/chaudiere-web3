import test from "node:test";
import assert from "node:assert/strict";
import { migrateR2Document } from "../server/lib/r2-document-migration.js";

const entry = { id: "document", sha256: "a".repeat(64), size_bytes: 10 };
const unlocked = () => ({ set: async () => true, eval: async () => 1 });
function database({ startError = false, existing = null } = {}) {
  const updates = [];
  return { updates, from: table => ({
    insert: async () => ({ error: startError ? { message: "missing table" } : null }),
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }),
    update: values => { updates.push({ table, values }); return { eq: async () => ({ error: null }) }; },
  }) };
}
test("an active migration prevents a second copy before database or storage access", async () => {
  let read = false;
  await assert.rejects(migrateR2Document({}, entry, async () => { read = true; }, {
    store: { set: async () => null }, env: {},
  }), cause => cause.status === 409);
  assert.equal(read, false);
});
test("missing tracking stops before reading the source or writing R2", async () => {
  let read = false;
  await assert.rejects(migrateR2Document(database({ startError: true }), entry, async () => { read = true; }, {
    store: unlocked(), env: {},
  }), cause => cause.status === 503);
  assert.equal(read, false);
});
test("source mismatch records a failed attempt, releases owned lock, and does not use R2", async () => {
  const db = database();
  let released = false;
  const store = { set: async () => true, eval: async (script, keys, args) => {
    released = script.includes("ARGV[1]") && keys.length === 1 && args.length === 1; return 1;
  } };
  await assert.rejects(migrateR2Document(db, entry, async () => ({ ok: false }), { store, env: {} }));
  assert.equal(db.updates[0].values.outcome, "failed");
  assert.equal(db.updates[0].values.reason, "source_invalid");
  assert.equal(released, true);
});
test("verified identical bytes reuse storage without changing the document, model associations or index", async () => {
  const db = database({ existing: { sha256: entry.sha256, size_bytes: 10,
    object_key: `platform-documents/sha256/${entry.sha256}.pdf`, verified_at: "2026-10-11" } });
  let read = false;
  const result = await migrateR2Document(db, entry, async () => { read = true; }, { store: unlocked(), env: {} });
  assert.equal(result.outcome, "reused");
  assert.equal(read, false);
  assert.equal(db.updates.every(update => update.table === "platform_document_r2_attempts"), true);
});
