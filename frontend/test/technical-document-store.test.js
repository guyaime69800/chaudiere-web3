import test from "node:test";
import assert from "node:assert/strict";
import { technicalDocumentBlobLocation } from "../server/lib/technical-document-store.js";

test("shared Frisquet documents resolve to their existing identical production originals", () => {
  const env = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", VITE_SUPABASE_URL: "https://tsyukqcyfxcrjrhopvpv.supabase.co" };
  assert.equal(technicalDocumentBlobLocation("old/Notice d'aide.pdf", env), "platform-documents/Notice d'aide.pdf");
  assert.equal(technicalDocumentBlobLocation("old/Notice d’aide au dépannage - HYDROMOTRIX VENT.23kW 2000 @0006000-_0806000.pdf", env), "platform-documents/Notice d’aide au dépannage - HYDROMOTRIX VENT.32kW 2000 @0014000-_0803000.pdf");
  assert.equal(technicalDocumentBlobLocation("old/Notice d'installation - HYDROMOTRIX VENT.32kW 2000 @0014000-_0803000.pdf", env), "platform-documents/Notice d'installation - HYDROMOTRIX VENT.23kW 2000 @0006000-_0806000.pdf");
});

test("restored ThemaPlus 25-A originals use the production private store", () => {
  const env = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", VITE_SUPABASE_URL: "https://tsyukqcyfxcrjrhopvpv.supabase.co" };
  assert.equal(technicalDocumentBlobLocation("old/03-Notice-d-installation-technique-THEMAPLUS-CONDENS-25-A.pdf", env), "platform-documents/69937399-e30e-43cb-8d20-5629772fbf98.pdf");
  assert.equal(technicalDocumentBlobLocation("old/04-Notice-d-utilisation-THEMAPLUS-CONDENS-25-A.pdf", env), "platform-documents/c43b1794-df85-4353-9fd5-2cecec381360.pdf");
  assert.equal(technicalDocumentBlobLocation("old/02-Vue-clat-e-THEMAPLUS-CONDENS-25-A.pdf", env), "platform-documents/19b35687-dd47-4e84-9499-2eab2f0fc72e.pdf");
});

const source = "https://preview.private.blob.vercel-storage.com/atlantic/021272/vue%20%C3%A9clat%C3%A9e.pdf";

test("legacy documents resolve in the separate Production store", () => {
  const production = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main",
    VITE_SUPABASE_URL: "https://tsyukqcyfxcrjrhopvpv.supabase.co" };
  assert.equal(technicalDocumentBlobLocation(source, production), "platform-documents/vue éclatée.pdf");
  assert.equal(technicalDocumentBlobLocation("saunier-duval/notice.pdf", production), "platform-documents/notice.pdf");
  assert.equal(technicalDocumentBlobLocation(source, { ...production, VITE_SUPABASE_URL: "https://other.supabase.co" }), source);
  assert.equal(technicalDocumentBlobLocation(source, { ...production, VERCEL_ENV: "preview" }), source);
});
