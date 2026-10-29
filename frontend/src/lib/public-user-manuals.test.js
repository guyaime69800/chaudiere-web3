import test from "node:test";
import assert from "node:assert/strict";
import { answerFromPublicUserManual, getPublicUserManual } from "./public-user-manuals.js";

const manual = getPublicUserManual({ brand: "Airwell", manufacturerReference: "HDLA-022N-09M25:7SP023249" });

test("Atlantic public usage answers require the exact reviewed 021240 reference", () => {
  const atlantic = getPublicUserManual({ brand: "Atlantic", model: "NAEMA", productReference: "NAEMA212-021240" });
  assert.equal(atlantic?.publisher, "Atlantic");
  assert.equal(getPublicUserManual({ identity: { brand: "Atlantic", model: "NAEMA" }, manufacturerReference: "NAEMA212-021240" })?.id, atlantic.id);
  for (const reference of ["0212400", "021242", "NAEMA 2", "NAEMA 3"]) assert.equal(getPublicUserManual({ brand: "Atlantic", productReference: reference }), null);
  assert.equal(getPublicUserManual({ brand: "Other", productReference: "021240" }), null);
  assert.equal(answerFromPublicUserManual(atlantic, "Comment programmer les horaires ?")?.pdfPage, 6);
  assert.equal(answerFromPublicUserManual(atlantic, "Comment démonter la chaudière ?")?.page, null);
  assert.equal(answerFromPublicUserManual(atlantic, "Quelle température exacte régler ?"), null);
});

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
