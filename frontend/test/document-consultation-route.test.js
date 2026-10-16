import test from "node:test";
import assert from "node:assert/strict";
import handler from "../server/lib/platform-catalog-documents.js";

test("catalogue authenticates and checks publication before quota; exhausted or unavailable quota blocks storage", async () => {
  const oldEnv = { ...process.env }, oldFetch = globalThis.fetch;
  Object.assign(process.env, { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main",
    VITE_SUPABASE_URL: "https://tsyukqcyfxcrjrhopvpv.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "test-public",
    SUPABASE_SECRET_KEY: "test-private", CARNETPASS_PRODUCTION_ADMIN_ENABLED: "true",
    CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF: "tsyukqcyfxcrjrhopvpv",
    UPSTASH_REDIS_REST_KV_REST_API_URL: "https://quota.example.invalid", UPSTASH_REDIS_REST_KV_REST_API_TOKEN: "test-only" });
  let published = false, quotaCalls = 0, offline = false;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url || String(input);
    if (url.startsWith("https://quota.example.invalid")) {
      quotaCalls++; if (offline) return Response.json({ error: "offline" }, { status: 503 });
      return Response.json(url.endsWith("/pipeline") ? [{ result: [0, 20] }] : { result: [0, 20] });
    }
    let data;
    if (url.includes("/auth/v1/user")) data = { id: "alice", email_confirmed_at: "2026-01-01" };
    else if (url.includes("/company_members")) data = [{ company_id: "company", role: "owner" }];
    else if (url.includes("/companies?")) data = { id: "company", siret: "12345678901234", is_demo: false,
      created_at: "2026-01-01", company_verifications: { status: "approved", verified_siret: "12345678901234", verified_at: "2026-01-01" } };
    else if (url.includes("/pro_account_assignments")) data = null;
    else if (url.includes("/subscriptions")) data = { plan: "pro", status: "active" };
    else if (url.includes("/platform_document_intake")) data = published ? { blob_pathname: "never-read.pdf", sha256: "a".repeat(64), size_bytes: 100 } : null;
    else throw new Error("Unexpected storage or network call: " + url);
    return Response.json(data);
  };
  const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } });
  const req = { method: "GET", headers: { authorization: "Bearer test-token" },
    query: { id: "11111111-1111-4111-8111-111111111111", consultation: "22222222-2222-4222-8222-222222222222", delivery: "url" } };
  try {
    let res = response(); await handler({ ...req, headers: {} }, res); assert.equal(res.code, 401); assert.equal(quotaCalls, 0);
    res = response(); await handler(req, res); assert.equal(res.code, 404); assert.equal(quotaCalls, 0);
    published = true; res = response(); await handler(req, res); assert.equal(res.code, 429);
    assert.equal(res.data.code, "DOCUMENT_DAILY_QUOTA_REACHED"); assert.equal(res.headers["X-Document-Remaining"], "0"); assert.equal(quotaCalls, 1);
    offline = true; res = response(); await handler(req, res); assert.equal(res.code, 503);
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
  }
});
