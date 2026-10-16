import test from "node:test";
import assert from "node:assert/strict";
import { acceptedCommercialTerms, commercialTermsMetadata, COMMERCIAL_TERMS_VERSION } from "./commercial-terms.js";
test("checkout requires affirmative acceptance of the current terms", () => {
  for (const terms of [null, {}, { accepted: false, version: COMMERCIAL_TERMS_VERSION },
    { accepted: "true", version: COMMERCIAL_TERMS_VERSION }, { accepted: true, version: "obsolete" }]) {
    assert.equal(acceptedCommercialTerms(terms), false);
  }
  assert.equal(acceptedCommercialTerms({ accepted: true, version: COMMERCIAL_TERMS_VERSION }), true);
});
test("Stripe retains accepted version, verified actor, company and server timestamp", () => {
  const params = commercialTermsMetadata("actor", "company", "2026-10-12T12:00:00.000Z");
  assert.equal(params["metadata[cgv_user_id]"], "actor");
  assert.equal(params["metadata[cgv_company_id]"], "company");
  assert.equal(params["metadata[cgv_version]"], COMMERCIAL_TERMS_VERSION);
  assert.equal(params["metadata[cgv_accepted_at]"], "2026-10-12T12:00:00.000Z");
  assert.equal(params["consent_collection[terms_of_service]"], "required");
});

test("the archived terms match their immutable Stripe fingerprint", async () => {
  const { readFileSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const { COMMERCIAL_TERMS_SHA256 } = await import("./commercial-terms.js");
  const archive = readFileSync(new URL("../docs/legal-versions/cgv-2026-10-12.3.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(archive).digest("hex"), COMMERCIAL_TERMS_SHA256);
});
