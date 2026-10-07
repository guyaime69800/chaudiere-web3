import test from "node:test";
import assert from "node:assert/strict";
import { createDevisHandler } from "../server/shiba-devis.js";

const ticket = "10000000-0000-0000-0000-000000000001";
function fixture({
  owner = "alice",
  storedOwner = "alice",
  previous = null,
} = {}) {
  const calls = [];
  const db = {
    from(table) {
      const record = { table, filters: [] };
      calls.push(record);
      const query = {
        select() {
          return query;
        },
        eq(k, v) {
          record.filters.push([k, v]);
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        delete() {
          record.action = "delete";
          return query;
        },
        upsert(row, options) {
          record.action = "upsert";
          record.row = row;
          record.options = options;
          return query;
        },
        maybeSingle() {
          return Promise.resolve({ data: previous, error: null });
        },
        then(resolve, reject) {
          return Promise.resolve({
            data: record.action === "upsert" ? [{ id: ticket }] : [],
            error: null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const handler = createDevisHandler({
    database: () => db,
    identity: async () => ({ user: { id: owner }, db }),
    rate: async () => {},
    redis: () => ({
      get: async () => ({
        ownerId: storedOwner,
        companyId: null,
        result: { notice: "server snapshot", subtotal: 5000 },
      }),
    }),
  });
  const res = {
    code: 0,
    payload: null,
    setHeader() {},
    status(n) {
      this.code = n;
      return this;
    },
    json(v) {
      this.payload = v;
      return this;
    },
  };
  return { handler, calls, res };
}
test("simulation ticket belongs to the authenticated owner, before any insert", async () => {
  const { handler, calls, res } = fixture({ storedOwner: "bob" });
  await handler(
    { method: "POST", headers: {}, body: { action: "save", ticket } },
    res,
  );
  assert.equal(res.code, 409);
  assert.equal(calls.length, 0);
});
test("save persists the server snapshot and ignores a client supplied result", async () => {
  const { handler, calls, res } = fixture();
  await handler(
    {
      method: "POST",
      headers: {},
      body: {
        action: "save",
        ticket,
        result: { subtotal: 999999 },
        ownerId: "bob",
      },
    },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal(calls[0].row.owner_id, "alice");
  assert.equal(calls[0].row.snapshot.subtotal, 5000);
  assert.deepEqual(calls[0].options, {
    onConflict: "id",
    ignoreDuplicates: true,
  });
});
test("recalculation cannot link to another owner snapshot", async () => {
  const { handler, calls, res } = fixture();
  await handler(
    {
      method: "POST",
      headers: {},
      body: { action: "save", ticket, previousId: ticket },
    },
    res,
  );
  assert.equal(res.code, 403);
  assert.deepEqual(calls[0].filters, [
    ["id", ticket],
    ["owner_id", "alice"],
  ]);
  assert.equal(calls.length, 1);
});
test("history and deletion always carry the server owner filter", async () => {
  for (const method of ["GET", "DELETE"]) {
    const { handler, calls, res } = fixture();
    await handler({ method, headers: {}, query: { id: ticket } }, res);
    assert.equal(res.code, 200);
    assert.ok(
      calls[0].filters.some(([k, v]) => k === "owner_id" && v === "alice"),
    );
  }
});
