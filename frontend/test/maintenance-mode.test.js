import test from "node:test";
import assert from "node:assert/strict";
import middleware from "../middleware.js";
import { maintenanceAllowedPath, maintenanceHtml } from "../server/lib/maintenance-state.js";

test("maintenance preserves the founder control and reminder scheduler", () => {
  assert.equal(maintenanceAllowedPath("/administration-maintenance"), true);
  assert.equal(maintenanceAllowedPath("/api/maintenance-control"), true);
  assert.equal(maintenanceAllowedPath("/api/maintenance-reminders"), true);
  assert.equal(maintenanceAllowedPath("/api/billing"), false);
  assert.equal(maintenanceAllowedPath("/espace-pro"), false);
});

test("maintenance message cannot inject HTML", () => {
  const html = maintenanceHtml("<script>alert('x')</script>");
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("&lt;script&gt;"), true);
});

test("active maintenance blocks both the dApp and public APIs", async () => {
  const original = {
    env: process.env.VERCEL_ENV,
    url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
    fetch: globalThis.fetch,
  };
  try {
    process.env.VERCEL_ENV = "production";
    process.env.UPSTASH_REDIS_REST_KV_REST_API_URL = "https://example.invalid";
    process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN = "test";
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ result: JSON.stringify({ enabled: true, message: "Mise à jour" }) }) });
    const page = await middleware(new Request("https://www.carnetpass.fr/espace-pro"));
    assert.equal(page.status, 503);
    assert.match(await page.text(), /Mise à jour/);
    const api = await middleware(new Request("https://www.carnetpass.fr/api/billing"));
    assert.equal(api.status, 503);
    assert.equal((await api.json()).ok, false);
  } finally {
    if (original.env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = original.env;
    if (original.url === undefined) delete process.env.UPSTASH_REDIS_REST_KV_REST_API_URL; else process.env.UPSTASH_REDIS_REST_KV_REST_API_URL = original.url;
    if (original.token === undefined) delete process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN; else process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN = original.token;
    globalThis.fetch = original.fetch;
  }
});
