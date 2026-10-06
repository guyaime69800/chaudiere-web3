import test from "node:test";
import assert from "node:assert/strict";
import { catalogModelsWithPublishedDocuments, publishedDocumentsForEquipment } from "./platformDocumentLibrary.js";

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
  const result = publishedDocumentsForEquipment([{ ...notice, model_aliases: ["7SP023250"] }], { brand: "Airwell", product_reference: "7SP023250" });
  assert.equal(result.length, 1);
});

test("finds an imported PDF from the product code within its model reference", () => {
  const result = publishedDocumentsForEquipment([notice], { brand: "Airwell", product_reference: "7SP023249" });
  assert.equal(result.length, 1);
  assert.equal(publishedDocumentsForEquipment([notice], { brand: "Airwell", product_reference: "7SP023248" }).length, 0);
  const atlantic = { ...notice, id: "atlantic", manufacturer: "Atlantic", model_reference: "ALFEA DUO - MH-D8 · 023103" };
  assert.equal(publishedDocumentsForEquipment([atlantic], { brand: "Atlantic", product_reference: "023103" }).length, 1);
});

test("groups imported PDFs by exact manufacturer, reference and category for catalog browsing", () => {
  const entries = [
    { ...notice, catalog_category: "air_conditioning_indoor" },
    { ...notice, id: "exploded", title: "Vue éclatée", catalog_category: "air_conditioning_indoor" },
    { ...notice, id: "outdoor", catalog_category: "air_conditioning_outdoor" },
  ];
  const models = catalogModelsWithPublishedDocuments([], entries);
  assert.equal(models.length, 2);
  assert.deepEqual(models.find((model) => model.type === "air_conditioning_indoor").publishedDocuments.map((document) => document.documentId), ["notice", "exploded"]);
  assert.equal(models.find((model) => model.type === "air_conditioning_outdoor").publishedDocuments.length, 1);
});

test("adds imported PDFs to a matching catalog model without changing the source catalog", () => {
  const catalog = [{ brand: "Airwell", model: "HDLA-022N-09M25", manufacturerReference: "HDLA-022N-09M25·7SP023249", type: "air_conditioning", unitPosition: "indoor" }];
  const models = catalogModelsWithPublishedDocuments(catalog, [{ ...notice, catalog_category: "air_conditioning_indoor", model_aliases: ["7SP023249"] }]);
  assert.equal(models.length, 1);
  assert.equal(models[0].publishedDocuments[0].documentId, "notice");
  assert.deepEqual(models[0].searchAliases, ["7SP023249"]);
  assert.equal(catalog[0].publishedDocuments, undefined);
});
