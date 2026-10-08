import test from "node:test";
import assert from "node:assert/strict";
import { mfaAccessError } from "../server/lib/mfa-access.js";
import platformAdminHandler from "../server/platform-admin.js";

const user = { id: "00000000-0000-4000-8000-000000000001", email_confirmed_at: "2026-01-01", factors: [{ status: "verified", factor_type: "totp" }] };
const jwt = (aal, sub = user.id) => `header.${Buffer.from(JSON.stringify({ sub, aal })).toString("base64url")}.signature`;
test("verified factors require AAL2 and bind the assurance to the authenticated user", () => {
  assert.equal(mfaAccessError(user, jwt("aal1")).code, "MFA_REQUIRED");
  assert.equal(mfaAccessError(user, jwt("aal2")), null);
  assert.equal(mfaAccessError(user, jwt("aal2", "another-user")).code, "MFA_REQUIRED");
  assert.equal(mfaAccessError(user, "invalid").status, 403);
});
test("administrators must enroll; regular users without a factor keep their access", () => {
  const unenrolled = { ...user, factors: [], user_metadata: { aal: "aal2", role: "founder" } };
  assert.equal(mfaAccessError(unenrolled, jwt("aal1")), null);
  assert.equal(mfaAccessError(unenrolled, jwt("aal1"), { required: true }).code, "MFA_ENROLLMENT_REQUIRED");
});
function response() { return { setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } }; }
test("admin enrollment discovery reveals no business data and all real admin routes require MFA", async () => {
  const previousEnv = { ...process.env }, previousFetch = globalThis.fetch;
  Object.assign(process.env, { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", CARNETPASS_PRODUCTION_ADMIN_ENABLED: "true", CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF: "abcdefghijklmnopqrst", VITE_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "public", SUPABASE_SECRET_KEY: "secret" });
  let enrolled = false, validToken = true, admin = true, sensitiveReads = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return Response.json(validToken ? { ...user, factors: enrolled ? user.factors : [] } : { message: "Invalid JWT" }, { status: validToken ? 200 : 401 });
    if (url.includes("/platform_admins")) return Response.json(admin ? { role: "founder" } : null);
    sensitiveReads++;
    return Response.json([]);
  };
  try {
    const status = response();
    await platformAdminHandler({ method: "GET", headers: { authorization: `Bearer ${jwt("aal1")}` }, query: { security: "1" } }, status);
    assert.equal(status.statusCode, 200); assert.equal(status.body.mfaRequired, true); assert.equal(status.body.companies, undefined); assert.equal(sensitiveReads, 0);
    for (const method of ["GET", "POST"]) {
      const denied = response();
      await platformAdminHandler({ method, headers: { authorization: `Bearer ${jwt("aal1")}` } }, denied);
      assert.equal(denied.statusCode, 403); assert.equal(denied.body.code, "MFA_ENROLLMENT_REQUIRED");
    }
    enrolled = true;
    const pending = response();
    await platformAdminHandler({ method: "GET", headers: { authorization: `Bearer ${jwt("aal1")}` } }, pending);
    assert.equal(pending.body.code, "MFA_REQUIRED"); assert.equal(sensitiveReads, 0);
    const allowed = response();
    await platformAdminHandler({ method: "GET", headers: { authorization: `Bearer ${jwt("aal2")}` } }, allowed);
    assert.equal(allowed.statusCode, 200); assert.ok(sensitiveReads > 0);
    admin = false;
    const ordinary = response();
    await platformAdminHandler({ method: "GET", headers: { authorization: `Bearer ${jwt("aal2")}` } }, ordinary);
    assert.equal(ordinary.statusCode, 403);
    validToken = false;
    const forged = response();
    await platformAdminHandler({ method: "GET", headers: { authorization: `Bearer ${jwt("aal2")}` }, query: { security: "1" } }, forged);
    assert.equal(forged.statusCode, 401);
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  }
});
