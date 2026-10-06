import assert from "node:assert/strict";
import test from "node:test";

process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ||= "https://example.invalid";
process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ||= "test-only";

const { discoveryDocumentsQuotaAvailable, grantShibaRecharge, readShibaUsage, refundShibaQuestion, reserveShibaQuestion, shibaQuotaEnabled, shibaQuotaLimit, shibaQuotaRequiresAccount } = await import("../server/lib/shiba-quota.js");
const { formatShibaResetDate, shibaCreditsExhaustedMessage } = await import("../src/lib/shiba-credit-copy.js");

function fakeRedis() {
  const values = new Map();
  return {
    values,
    async get(key) { return values.get(key) ?? null; },
    async eval(script, [key, legacyKey, legacyMonthlyKey, bonusKey], args) {
      if (script.includes("INCRBY")) {
        if (values.has(legacyKey)) return [0, values.get(key) || 0];
        const balance = (values.get(key) || 0) + args[0];
        values.set(key, balance);
        values.set(legacyKey, 1);
        return [1, balance];
      }
      if (script.includes("ARGV[1] == 'bonus'")) {
        const target = args[0] === "bonus" ? legacyKey : key;
        const balance = Math.max(0, (values.get(target) || 0) + (args[0] === "bonus" ? 1 : -1));
        values.set(target, balance);
        return balance;
      }
      const used = Math.max(values.get(key) || 0, values.get(legacyKey) || 0, values.get(legacyMonthlyKey) || 0);
      values.set(key, used);
      const bonus = values.get(bonusKey) || 0;
      if (used >= args[0]) {
        if (args[2] === 0) return [0, used, bonus, 0];
        if (bonus <= 0) return [0, used, bonus, 0];
        values.set(bonusKey, bonus - 1);
        return [1, used, bonus - 1, 1];
      }
      values.set(key, used + 1);
      return [1, used + 1, bonus, 0];
    },
  };
}

const companyId = "company-one";
const alice = { companyId, userId: "alice", discoveryStartsAt: "2026-09-27T12:00:00.000Z", discoveryEndsAt: "2026-10-02T12:00:00.000Z" };
const bob = { companyId, userId: "bob", discoveryStartsAt: "2026-09-27T12:00:00.000Z", discoveryEndsAt: "2026-10-02T12:00:00.000Z" };

test("Découverte bloque la 21e question même si l’essai traverse un changement de mois", async () => {
  const redis = fakeRedis();
  const september = new Date("2026-09-27T12:00:00Z");
  for (let index = 0; index < 20; index += 1) {
    assert.equal((await reserveShibaQuestion(alice, "free", { redis, now: september })).allowed, true);
  }
  const blocked = await reserveShibaQuestion(alice, "free", { redis, now: new Date("2026-10-01T00:00:00Z") });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal((await readShibaUsage(alice, "free", { redis, now: september })).used, 20);
  redis.values.set(`carnetpass:shiba:bonus:v1:${companyId}:alice`, 10);
  assert.equal((await readShibaUsage(alice, "free", { redis, now: september })).remaining, 0);
  const withBonus = await reserveShibaQuestion(alice, "free", { redis, now: september });
  assert.equal(withBonus.allowed, false);
  assert.equal(withBonus.remaining, 0);
  assert.equal((await reserveShibaQuestion(bob, "free", { redis, now: september })).allowed, false);
  assert.equal(await discoveryDocumentsQuotaAvailable({ ...bob, accessKind: "discovery" }, { redis, now: september }), false);
  assert.equal(blocked.period, "trial");
});

test("un quota mensuel déjà consommé reste consommé pendant l’essai", async () => {
  const redis = fakeRedis();
  const now = new Date("2026-09-27T12:00:00Z");
  redis.values.set(`carnetpass:shiba:monthly:v1:${companyId}:alice:2026-09`, 20);
  assert.equal((await readShibaUsage(alice, "free", { redis, now })).remaining, 0);
  assert.equal((await reserveShibaQuestion(alice, "free", { redis, now })).allowed, false);
  assert.equal((await readShibaUsage(alice, "free", { redis, now: new Date("2026-10-01T00:00:00Z") })).remaining, 0);
});

