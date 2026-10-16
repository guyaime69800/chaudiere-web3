import test from "node:test";
import assert from "node:assert/strict";
import { listAdminDocuments } from "./list-admin-documents.js";
test("loads older documents beyond the first 50 and 1000 without omission", async () => {
  const rows = Array.from({ length: 1203 }, (_, id) => ({ id }));
  const ranges = [];
  const client = { from: () => ({ select: () => {
    const query = { order: () => query, range: async (start, end) => {
      ranges.push([start, end]); return { data: rows.slice(start, end + 1), error: null };
    } }; return query;
  } }) };
  const result = await listAdminDocuments(client, "id");
  assert.deepEqual(result.data, rows);
  assert.equal(ranges.length, 5);
});
test("does not return an incomplete list when a later batch fails", async () => {
  const query = { order: () => query, range: async (start) => start === 0
    ? { data: Array.from({ length: 250 }, (_, id) => ({ id })) }
    : { error: { message: "unavailable" } } };
  const result = await listAdminDocuments({ from: () => ({ select: () => query }) }, "id");
  assert.equal(result.data, null);
  assert.ok(result.error);
});
