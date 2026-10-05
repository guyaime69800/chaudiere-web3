import test from "node:test";
import assert from "node:assert/strict";
import { technicalDocumentBlobLocation } from "../server/lib/technical-document-store.js";

const source = "https://preview.private.blob.vercel-storage.com/atlantic/021272/vue%20%C3%A9clat%C3%A9e.pdf";

test("legacy documents resolve in the separate Production store", () => {
  const production = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main",
    VITE_SUPABASE_URL: "https://tsyukqcyfxcrjrhopvpv.supabase.co" };
  assert.equal(technicalDocumentBlobLocation(source, production), "platform-documents/vue éclatée.pdf");
  assert.equal(technicalDocumentBlobLocation("saunier-duval/notice.pdf", production), "platform-documents/notice.pdf");
  assert.equal(technicalDocumentBlobLocation(source, { ...production, VITE_SUPABASE_URL: "https://other.supabase.co" }), source);
  assert.equal(technicalDocumentBlobLocation(source, { ...production, VERCEL_ENV: "preview" }), source);
});
