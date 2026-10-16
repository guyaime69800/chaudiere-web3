import test from "node:test";
import assert from "node:assert/strict";
import { checkDocumentGrounding } from "../server/lib/shiba-grounding.js";

const passages = [{ text: "Défaut F.28 : absence de flamme. Contrôler l'alimentation en gaz.", page: 12 }];

test("refuse une réponse sans preuve documentaire", () => {
  assert.equal(checkDocumentGrounding({ passages: [], answer: "Code F.28" }), "NO_PASSAGES");
});

test("refuse un code défaut absent des passages", () => {
  assert.equal(checkDocumentGrounding({ passages, answer: "Code F.29", codeVariants: ["F.29", "F29"] }), "CODE_NOT_IN_PASSAGES");
});

test("refuse une page inventée et accepte la page retrouvée", () => {
  assert.equal(checkDocumentGrounding({ passages, answer: "Voir page 13", codeVariants: ["F.28"] }), "UNSUPPORTED_PAGE");
  assert.equal(checkDocumentGrounding({ passages, answer: "F.28 : voir page 12", codeVariants: ["F.28"] }), null);
});

test("reconnaît un code avec espaces et zéros de présentation", () => {
  assert.equal(checkDocumentGrounding({ passages: [{ text: "F. 028 : allumage", page: 3 }], answer: "Voir page 3", codeVariants: ["F.28"] }), null);
});
