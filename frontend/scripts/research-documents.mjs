import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { researchPilot } from "./lib/document-research.js";

// Internal development command. No network request, PDF download, API cost or import.
const options = Object.fromEntries(process.argv.slice(2).filter((item) => item.startsWith("--") && item.includes("=")).map((item) => {
  const separator = item.indexOf("=");
  return [item.slice(2, separator), item.slice(separator + 1)];
}));
if (!options.brand || !options.model || !options.reference) {
  console.error('Usage: node scripts/research-documents.mjs --brand="De Dietrich" --model="MCR 2 24" --reference=7841749');
  process.exitCode = 2;
} else {
  const dossier = researchPilot(options);
  if (!dossier.supported) {
    console.error(`Ce premier pilote couvre seulement ${dossier.pilot.brand} ${dossier.pilot.model}, référence ${dossier.pilot.reference}. Aucun document n'a été validé pour cette saisie.`);
    process.exitCode = 2;
  } else {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const reports = join(root, "research", "reports");
    const output = join(reports, "de-dietrich-mcr-2-24-7841749.md");
    const lines = [
      "# Dossier documentaire — De Dietrich MCR 2 24 (7841749)",
      "",
      "Statut : **à vérifier par un administrateur**. Aucun lien de ce rapport ne vaut autorisation de copie, stockage, redistribution ou indexation.",
      "",
      "## Couverture actuelle dans CarnetPass",
      "",
      ...dossier.existing.map((item) => `- ${item.title} — ${item.documentType}${item.documentCode ? ` — code ${item.documentCode}` : ""} — ID ${item.documentId}`),
      "",
      "À contrôler dans les documents existants : codes défauts, schéma électrique, pages de maintenance et applicabilité exacte à la référence 7841749. Pour toute référence de pièce, la vue éclatée est prioritaire.",
      "",
      "## Sources publiques du fabricant à examiner",
      "",
    ];
    for (const [index, item] of dossier.results.entries()) {
      lines.push(
        `### ${index + 1}. ${item.title}`,
        "",
        `- Page source : ${item.sourcePageUrl}`,
        `- PDF : ${item.pdfUrl}`,
        `- Éditeur : ${item.publisher}`,
        `- Type : ${item.documentType}`,
        `- Modèle repéré : ${item.modelFound}`,
        `- Référence repérée : ${item.referenceFound || "non repérée"}`,
        `- Langue : ${item.language}`,
        `- Date : ${item.date || "inconnue"}`,
        `- Confiance : ${item.matchConfidence} — ${item.matchReason}`,
        `- Variante : ${item.variantWarning}`,
        `- Doublon dans CarnetPass : ${item.duplicateOf || "aucun doublon par code identifié"}`,
        "- Droits d'utilisation : non vérifiés",
        "- Décision : en attente de vérification humaine",
        "",
      );
    }
    lines.push(
      "## Pistes à ouvrir manuellement",
      "",
      ...dossier.manualSources.map((item) => `- ${item.publisher} : ${item.instruction}`),
      "",
      "## Décision avant intégration",
      "",
      "- [ ] Vérifier le PDF, le modèle exact, la puissance, la génération et la référence constructeur.",
      "- [ ] Vérifier le code documentaire et l'empreinte SHA-256 contre le catalogue existant.",
      "- [ ] Obtenir et conserver la preuve des droits de stockage et d'indexation.",
      "- [ ] Faire approuver chaque document par l'administrateur.",
      "- [ ] Après approbation seulement, suivre le processus existant d'import RAG et vérifier les citations Shiba pour ce modèle.",
      "",
    );
    await mkdir(reports, { recursive: true });
    await writeFile(output, lines.join("\n"), "utf8");
    console.log(`Dossier créé : ${output}`);
    console.log("Aucun PDF téléchargé, stocké ou indexé.");
  }
}
