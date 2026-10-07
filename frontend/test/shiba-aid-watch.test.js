import test from "node:test";
import assert from "node:assert/strict";
import {
  watchOutcome,
  fetchOfficialSource,
  watchAidSources,
} from "../server/lib/aid-watch.js";
const url = "https://france-renov.gouv.fr/aides/cee";
test("failed consultation preserves the last successful date; differences are proposals only", () => {
  const old = { last_success_at: "2026-10-01T10:00:00Z", content_hash: "old" };
  assert.equal(
    watchOutcome(old, null, true).lastSuccessAt,
    old.last_success_at,
  );
  assert.equal(watchOutcome(old, { hash: "new" }).outcome, "changed");
  assert.equal(watchOutcome(old, { hash: "old" }).outcome, "unchanged");
});
test("watch refuses nonofficial targets, redirects, PDFs, oversized and unavailable sources", async () => {
  let called = 0;
  await assert.rejects(
    fetchOfficialSource("http://127.0.0.1", async () => {
      called++;
    }),
  );
  assert.equal(called, 0);
  await assert.rejects(
    fetchOfficialSource(url, async () => new Response("no", { status: 503 })),
  );
  await assert.rejects(
    fetchOfficialSource(
      url,
      async () =>
        new Response("pdf", { headers: { "Content-Type": "application/pdf" } }),
    ),
  );
  const r = await fetchOfficialSource(url, async (_u, options) => {
    assert.equal(options.redirect, "manual");
    return new Response(
      `<html><script>ignored</script><p>${"Official source readable content ".repeat(20)}</p></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  });
  assert.equal(r.text.includes("ignored"), false);
  assert.match(r.hash, /^[a-f0-9]{64}$/);
});
test("watch never updates a published rule and does not fake a successful date on error", async () => {
  const updates = [],
    inserts = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Unavailable");
  };
  try {
    const db = {
      from(table) {
        assert.ok(
          ["shiba_aid_sources", "shiba_aid_observations"].includes(table),
        );
        const q = {
          select() {
            return q;
          },
          order() {
            return q;
          },
          limit() {
            return Promise.resolve({
              data: [
                {
                  url,
                  last_success_at: "2026-10-01",
                  check_interval_days: 7,
                  content_hash: "old",
                },
              ],
              error: null,
            });
          },
          insert(data) {
            inserts.push(data);
            return Promise.resolve({ data: null, error: null });
          },
          update(data) {
            updates.push(data);
            return q;
          },
          eq() {
            return Promise.resolve({ data: null, error: null });
          },
        };
        return q;
      },
    };
    const r = await watchAidSources({
      force: true,
      db,
      redis: { set: async () => "OK", del: async () => {} },
    });
    assert.equal(r[0].outcome, "unavailable");
    assert.equal(Object.hasOwn(updates[0], "last_success_at"), false);
    assert.equal(inserts[0].previous_hash, "old");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
