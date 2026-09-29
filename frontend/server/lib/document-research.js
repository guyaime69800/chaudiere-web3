import equipment from "../../src/data/equipment/de-dietrich-7841749.json" with { type: "json" };

const pilot = equipment.identity;
const sourcePageUrl = "https://www.dedietrich-thermique.fr/nos-produits/chaudiere-murale/mcr-2";

// First pilot: a small, reviewed index of public manufacturer links. No PDF is fetched.
const candidates = [
  {
    title: "Notice d'utilisation MCR 2 24 / 30 MI / 35 MI",
    sourcePageUrl,
    pdfUrl: "https://www.dedietrich-thermique.fr/content/download/36654/348514/version/4/file/Notice%20d%27utilisation%20MCR2%2024%2030%2035%20MI.pdf",
    publisher: "De Dietrich",
    documentType: "user_manual",
    modelFound: "MCR 2 24 / 30 MI / 35 MI",
    referenceFound: null,
    language: "fr",
    date: "2023-12-15",
    documentCode: "7838860-04",
    variantWarning: "Notice commune à 24, 30 MI et 35 MI : contrôler chaque instruction propre à la variante.",
  },
  {
    title: "Feuillet technique MCR 2",
    sourcePageUrl,
    pdfUrl: "https://mcr2.dedietrich-thermique.fr/pdf/feuillet-technique-mcr2-2024.pdf",
    publisher: "De Dietrich",
    documentType: "technical_sheet",
    modelFound: "MCR 2 24 et autres variantes MCR 2",
    referenceFound: null,
    language: "fr",
    date: "2024",
    documentCode: null,
    variantWarning: "Feuillet de gamme : ne pas l'attribuer automatiquement à la référence 7841749.",
  },
];

const normalized = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function safeManufacturerUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !["dedietrich-thermique.fr", "www.dedietrich-thermique.fr", "mcr2.dedietrich-thermique.fr"].includes(url.hostname)) {
    throw new Error("SOURCE_NOT_ALLOWED");
  }
  return url.href;
}

export function researchPilot({ brand, model, reference }) {
  if (normalized(brand) !== normalized(pilot.brand) || normalized(model) !== normalized(pilot.model) || String(reference ?? "").trim() !== pilot.manufacturerReference) {
    return { supported: false, pilot: { brand: pilot.brand, model: pilot.model, reference: pilot.manufacturerReference }, results: [] };
  }

  const existing = equipment.documents.map((document) => ({
    documentId: document.documentId,
    title: document.title,
    documentType: document.documentType,
    documentCode: document.documentCode,
    sha256: document.sha256,
  }));
  const results = candidates.map((candidate) => {
    const duplicate = existing.find((document) => candidate.documentCode && document.documentCode === candidate.documentCode);
    return {
      ...candidate,
      sourcePageUrl: safeManufacturerUrl(candidate.sourcePageUrl),
      pdfUrl: safeManufacturerUrl(candidate.pdfUrl),
      matchConfidence: candidate.referenceFound === pilot.manufacturerReference ? "high" : "review_required",
      matchReason: "Modèle cité par le fabricant ; référence constructeur exacte non repérée dans la source publique.",
      duplicateOf: duplicate?.documentId ?? null,
      rightsStatus: "not_verified",
      approvalStatus: "pending_manual_review",
    };
  });
  return {
    supported: true,
    pilot: { brand: pilot.brand, model: pilot.model, reference: pilot.manufacturerReference, productType: pilot.productType },
    results,
    existing,
    manualSources: [
      { publisher: "EasySAV", instruction: "Rechercher manuellement la référence 7841749 et respecter le quota de 20 fichiers. Aucun téléchargement automatisé." },
      { publisher: "Pièces Express", instruction: "Rechercher manuellement MCR 2 24 / 7841749. Aucun téléchargement automatisé." },
    ],
  };
}
