import assert from "node:assert/strict";
import test from "node:test";
import { researchPilot } from "../scripts/lib/document-research.js";
import { getEquipmentConfig } from "../server/lib/equipment-registry.js";
import { searchRagContext } from "../server/lib/rag.js";

test("le pilote exige le modèle et la référence exacts", () => {
  assert.equal(researchPilot({ brand: "De Dietrich", model: "MCR 2 30 MI", reference: "7841749" }).supported, false);
  assert.equal(researchPilot({ brand: "De Dietrich", model: "MCR 2 24", reference: "7841748" }).supported, false);
  assert.equal(researchPilot({ brand: "De Dietrich", model: "MCR 2 24", reference: "7841749" }).supported, true);
});

test("les sources publiques signalent les variantes et le doublon existant sans approbation automatique", () => {
  const result = researchPilot({ brand: "De Dietrich", model: "MCR 2 24", reference: "7841749" });
  assert.ok(result.results.length > 0);
  assert.ok(result.results.every((item) => item.pdfUrl.startsWith("https://") && item.variantWarning && item.approvalStatus === "pending_manual_review"));
  assert.ok(result.results.some((item) => item.duplicateOf === "de-dietrich-mcr-2-24-user-manual-7838860-04"));
});

test("Shiba retrouve la vue éclatée du MCR 2 24 pour une question de pièce", async () => {
  const config = getEquipmentConfig("7841749");
  const embeddings = config.ragEmbeddingData.items[0].embedding.map(() => 0);
  const openai = { embeddings: { create: async () => ({ data: [{ embedding: embeddings }] }) } };
  const result = await searchRagContext(openai, config.ragEmbeddingData, "Quelle est la référence de l'échangeur de chaleur ?", 5);
  assert.equal(result.queryIntent, "part_reference");
  assert.ok(result.topResults.some((item) => item.documentType === "exploded_view" && item.documentId === "de-dietrich-mcr-2-24-exploded-view-2024-03-21" && item.text.includes("7769953")));
});
