import test from "node:test";
import assert from "node:assert/strict";
import { consultationDay, consultationLimit, reserveDocumentConsultation } from "../server/lib/document-consultation-quota.js";

function store() {
  const values = new Map();
  return { async eval(script, [counter, receipt], [limit]) {
    assert.match(script, /EXPIRE.*172800/);
    assert.match(script, /EX.*900/);
    const used = values.get(counter) || 0;
    if (values.has(receipt)) return [1, used];
    if (used >= limit) return [0, used];
    values.set(counter, used + 1); values.set(receipt, true);
    return [1, used + 1];
  } };
}
const professional = { companyId: "company", userId: "alice", accessKind: "discovery", plan: "free" };
const now = new Date("2026-10-12T08:00:00Z");
test("trial allows five openings, rejects the sixth, and separates users", async () => {
  const redis = store();
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => reserveDocumentConsultation(professional, "doc", String(i), { redis, now })));
  assert.equal(results.filter(x => x.allowed).length, 5);
  assert.equal(results[5].remaining, 0);
  assert.equal((await reserveDocumentConsultation({ ...professional, userId: "bob" }, "doc", "0", { redis, now })).allowed, true);
});
test("Pro allows twenty and the fallback shares only its document receipt", async () => {
  const redis = store(), pro = { ...professional, plan: "pro", accessKind: "verified" };
  for (let i = 0; i < 20; i++) assert.equal((await reserveDocumentConsultation(pro, "doc", String(i), { redis, now })).allowed, true);
  assert.equal((await reserveDocumentConsultation(pro, "doc", "0", { redis, now })).allowed, true);
  assert.equal((await reserveDocumentConsultation(pro, "other-doc", "0", { redis, now })).allowed, false);
  assert.equal((await reserveDocumentConsultation(pro, "doc", "new", { redis, now })).allowed, false);
});
test("Paris midnight resets, including summer and winter clock changes", async () => {
  assert.notEqual(consultationDay(new Date("2026-10-12T21:59:59Z")), consultationDay(new Date("2026-10-12T22:00:00Z")));
  assert.notEqual(consultationDay(new Date("2026-12-12T22:59:59Z")), consultationDay(new Date("2026-12-12T23:00:00Z")));
  const redis = store();
  for (let i = 0; i < 5; i++) await reserveDocumentConsultation(professional, "doc", String(i), { redis, now });
  assert.equal((await reserveDocumentConsultation(professional, "doc", "new", { redis, now: new Date("2026-10-12T22:00:00Z") })).allowed, true);
});
test("unknown plans and unavailable counters refuse access; founder test is exempt", async () => {
  assert.throws(() => consultationLimit("unknown"));
  await assert.rejects(reserveDocumentConsultation(professional, "doc", "x", { redis: { eval() { throw new Error("offline"); } }, now }), /offline/);
  assert.equal((await reserveDocumentConsultation({ ...professional, accessKind: "founder_test" }, "doc", "x")).enforced, false);
});
