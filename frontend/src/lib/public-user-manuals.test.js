import test from "node:test";
import assert from "node:assert/strict";
import { answerFromPublicUserManual, getPublicUserManual } from "./public-user-manuals.js";

const manual = getPublicUserManual({ brand: "Airwell", manufacturerReference: "HDLA-022N-09M25:7SP023249" });

test("the Airwell public notice matches only the exact model", () => {
  assert.equal(manual?.publisher, "Airwell");
  assert.equal(getPublicUserManual({ brand: "Airwell", model: "HDLA-025N-09M25" }), null);
  assert.equal(getPublicUserManual({ brand: "Other", model: "HDLA-022N-09M25" }), null);
});

test("Shiba's public answer stays inside the user notice", () => {
  assert.match(answerFromPublicUserManual(manual, "Comment nettoyer le filtre ?")?.answer || "", /filtre/);
  assert.match(answerFromPublicUserManual(manual, "Voyant CL sur le filtre")?.answer || "", /240 heures/);
  assert.equal(answerFromPublicUserManual(manual, "Comment raccorder le frigorifique ?")?.page, null);
  assert.equal(answerFromPublicUserManual(manual, "Quel est le prix du compresseur ?")?.page, null);
  assert.equal(answerFromPublicUserManual(manual, "Quelle est la météo ?"), null);
});
