import test from "node:test";
import assert from "node:assert/strict";
import platformAdminHandler from "../server/platform-admin.js";

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("internal admin separates Preview and explicitly enabled Production", async () => {
  const previousEnv = process.env.VERCEL_ENV;
  const previousBranch = process.env.VERCEL_GIT_COMMIT_REF;
  const previousEnabled = process.env.CARNETPASS_PRODUCTION_ADMIN_ENABLED;
  const previousProductionRef = process.env.CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF;
  const previousUrl = process.env.VITE_SUPABASE_URL;
  const previousPublicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const previousSecretKey = process.env.SUPABASE_SECRET_KEY;
  try {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_REF = "feature/documentation-multi-docs";
    const production = response();
    await platformAdminHandler({ method: "GET", headers: {} }, production);
    assert.equal(production.statusCode, 404);

    process.env.VERCEL_GIT_COMMIT_REF = "main";
    process.env.CARNETPASS_PRODUCTION_ADMIN_ENABLED = "true";
    process.env.CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF = "abcdefghijklmnopqrst";
    process.env.VITE_SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "test-public-key";
    process.env.SUPABASE_SECRET_KEY = "test-secret-key";
    const enabledProductionWithoutSession = response();
    await platformAdminHandler({ method: "GET", headers: {} }, enabledProductionWithoutSession);
    assert.equal(enabledProductionWithoutSession.statusCode, 401);

    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_REF = "other-branch";
    const otherBranch = response();
    await platformAdminHandler({ method: "GET", headers: {} }, otherBranch);
    assert.equal(otherBranch.statusCode, 404);

    process.env.VERCEL_GIT_COMMIT_REF = "feature/documentation-multi-docs";
    process.env.VITE_SUPABASE_URL = "https://other.supabase.co";
    const wrongProject = response();
    await platformAdminHandler({ method: "GET", headers: {} }, wrongProject);
    assert.equal(wrongProject.statusCode, 503);

    process.env.VITE_SUPABASE_URL = "https://bqqzzbwqmiyxcotvqtoc.supabase.co";
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "test-public-key";
    process.env.SUPABASE_SECRET_KEY = "test-secret-key";
    const withoutSession = response();
    await platformAdminHandler({ method: "GET", headers: {} }, withoutSession);
    assert.equal(withoutSession.statusCode, 401);
  } finally {
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
    if (previousBranch === undefined) delete process.env.VERCEL_GIT_COMMIT_REF;
    else process.env.VERCEL_GIT_COMMIT_REF = previousBranch;
    if (previousEnabled === undefined) delete process.env.CARNETPASS_PRODUCTION_ADMIN_ENABLED;
    else process.env.CARNETPASS_PRODUCTION_ADMIN_ENABLED = previousEnabled;
    if (previousProductionRef === undefined) delete process.env.CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF;
    else process.env.CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF = previousProductionRef;
    if (previousUrl === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = previousUrl;
    if (previousPublicKey === undefined) delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    else process.env.VITE_SUPABASE_PUBLISHABLE_KEY = previousPublicKey;
    if (previousSecretKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousSecretKey;
  }
});
