import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";

process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ||= "https://example.invalid";
process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ||= "test-only";

const { default: handler } = await import("../server/shiba-recharge.js");

function request(body, method = "POST") {
  return Object.assign(Readable.from([Buffer.from(body)]), { method, headers: {} });
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("la recharge partage une fonction Vercel existante et reste sous la limite Hobby", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(config.rewrites.some((rewrite) => rewrite.source === "/api/shiba-recharge"
    && rewrite.destination === "/api/verify-company?shiba_recharge_route=1"));
  assert.ok(readdirSync(new URL("../api/", import.meta.url)).filter((name) => name.endsWith(".js")).length <= 12);
});

test("la route refuse une recharge hors Preview test", async () => {
  const before = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "production";
    const res = response();
    await handler(request('{"euros":10}'), res);
    assert.equal(res.statusCode, 503);
  } finally {
    if (before === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = before;
  }
});

test("la route ne crée pas de Checkout pour un corps invalide ou un appel non authentifié", async () => {
  const names = ["VERCEL_ENV", "STRIPE_TEST_SECRET_KEY", "STRIPE_TEST_WEBHOOK_SECRET"];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    Object.assign(process.env, {
      VERCEL_ENV: "preview", STRIPE_TEST_SECRET_KEY: "sk_test_fake", STRIPE_TEST_WEBHOOK_SECRET: "whsec_fake",
    });
    const invalid = response();
    await handler(request("{invalid"), invalid);
    assert.equal(invalid.statusCode, 400);

    const unauthenticated = response();
    await handler(request('{"euros":10}'), unauthenticated);
    assert.equal(unauthenticated.statusCode, 401);
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});