test("les anciens compteurs individuels sont repris dans le quota commun Découverte", async () => {
  const redis = fakeRedis();
  const now = new Date("2026-09-28T12:00:00Z");
  const trialEnd = Date.parse(alice.discoveryEndsAt);
  redis.values.set(`carnetpass:shiba:trial:v1:${companyId}:alice:${trialEnd}`, 19);
  assert.equal((await readShibaUsage(alice, "free", { redis, now })).used, 19);
  assert.equal((await reserveShibaQuestion(alice, "free", { redis, now })).used, 20);
  assert.equal((await readShibaUsage(bob, "free", { redis, now })).used, 20);
  assert.equal(await discoveryDocumentsQuotaAvailable({ ...bob, accessKind: "discovery" }, { redis, now }), false);
  assert.equal(await discoveryDocumentsQuotaAvailable({ ...bob, accessKind: "verified" }, { redis, now }), true);
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

test("le quota Production s'active pour Découverte seulement", () => {
  const previous = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "preview";
    assert.equal(shibaQuotaEnabled(), true);
    process.env.VERCEL_ENV = "production";
    assert.equal(shibaQuotaEnabled(), false);
    assert.equal(shibaQuotaEnabled("free"), true);
    assert.equal(shibaQuotaEnabled("pro"), false);
    assert.equal(shibaQuotaEnabled("enterprise"), false);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});

test("l'assistant public Production fonctionne sans Bearer, les questions pro utilisent le quota", () => {
  assert.equal(shibaQuotaRequiresAccount({ headers: {} }, "production"), false);
  assert.equal(shibaQuotaRequiresAccount({ headers: { authorization: "Bearer essai" } }, "production"), true);
  assert.equal(shibaQuotaRequiresAccount({ headers: {} }, "preview"), true);
});

test("le quota Pro passe à la nouvelle période une seule fois à minuit UTC", async () => {
  const redis = fakeRedis();
  const october = new Date("2026-10-31T23:59:59.000Z");
  for (let index = 0; index < 200; index += 1) {
    assert.equal((await reserveShibaQuestion(alice, "pro", { redis, now: october })).allowed, true);
  }
  const blocked = await reserveShibaQuestion(alice, "pro", { redis, now: october });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.resetAt, "2026-11-01T00:00:00.000Z");

  const november = new Date("2026-11-01T00:00:00.000Z");
  assert.equal((await readShibaUsage(alice, "pro", { redis, now: november })).used, 0);
  assert.equal((await reserveShibaQuestion(alice, "pro", { redis, now: november })).used, 1);
  assert.equal((await readShibaUsage(alice, "pro", { redis, now: november })).used, 1);
  assert.equal((await reserveShibaQuestion(alice, "pro", { redis, now: november })).used, 2);
  assert.equal((await readShibaUsage(bob, "pro", { redis, now: november })).used, 0);
});

test("une recharge payée s'ajoute une seule fois, persiste au changement de mois et rembourse un échec", async () => {
  const redis = fakeRedis();
  const october = new Date("2026-10-31T23:59:59.000Z");
  for (let index = 0; index < 200; index += 1) await reserveShibaQuestion(alice, "pro", { redis, now: october });
  assert.equal((await readShibaUsage(alice, "pro", { redis, now: october })).remaining, 0);
  assert.deepEqual(await grantShibaRecharge(alice, 100, "cs_test_first", { redis }), { granted: true, bonusRemaining: 100 });
  assert.deepEqual(await grantShibaRecharge(alice, 100, "cs_test_first", { redis }), { granted: false, bonusRemaining: 100 });
  const reservation = await reserveShibaQuestion(alice, "pro", { redis, now: october });
  assert.equal(reservation.bonusSource, true);
  assert.equal(reservation.remaining, 99);
  await refundShibaQuestion(reservation, { redis });
  assert.equal((await readShibaUsage(alice, "pro", { redis, now: october })).bonusRemaining, 100);
  assert.deepEqual(await grantShibaRecharge(alice, 200, "cs_test_second", { redis }), { granted: true, bonusRemaining: 300 });
  const november = new Date("2026-11-01T00:00:00.000Z");
  assert.equal((await readShibaUsage(alice, "pro", { redis, now: november })).remaining, 500);
  assert.equal((await readShibaUsage(bob, "pro", { redis, now: november })).bonusRemaining, 0);
});

test("le message d'épuisement ne promet pas de réinitialisation pour Découverte", () => {
  assert.equal(shibaCreditsExhaustedMessage("month"),
    "Vos crédits Shiba Bot sont épuisés. Rechargez vos crédits ou attendez leur prochaine réinitialisation.");
  assert.doesNotMatch(shibaCreditsExhaustedMessage("trial"), /prochaine réinitialisation/);
});

test("l'affichage convertit la frontière UTC en heure de Paris", () => {
  assert.match(formatShibaResetDate("2026-11-01T00:00:00.000Z"), /01:00/);
  assert.match(formatShibaResetDate("2026-07-01T00:00:00.000Z"), /02:00/);
  assert.equal(formatShibaResetDate(null), null);
});
