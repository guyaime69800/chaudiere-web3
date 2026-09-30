import test from "node:test";
import assert from "node:assert/strict";
import { publishedDocumentsForEquipment } from "./platformDocumentLibrary.js";

const notice = { id: "notice", manufacturer: "Airwell", model_reference: "HDLA-022N-09M25 · 7SP023249", title: "Notice d'installation", rag_status: "ready" };

test("published notice matches an existing CarnetPass whose reference lost spaces", () => {
  const result = publishedDocumentsForEquipment([notice], { brand: "Airwell", product_reference: "HDLA-022N-09M25·7SP023249" });
  assert.equal(result.length, 1);
  assert.equal(result[0].storage, "platform-private");
  assert.equal(result[0].ragStatus, "ready");
});

test("does not mix manufacturers or nearby references", () => {
  assert.equal(publishedDocumentsForEquipment([notice], { brand: "Atlantic", product_reference: "HDLA-022N-09M25·7SP023249" }).length, 0);
  assert.equal(publishedDocumentsForEquipment([notice], { brand: "Airwell", product_reference: "HDLA-022N-09M25·7SP023248" }).length, 0);
});

test("accepts explicitly registered reference aliases", () => {
  const result = publishedDocumentsForEquipment([{ ...notice, model_aliases: ["7SP023249"] }], { brand: "Airwell", product_reference: "7SP023249" });
  assert.equal(result.length, 1);
});
