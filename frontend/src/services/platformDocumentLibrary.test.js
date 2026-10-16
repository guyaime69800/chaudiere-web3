import test from "node:test";
import assert from "node:assert/strict";
import { catalogModelFamilies, catalogModelsWithPublishedDocuments, publishedDocumentsForEquipment } from "./platformDocumentLibrary.js";

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

test("administrative model replaces the legacy card by product code and uses only published PDFs", () => {
  const legacy = { brand: "Saunier Duval", model: "ThemaPlus Condens 25-A", manufacturerReference: "0010021497", type: "boiler", equipmentId: "legacy" };
  const updated = { id: "new-notice", manufacturer: "Saunier Duval", model_reference: "THEMAPLUS CONDENS 25 -A R2 (H-FR) · 0010021497", catalog_category: "boiler", title: "Updated notice" };
  const models = catalogModelsWithPublishedDocuments([legacy], [updated]);
  assert.equal(models.length, 1);
  assert.equal(models[0].model, updated.model_reference);
  assert.equal(models[0].equipmentId, undefined);
  assert.deepEqual(models[0].publishedDocuments.map((doc) => doc.documentId), ["new-notice"]);
  assert.equal(legacy.equipmentId, "legacy");
});

test("catalogue hides all static legacy models even when no administrative PDF is published", () => {
  const legacy = { brand: "Saunier Duval", manufacturerReference: "0010021497", type: "boiler", equipmentId: "old" };
  const unrelated = { ...legacy, manufacturerReference: "0010017388", equipmentId: "other" };
  const managed = { manufacturer: "Saunier Duval", model_reference: "R2 · 0010021497", catalog_category: "boiler" };
  assert.deepEqual(catalogModelsWithPublishedDocuments([legacy, unrelated], [], [managed]), []);
});

test("model families group variants while keeping reference-specific documents separate", () => {
  const base = { manufacturer: "Saunier Duval", model_name: "ThemaPlus Condens", catalog_category: "boiler", title: "Notice" };
  const models = catalogModelsWithPublishedDocuments([], [
    { ...base, id: "f25", model_reference: "THEMAPLUS CONDENS F25 A-1" },
    { ...base, id: "f30", model_reference: "THEMAPLUS CONDENS F30 A-1" },
    { ...base, id: "fast", model_name: "ThemaFast Condens", model_reference: "THEMAFAST F30" },
  ]);
  assert.equal(models.length, 3);
  const families = catalogModelFamilies(models);
  assert.equal(families.find((group) => group.name === "ThemaPlus Condens").count, 2);
  assert.deepEqual(models.find((model) => model.manufacturerReference.includes("F25")).publishedDocuments.map((doc) => doc.documentId), ["f25"]);
  assert.equal(models[0].model, "ThemaPlus Condens");
});

test("legacy imports remain available until their model family is classified", () => {
  const models = catalogModelsWithPublishedDocuments([], [{ ...notice, catalog_category: "air_conditioning_indoor" }]);
  assert.equal(models[0].manufacturerReference, notice.model_reference);
  assert.equal(catalogModelFamilies(models)[0].name, "Modèles à préciser");
});
