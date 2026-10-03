import assert from "node:assert/strict";
import test from "node:test";
import { hasBillingSiret, isNewPreviewPlan } from "./billing.js";

test("paid checkout requires a stored 14-digit company SIRET", () => {
  assert.equal(hasBillingSiret("12345678901234"), true);
  assert.equal(hasBillingSiret(null), false);
  assert.equal(hasBillingSiret(""), false);
  assert.equal(hasBillingSiret("1234567890123"), false);
  assert.equal(hasBillingSiret("12345678901234 "), false);
});

test("only the 28-euro professional plan accepts new Preview checkouts", () => {
  assert.equal(isNewPreviewPlan("pro"), true);
  assert.equal(isNewPreviewPlan("team"), false);
  assert.equal(isNewPreviewPlan("enterprise"), false);
  assert.equal(isNewPreviewPlan(undefined), false);
});
