import test from "node:test";
import assert from "node:assert/strict";
import { devisCompany } from "../server/lib/devis-security.js";
import middleware from "../middleware.js";

test("founder scan permission preserves company scope and suspension checks", async () => {
  const saved = { ...process.env }, previousFetch = globalThis.fetch;
  const userId = "11111111-1111-4111-8111-111111111111";
  Object.assign(process.env, { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", CARNETPASS_PRODUCTION_ADMIN_ENABLED: "true", CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF: "tsyukqcyfxcrjrhopvpv", VITE_SUPABASE_URL: "https://tsyukqcyfxcrjrhopvpv.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "public-fixture", SUPABASE_SECRET_KEY: "secret-fixture" });
  let role = "founder", status = "pending", members = [{ company_id: "company-fixture", role: "owner" }];
  globalThis.fetch = async input => {
    const url = String(input);
    let body;
    if (url.includes("/auth/v1/user")) body = { id: userId, email_confirmed_at: "2026-01-01T00:00:00Z", is_anonymous: false };
    else if (url.includes("/company_members")) body = members;
    else if (url.includes("/companies")) body = { id: "company-fixture", siret: null, company_verifications: { status } };
    else if (url.includes("/platform_admins")) body = { role };
    else throw Error("Unexpected request");
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  };
  const req = { headers: { authorization: "Bearer fixture-token" } };
  try {
    assert.equal((await devisCompany(req, { verified: true, founderTest: true })).testAccess, true);
    await assert.rejects(devisCompany(req, { verified: true }), { status: 403 });
    role = "admin";
    await assert.rejects(devisCompany(req, { verified: true, founderTest: true }), { status: 403 });
    role = "founder"; status = "suspended";
    await assert.rejects(devisCompany(req, { verified: true, founderTest: true }), { status: 403 });
    status = "pending"; members = [];
    await assert.rejects(devisCompany(req, { verified: true, founderTest: true }), { status: 403 });
  } finally { globalThis.fetch = previousFetch; for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
});

test("durable maintenance pass checks current founder role and fails closed", async () => {
  const saved = { ...process.env }, previousFetch = globalThis.fetch;
  Object.assign(process.env, { VERCEL_ENV: "production", UPSTASH_REDIS_REST_KV_REST_API_URL: "https://redis.invalid", UPSTASH_REDIS_REST_KV_REST_API_TOKEN: "fixture", VITE_SUPABASE_URL: "https://supabase.invalid", SUPABASE_SECRET_KEY: "fixture" });
  let role = "founder", available = true;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes("/rest/v1/")) return { ok: available, json: async () => [{ role }] };
    return { ok: true, json: async () => ({ result: JSON.stringify(url.includes("maintenance-access") ? { durable: true, founderId: "11111111-1111-4111-8111-111111111111", expiresAt: new Date(Date.now() + 60000).toISOString() } : { enabled: true }) }) };
  };
  const req = () => new Request("https://www.carnetpass.fr/espace-pro", { headers: { cookie: `carnetpass_maintenance_access=${"a".repeat(64)}` } });
  try {
    assert.equal((await middleware(req())).headers.get("x-middleware-next"), "1");
    role = "admin"; assert.equal((await middleware(req())).status, 503);
    role = "founder"; available = false; assert.equal((await middleware(req())).status, 503);
  } finally { globalThis.fetch = previousFetch; for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
});
