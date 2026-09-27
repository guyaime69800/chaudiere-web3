import assert from "node:assert/strict";
import test from "node:test";

process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ||= "https://example.invalid";
process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ||= "test-only";

const { readShibaUsage, refundShibaQuestion, reserveShibaQuestion, shibaQuotaEnabled, shibaQuotaLimit } = await import("../server/lib/shiba-quota.js");

function fakeRedis() {
  const values = new Map();
  return {
    async get(key) { return values.get(key) || 0; },
    async eval(script, [key], args) {
      const used = values.get(key) || 0;
      if (script.includes("DECR")) {
        values.set(key, Math.max(0, used - 1));
        return values.get(key);
      }
      if (used >= args[0]) return [0, used];
      values.set(key, used + 1);
      return [1, used + 1];
    },
  };
}

const companyId = "company-one";
const alice = { companyId, userId: "alice" };
const bob = { companyId, userId: "bob" };

test("Découverte bloque la 21e question du mois, sans bloquer un autre technicien ni le mois suivant", async () => {
  const redis = fakeRedis();
  const march = new Date("2026-03-12T12:00:00Z");
  for (let index = 0; index < 20; index += 1) {
    assert.equal((await reserveShibaQuestion(alice, "free", { redis, now: march })).allowed, true);
  }
  const blocked = await reserveShibaQuestion(alice, "free", { redis, now: march });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal((await readShibaUsage(alice, "free", { redis, now: march })).used, 20);
  assert.equal((await reserveShibaQuestion(bob, "free", { redis, now: march })).allowed, true);
  assert.equal((await reserveShibaQuestion(alice, "free", { redis, now: new Date("2026-04-01T00:00:00Z") })).allowed, true);
});

test("Pro compte 200 questions par technicien et une tentative échouée peut être remboursée", async () => {
  const redis = fakeRedis();
  const now = new Date("2026-03-12T12:00:00Z");
  assert.equal(shibaQuotaLimit("pro"), 200);
  const reservation = await reserveShibaQuestion(alice, "pro", { redis, now });
  assert.equal(reservation.remaining, 199);
  await refundShibaQuestion(reservation, { redis });
  assert.equal((await readShibaUsage(alice, "pro", { redis, now })).used, 0);
  assert.deepEqual(await readShibaUsage(alice, "enterprise", { redis, now }), { enabled: false });
});

test("le contrôle mensuel ne s'active que dans une Preview Vercel", () => {
  const previous = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "preview";
    assert.equal(shibaQuotaEnabled(), true);
    process.env.VERCEL_ENV = "production";
    assert.equal(shibaQuotaEnabled(), false);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
