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

test("internal admin stays unavailable outside the approved Preview branch", async () => {
  const previousEnv = process.env.VERCEL_ENV;
  const previousBranch = process.env.VERCEL_GIT_COMMIT_REF;
  const previousEnabled = process.env.CARNETPASS_PREVIEW_ENTERPRISE_ADMIN_ENABLED;
  try {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_REF = "feature/documentation-multi-docs";
    process.env.CARNETPASS_PREVIEW_ENTERPRISE_ADMIN_ENABLED = "true";
    const production = response();
    await platformAdminHandler({ method: "GET", headers: {} }, production);
    assert.equal(production.statusCode, 404);

    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_REF = "other-branch";
    const otherBranch = response();
    await platformAdminHandler({ method: "GET", headers: {} }, otherBranch);
    assert.equal(otherBranch.statusCode, 404);

    process.env.VERCEL_GIT_COMMIT_REF = "feature/documentation-multi-docs";
    process.env.CARNETPASS_PREVIEW_ENTERPRISE_ADMIN_ENABLED = "false";
    const disabled = response();
    await platformAdminHandler({ method: "POST", headers: {} }, disabled);
    assert.equal(disabled.statusCode, 503);
  } finally {
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
    if (previousBranch === undefined) delete process.env.VERCEL_GIT_COMMIT_REF;
    else process.env.VERCEL_GIT_COMMIT_REF = previousBranch;
    if (previousEnabled === undefined) delete process.env.CARNETPASS_PREVIEW_ENTERPRISE_ADMIN_ENABLED;
    else process.env.CARNETPASS_PREVIEW_ENTERPRISE_ADMIN_ENABLED = previousEnabled;
  }
});
