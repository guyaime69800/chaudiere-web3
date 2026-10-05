import test from "node:test";
import assert from "node:assert/strict";
import { platformAdminEnvironment } from "../server/lib/platform-admin-environment.js";

const previewUrl = "https://bqqzzbwqmiyxcotvqtoc.supabase.co";
const productionRef = "abcdefghijklmnopqrst";
const productionUrl = `https://${productionRef}.supabase.co`;

test("the internal administration remains on the isolated Preview branch", () => {
  const preview = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/documentation-multi-docs",
    VITE_SUPABASE_URL: previewUrl };
  assert.deepEqual(platformAdminEnvironment(preview), { name: "preview" });
  assert.deepEqual(platformAdminEnvironment({ ...preview, VERCEL_GIT_COMMIT_REF: "release/paris2-admin-documents" }), { name: "preview" });
  assert.equal(platformAdminEnvironment({ ...preview, VERCEL_GIT_COMMIT_REF: "another-branch" }).status, 404);
  assert.equal(platformAdminEnvironment({ ...preview, VITE_SUPABASE_URL: productionUrl }).status, 503);
});

test("production administration is off by default and requires a separate database", () => {
  const production = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main",
    VITE_SUPABASE_URL: productionUrl, CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF: productionRef };
  assert.equal(platformAdminEnvironment(production).status, 404);
  const enabled = { ...production, CARNETPASS_PRODUCTION_ADMIN_ENABLED: "true" };
  assert.deepEqual(platformAdminEnvironment(enabled), { name: "production" });
  assert.equal(platformAdminEnvironment({ ...enabled, VERCEL_GIT_COMMIT_REF: "feature/documentation-multi-docs" }).status, 404);
  assert.equal(platformAdminEnvironment({ ...enabled, VITE_SUPABASE_URL: previewUrl }).status, 503);
  assert.equal(platformAdminEnvironment({ ...enabled, CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF: "bqqzzbwqmiyxcotvqtoc",
    VITE_SUPABASE_URL: previewUrl }).status, 503);
  assert.equal(platformAdminEnvironment({ ...enabled, CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF: "rpwzzvreuenstsjtbzto",
    VITE_SUPABASE_URL: "https://rpwzzvreuenstsjtbzto.supabase.co" }).status, 503);
  assert.equal(platformAdminEnvironment({ ...enabled, CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF: "" }).status, 503);
});
