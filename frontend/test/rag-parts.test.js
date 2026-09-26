import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getEquipmentConfig } from "../server/lib/equipment-registry.js";
import { searchRagContext } from "../server/lib/rag.js";

const rag = JSON.parse(readFileSync(new URL(
  "../src/data/rag/atlantic-021272-nomenclature-2018.full.embeddings.json",
  import.meta.url,
)));
const openai = {
  embeddings: {
    create: async () => ({ data: [{ embedding: rag.items[0].embedding.map(() => 0) }] }),
  },
};

test("Atlantic: une référence de pièce remonte sa page de nomenclature", async () => {
  for (const [question, reference, page] of [
    ["Quelle est la référence du ventilateur 20/25 kW ?", "988531", 7],
    ["Quelle est la référence de la vanne gaz ?", "988113", 7],
    ["Quelle est la référence du disconnecteur ?", "119528", 13],
  ]) {
    const result = await searchRagContext(openai, rag, question, 3);
    assert.equal(result.queryIntent, "part_reference");
    assert.ok(result.topResults.some((item) =>
      item.documentType === "exploded_view" &&
      item.page === page &&
      item.text.includes(reference)), question);
  }
});

test("les quatre nouveaux modèles retrouvent une référence sur la vue exacte", async () => {
  for (const [model, question, reference, page] of [
    ["3310543", "Quelle est la référence de la vanne gaz ?", "65116557", 3],
    ["3310544", "Quelle est la référence de la pompe 5M PWM TACO ?", "65116908-03", 7],
    ["3310545", "Quelle est la référence de la vanne gaz ?", "65116557", 3],
    ["7716704261", "Quelle est la référence du moteur de circulateur ?", "8 716 771 427 0", 13],
  ]) {
    const config = getEquipmentConfig(model);
    assert.ok(config, model);
    const result = await searchRagContext(openai, config.ragEmbeddingData, question, 3);
    assert.equal(result.queryIntent, "part_reference");
    assert.ok(result.topResults.some((item) =>
      item.documentType === "exploded_view" &&
      item.page === page &&
      item.text.includes(reference)), model);
  }
});

test("la hotline Chaffoteaux reste présente sur les trois fiches", () => {
  for (const model of ["3310543", "3310544", "3310545"]) {
    assert.equal(getEquipmentConfig(model).equipmentData.support.hotline.phone, "01 55 84 94 94");
  }
});

test("la notice ELM scannée est indexée page par page après OCR", () => {
  const notice = JSON.parse(readFileSync(new URL(
    "../src/data/rag/elm-leblanc-elm-leblanc-7716704261-installation.pages.json",
    import.meta.url,
  )));
  assert.equal(notice.pageCount, 56);
  assert.equal(notice.pages.length, 56);
  assert.ok(notice.pages.every(({ text }) => text.trim().length > 0));
  assert.match(notice.pages[0].text, /23-4H\.5/i);
});
