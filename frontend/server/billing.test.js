import assert from "node:assert/strict";
import test from "node:test";
import { hasBillingSiret } from "./billing.js";

test("paid checkout requires a stored 14-digit company SIRET", () => {
  assert.equal(hasBillingSiret("12345678901234"), true);
  assert.equal(hasBillingSiret(null), false);
  assert.equal(hasBillingSiret(""), false);
  assert.equal(hasBillingSiret("1234567890123"), false);
  assert.equal(hasBillingSiret("12345678901234 "), false);
});
