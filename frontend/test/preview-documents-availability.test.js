import assert from "node:assert/strict";
import test from "node:test";
import { previewDocumentsAvailable } from "../src/lib/preview-documents-availability.js";

test("document forms remain available on the isolated Preview", () => {
  assert.equal(previewDocumentsAvailable({
    VITE_SUPABASE_URL: "https://bqqzzbwqmiyxcotvqtoc.supabase.co",
  }), true);
});

test("document forms stay closed on Paris 2 while its API is Preview-only", () => {
  assert.equal(previewDocumentsAvailable({
    VITE_SUPABASE_URL: "https://tsyukqcyfxcrjrhopvpv.supabase.co",
  }), false);
});
