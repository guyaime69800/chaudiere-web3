import test from "node:test";
import assert from "node:assert/strict";
import { platformDocumentCatalogAllowed, platformDocumentEnvironment, platformDocumentPathname } from "../server/lib/platform-document-environment.js";

const previewUrl = "https://bqqzzbwqmiyxcotvqtoc.supabase.co";
const productionRef = "tsyukqcyfxcrjrhopvpv";
const productionUrl = `https://${productionRef}.supabase.co`;
const documentId = "43c3fcee-b917-4ddc-a438-c06358eb6151";

test("the document administration follows the production admin gate", () => {
  const production = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main",
    VITE_SUPABASE_URL: productionUrl, CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF: productionRef };
  assert.equal(platformDocumentEnvironment(production).status, 404);
  assert.deepEqual(platformDocumentEnvironment({ ...production, CARNETPASS_PRODUCTION_ADMIN_ENABLED: "true" }), { name: "production" });
  assert.equal(platformDocumentEnvironment({ ...production, CARNETPASS_PRODUCTION_ADMIN_ENABLED: "true",
    VITE_SUPABASE_URL: previewUrl }).status, 503);
});

test("private document paths use the same layout in separate stores", () => {
  assert.equal(platformDocumentPathname(`platform-documents/${documentId}.pdf`, "preview"), true);
  assert.equal(platformDocumentPathname(`platform-documents/production/${documentId}.pdf`, "preview"), false);
  assert.equal(platformDocumentPathname(`platform-documents/${documentId}.pdf`, "production"), true);
  assert.equal(platformDocumentPathname(`platform-documents/production/${documentId}.pdf`, "production"), false);
});

test("the Production catalog allows verified and active discovery professionals", () => {
  assert.equal(platformDocumentCatalogAllowed("production", "verified"), true);
  assert.equal(platformDocumentCatalogAllowed("production", "demo"), false);
  assert.equal(platformDocumentCatalogAllowed("production", "discovery"), true);
  assert.equal(platformDocumentCatalogAllowed("production", undefined), false);
  assert.equal(platformDocumentCatalogAllowed("preview", "demo"), true);
});
