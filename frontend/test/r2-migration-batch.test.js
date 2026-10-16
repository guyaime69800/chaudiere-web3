import test from "node:test";
import assert from "node:assert/strict";
import { runR2MigrationBatch } from "../src/services/r2MigrationBatch.js";

const entries = [1, 2, 3].map(id => ({ id: String(id), status: "approved", distribution_confirmed_at: "2026-10-11" }));
test("batch copies sequentially, excludes unpublished/rejected records and distinguishes reused bytes", async () => {
  let active = 0;
  const calls = [];
  const result = await runR2MigrationBatch([...entries, entries[0], { id: "private", status: "approved" },
    { id: "rejected", status: "rejected", distribution_confirmed_at: "date" }], { copy: async entry => {
    assert.equal(active++, 0); calls.push(entry.id); await new Promise(resolve => setTimeout(resolve, 1)); active--;
    return { ok: true, outcome: entry.id === "1" ? "reused" : "verified" };
  } });
  assert.deepEqual(calls, ["1", "2", "3"]);
  assert.equal(result.copied, 2); assert.equal(result.reused, 1); assert.equal(result.outcome, "completed");
});
test("first uncertain outcome stops without retry or subsequent downloads", async () => {
  const calls = [];
  const result = await runR2MigrationBatch(entries, { copy: async entry => {
    calls.push(entry.id); return entry.id === "1" ? { ok: true, outcome: "verified" } : { ok: true };
  } });
  assert.deepEqual(calls, ["1", "2"]);
  assert.equal(result.outcome, "failed"); assert.equal(result.processed, 1);
});
test("explicit stop finishes current PDF and prevents starting the next", async () => {
  let stopped = false;
  const result = await runR2MigrationBatch(entries, { stopped: () => stopped, copy: async () => {
    stopped = true; return { ok: true, outcome: "verified" };
  } });
  assert.equal(result.processed, 1); assert.equal(result.outcome, "stopped");
});
