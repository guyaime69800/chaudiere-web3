import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import middleware from "../middleware.js";
import accessSession from "../server/access-session.js";
import control from "../server/maintenance-control.js";
import platformAdmin from "../server/platform-admin.js";
import adminDocuments from "../api/platform-admin-documents.js";
import { INTERNAL_COOKIE, accessToken, verifiedIdentity } from "../server/lib/internal-access.js";

const settings = {
  VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main",
  CARNETPASS_PRODUCTION_ADMIN_ENABLED: "true", CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF: "abcdefghijklmnopqrst",
  VITE_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "public-test",
  SUPABASE_SECRET_KEY: "secret-test", UPSTASH_REDIS_REST_KV_REST_API_URL: "https://redis.invalid",
  UPSTASH_REDIS_REST_KV_REST_API_TOKEN: "redis-test",
  BLOB_WEBHOOK_PUBLIC_KEY: "invalid-local-test-key",
};
const jwt = (name = "actor", aal = "aal2") => ["header", Buffer.from(JSON.stringify({sub:"11111111-1111-4111-8111-111111111111",aal,name})).toString("base64url"), "signature"].join(".");
function response() {
  return { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
}
async function fixture(callback) {
  const previous = Object.fromEntries(Object.keys(settings).map(k => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, settings);
  const state = { enabled: true, role: null, writes: 0, rpc: 0, queries: 0, failed: false };
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (state.failed) throw new Error("Unavailable");
    if (url.startsWith("https://redis.invalid")) {
      const body = init.body ? JSON.parse(init.body) : [];
      if (Array.isArray(body[0])) {
        return Response.json(body.map(command => {
          if (String(command[0]).toLowerCase() === "set") { state.writes++; return { result: "OK" }; }
          return { result: JSON.stringify({ enabled: state.enabled }) };
        }));
      }
      if (String(body[0]).toLowerCase() === "set") { state.writes++; return Response.json({ result: "OK" }); }
      return Response.json({ result: JSON.stringify({ enabled: state.enabled, message: "Mise à jour" }) });
    }
    if (url.includes("/auth/v1/user")) {
      if (init.headers?.Authorization === "Bearer forged") return Response.json({ error: "invalid JWT" }, { status: 401 });
      return Response.json({ id: "11111111-1111-4111-8111-111111111111", email_confirmed_at: "2026-01-01", user_metadata: { role: "founder" }, app_metadata: { role: "founder" } });
    }
    if (url.includes("/rest/v1/platform_admins")) {
      state.queries++;
      return Response.json(state.role ? [{ role: state.role }] : []);
    }
    if (url.includes("/rest/v1/rpc/")) { state.rpc++; return Response.json("22222222-2222-4222-8222-222222222222"); }
    throw new Error(`Unexpected mock request: ${url}`);
  };
  try { await callback(state); }
  finally {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

test("five identities: direct page/API access, cookies and existing client sessions", () => fixture(async state => {
  for (const identity of ["anonymous", "pro", "company-collaborator", "operator", "founder"]) {
    state.role = ["operator", "founder"].includes(identity) ? identity : null;
    const headers = identity === "anonymous" ? {} : { authorization: `Bearer ${jwt(identity)}` };
    for (const route of ["/administration-interne", "/ADMINISTRATION-INTERNE", "/administration%2Dinterne/", "/api/platform-admin"]) {
      const result = await middleware(new Request(`https://carnetpass.fr${route}`, { headers }));
      assert.equal(result.status, state.role ? 200 : identity === "anonymous" ? 401 : 403, `${identity} ${route}`);
      assert.match(result.headers.get("cache-control"), /no-store/);
      if (!state.role) assert.doesNotMatch(await result.text(), /Entreprises|scan|RGE|Mettre le site/);
    }
    for (const route of ["/", "/connexion", "/inscription", "/espace-pro", "/api/billing", "/api/verify-company?platform_admin_route=1"]) {
      const result = await middleware(new Request(`https://carnetpass.fr${route}`, { headers }));
      assert.equal(result.status, state.role ? 200 : 503, `${identity} ${route}`);
    }
    for (const route of ["/administration-maintenance", "/api/maintenance-control"]) {
      const result = await middleware(new Request(`https://carnetpass.fr${route}`, { headers }));
      assert.equal(result.status, identity === "founder" ? 200 : identity === "anonymous" ? 401 : 403);
    }
  }
  state.role = "operator";
  const headers = { cookie: `${INTERNAL_COOKIE}=${jwt("operator")}` };
  assert.equal((await middleware(new Request("https://carnetpass.fr/administration-interne", { headers }))).status, 200);
  state.role = null; // Same credential, permission withdrawn in the DB.
  assert.equal((await middleware(new Request("https://carnetpass.fr/administration-interne", { headers }))).status, 403);
  assert.equal((await middleware(new Request("https://carnetpass.fr/espace-pro", { headers }))).status, 503);
}));

test("metadata, query parameters and arbitrary role cookies grant nothing; fail closed", () => fixture(async state => {
  assert.equal((await verifiedIdentity(jwt("pro"))).role, null);
  assert.equal((await middleware(new Request("https://carnetpass.fr/administration-interne?role=founder", { headers: { cookie: "role=founder; maintenance_bypass=true" } }))).status, 401);
  assert.equal(accessToken(new Headers({ cookie: `${INTERNAL_COOKIE}=a; ${INTERNAL_COOKIE}=b` })), null);
  state.role = "founder";
  assert.equal((await middleware(new Request("https://carnetpass.fr/administration-interne", { headers: { cookie: `${INTERNAL_COOKIE}=forged` } }))).status, 401);
  state.role = null;
  state.enabled = false;
  assert.equal((await middleware(new Request("https://carnetpass.fr/administration-interne"))).status, 401);
  assert.equal((await middleware(new Request("https://carnetpass.fr/espace-pro"))).status, 200);
  state.failed = true;
  assert.equal((await middleware(new Request("https://carnetpass.fr/espace-pro"))).status, 503);
}));

test("session bridge only mints an HttpOnly credential after live internal authorization", () => fixture(async state => {
  const req = { method: "POST", headers: { host: "carnetpass.fr", origin: "https://carnetpass.fr", authorization: `Bearer ${jwt("founder")}` } };
  state.role = "founder";
  const success = response(); await accessSession(req, success);
  assert.equal(success.statusCode, 200);
  assert.match(success.headers["set-cookie"], /HttpOnly; Secure; SameSite=Strict; Max-Age=300/);
  state.role = null;
  const denied = response(); await accessSession(req, denied);
  assert.equal(denied.statusCode, 403);
  assert.match(denied.headers["set-cookie"], /Max-Age=0/);
  const csrf = response(); await accessSession({ ...req, headers: { ...req.headers, origin: "https://attacker.invalid" } }, csrf);
  assert.equal(csrf.statusCode, 403);
  const publicAccess = response(); await accessSession({ method: "GET", headers: {} }, publicAccess);
  assert.equal(publicAccess.statusCode, 503);
  assert.equal(publicAccess.body.maintenance, true);
}));

test("founder only: actual maintenance and collaborator handlers reject other roles before writes", () => fixture(async state => {
  for (const role of [null, "operator", "founder"]) {
    state.role = role;
    const res = response();
    await control({ method: "POST", headers: { authorization: `Bearer ${jwt("actor")}` }, body: { enabled: true, message: "Maintenance" } }, res);
    assert.equal(res.statusCode, role === "founder" ? 200 : 403);
    const req = Readable.from([Buffer.from(JSON.stringify({ action: "add-collaborator", email: "member@example.invalid" }))]);
    req.method = "POST"; req.headers = { authorization: `Bearer ${jwt("actor")}` };
    const adminResponse = response(); await platformAdmin(req, adminResponse);
    assert.equal(adminResponse.statusCode, role === "founder" ? 200 : 403);
  }
  assert.equal(state.writes, 1);
  assert.equal(state.rpc, 1);
}));

test("exact exceptions keep login, password recovery, cron and signed webhooks, not all APIs", () => fixture(async () => {
  for (const route of ["/connexion-interne", "/reinitialiser-mot-de-passe", "/api/stripe-webhook", "/api/maintenance-reminders"]) {
    assert.equal((await middleware(new Request(`https://carnetpass.fr${route}`))).status, 200);
  }
  for (const route of ["/api/maintenance-reminders?public_reminder_route=1", "/api/stripe-webhook?account_route=1", "/api/access-session?platform_admin_route=1"]) {
    assert.equal((await middleware(new Request(`https://carnetpass.fr${route}`))).status, 503);
  }
  const blob = { method: "POST", headers: { "x-vercel-signature": "forged", "content-length": "32" }, body: JSON.stringify({ type: "blob.upload-completed" }) };
  assert.equal((await middleware(new Request("https://carnetpass.fr/api/platform-admin-documents", blob))).status, 200);
  assert.equal((await middleware(new Request("https://carnetpass.fr/api/platform-admin-documents", { ...blob, body: JSON.stringify({ type: "blob.generate-presigned-url" }) }))).status, 503);
  const forged = response();
  await adminDocuments({ method: "POST", headers: { "x-vercel-signature": "forged" }, body: { type: "blob.upload-completed", payload: {} } }, forged);
  assert.ok([400, 503].includes(forged.statusCode), JSON.stringify(forged.body)); // Middleware exception never substitutes for signature verification.
}));

test("internal role still requires MFA and exposes only the security challenge", () => fixture(async state => { state.role = "founder"; const token = jwt("founder", "aal1"); const identity = await verifiedIdentity(token); assert.equal(identity.role, null); assert.equal(identity.mfaRequired, true); const res = response(); await accessSession({method:"GET",headers:{authorization:`Bearer ${token}`}}, res); assert.equal(res.body.mfaRequired,true); assert.equal(res.body.role,null); assert.equal((await middleware(new Request("https://carnetpass.fr/administration-interne",{headers:{authorization:`Bearer ${token}`}}))).status,403); }));
