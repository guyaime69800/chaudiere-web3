import assert from "node:assert/strict";
import OpenAI from "openai";
import { getEquipmentConfig } from "../server/lib/equipment-registry.js";
import { searchRagContext } from "../server/lib/rag.js";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY requise pour vérifier les recherches réelles.");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const questions = [
  ["021272", "Quelle est la référence de la vanne gaz ?", "988113", 7],
  ["3310543", "Quelle est la référence de la vanne gaz ?", "65116557", 3],
  ["3310544", "Quelle est la référence de la pompe 5M PWM TACO ?", "65116908-03", 7],
  ["3310545", "Quelle est la référence de la vanne gaz ?", "65116557", 3],
  ["7716704261", "Quelle est la référence du moteur de circulateur ?", "8 716 771 427 0", 13],
];

for (const [model, question, reference, page] of questions) {
  const config = getEquipmentConfig(model);
  assert.ok(config, `Équipement ${model} absent du registre`);
  const result = await searchRagContext(openai, config.ragEmbeddingData, question, 3);
  const match = result.topResults.find((item) =>
    item.documentType === "exploded_view" &&
    item.page === page &&
    item.text.includes(reference));
  assert.ok(match, `${model} : ${reference} page ${page} absente des passages`);
  console.log(`${model} : ${reference}, vue éclatée page ${page}`);
}

for (const model of ["3310543", "3310544", "3310545"]) {
  assert.equal(getEquipmentConfig(model).equipmentData.support.hotline.phone, "01 55 84 94 94");
}
console.log("Hotline Chaffoteaux : 01 55 84 94 94");
