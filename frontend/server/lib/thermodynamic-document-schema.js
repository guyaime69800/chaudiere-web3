export const THERMODYNAMIC_KINDS = ["climate_maintenance", "fluids_15497_04"];

export const CLIMATE_FIELDS = [
  ["holderName", "Détenteur / client"], ["holderAddress", "Adresse de l'installation"],
  ["technicianName", "Technicien"], ["visitDate", "Date de visite"],
  ["airInlets", "Entrées et sorties d'air"], ["filters", "Filtres"],
  ["condensates", "Évacuation des condensats"], ["electrical", "Raccordements électriques"],
  ["outdoorUnit", "Unité extérieure"], ["performance", "Fonctionnement et performances"],
  ["leakObservation", "Observation de fuite"], ["workPerformed", "Travaux effectués"],
  ["measurements", "Mesures relevées"], ["advice", "Conseils au détenteur"],
  ["nextVisit", "Prochaine visite conseillée"],
];

// Rubriques de la notice officielle 52064#04. La saisie numérique n'est pas le PDF XFA officiel.
export const FLUID_FIELDS = [
  ["operatorName", "[1] Opérateur - raison sociale"], ["operatorAddress", "[1] Adresse de l'opérateur"],
  ["operatorSiret", "[1] SIRET"], ["capacityNumber", "[1] Attestation de capacité"],
  ["holderName", "[2] Détenteur"], ["holderAddress", "[2] Adresse du détenteur"],
  ["holderIdentifier", "[2] SIRET ou autre identifiant"],
  ["installationAddress", "[3] Adresse de l'équipement"],
  ["equipmentIdentification", "[3] Repérage de l'équipement / circuit"],
  ["refrigerant", "[3] Dénomination du fluide"], ["fluidCategory", "[3] Catégorie de fluide"], ["chargeKg", "[3] Charge totale (kg)"],
  ["co2Equivalent", "[3] Tonnes équivalent CO2"],
  ["operationDate", "[4] Date de l'opération"], ["operationNature", "[4] Nature de l'intervention"],
  ["operationOther", "[4] Précision si autre"],
  ["leakDetector", "[5] Détecteur manuel de fuite - identification"],
  ["detectorCheckedAt", "[5] Dernier contrôle du détecteur"],
  ["permanentDetector", "[6] Détection permanente des fuites (oui/non)"],
  ["chargeBracket", "[7] Tranche de charge"],
  ["frequencyNoDetector", "[8] Périodicité sans détection permanente"],
  ["frequencyWithDetector", "[9] Périodicité avec détection permanente"],
  ["leaksFound", "[10] Fuites constatées (oui/non)"],
  ["leakLocations", "[10] Localisation et réparation des fuites"],
  ["chargedTotalKg", "[11] Quantité chargée totale (kg)"],
  ["virginKg", "[11] A - Fluide vierge (kg)"],
  ["recycledKg", "[11] B - Fluide recyclé (kg)"],
  ["regeneratedKg", "[11] C - Fluide régénéré (kg)"],
  ["recoveredTotalKg", "[11] Quantité récupérée totale (kg)"],
  ["treatmentKg", "[11] D - Destiné au traitement (kg)"],
  ["reuseKg", "[11] E - Conservé pour réutilisation (kg)"],
  ["containerIds", "[11] Identification des contenants"],
  ["bsffNumber", "[11] Numéro BSFF Trackdéchets, si connu"],
  ["wasteUnCode", "[12] Code UN du déchet"],
  ["wasteDescription", "[12] Dénomination ADR/RID du déchet"],
  ["wasteDestination", "[13] Nom et adresse de l'installation de destination"],
  ["observations", "[14] Observations complémentaires"],
];

export const fieldsForKind = (kind) => kind === "fluids_15497_04" ? FLUID_FIELDS : CLIMATE_FIELDS;

export function normalizeThermodynamicData(kind, value) {
  if (!THERMODYNAMIC_KINDS.includes(kind) || !value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("TYPE_OR_DATA_INVALID");
  }
  const result = {};
  for (const [key] of fieldsForKind(kind)) {
    const raw = value[key] ?? "";
    if (typeof raw !== "string" || raw.length > 2000) throw new Error("FIELD_INVALID");
    result[key] = raw.trim();
  }
  return result;
}

export function validateIssue(kind, data, operatorSignature, holderSignature) {
  const required = kind === "fluids_15497_04"
    ? ["operatorName", "operatorAddress", "operatorSiret", "capacityNumber", "holderName", "holderAddress", "installationAddress", "equipmentIdentification", "refrigerant", "fluidCategory", "chargeKg", "operationDate", "operationNature", "permanentDetector", "leaksFound", "chargedTotalKg", "recoveredTotalKg"]
    : ["holderName", "holderAddress", "technicianName", "visitDate", "workPerformed"];
  const missing = required.filter((key) => !data[key]);
  if (missing.length) throw new Error(`MISSING:${missing.join(",")}`);
  if (!operatorSignature || !holderSignature) throw new Error("SIGNATURES_REQUIRED");
  if (kind === "fluids_15497_04") {
    if (!/^\d{14}$/.test(data.operatorSiret.replace(/\s/g, ""))) throw new Error("SIRET_INVALID");
    if (data.operationNature === "Autre" && !data.operationOther) throw new Error("OPERATION_DETAILS_REQUIRED");
    if (["HFC", "PFC"].includes(data.fluidCategory) && !data.co2Equivalent) throw new Error("CO2_EQUIVALENT_REQUIRED");
    const numeric = ["chargeKg", "co2Equivalent", "chargedTotalKg", "virginKg", "recycledKg", "regeneratedKg", "recoveredTotalKg", "treatmentKg", "reuseKg"];
    const number = (key) => Number((data[key] || "0").replace(",", "."));
    if (numeric.some((key) => data[key] && (!Number.isFinite(number(key)) || number(key) < 0))) throw new Error("QUANTITY_INVALID");
    if (Math.abs(number("chargedTotalKg") - number("virginKg") - number("recycledKg") - number("regeneratedKg")) > 0.01
      || Math.abs(number("recoveredTotalKg") - number("treatmentKg") - number("reuseKg")) > 0.01) throw new Error("QUANTITY_MISMATCH");
    if (number("treatmentKg") > 0 && (!data.wasteUnCode || !data.wasteDescription || !data.wasteDestination)) {
      throw new Error("WASTE_DETAILS_REQUIRED");
    }
    if (data.leaksFound === "Oui" && !data.leakLocations) throw new Error("LEAK_DETAILS_REQUIRED");
  }
}

export function normalizeDrawnSignature(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || typeof value.name !== "string" || !value.name.trim() || value.name.length > 120
    || value.accepted !== true || !Array.isArray(value.strokes) || !value.strokes.length
    || value.strokes.length > 30) throw new Error("SIGNATURE_INVALID");
  let count = 0;
  const strokes = value.strokes.map((stroke) => {
    if (!Array.isArray(stroke) || stroke.length < 2 || stroke.length > 300) throw new Error("SIGNATURE_INVALID");
    count += stroke.length;
    return stroke.map((point) => {
      if (!Array.isArray(point) || point.length !== 2 || point.some((n) => !Number.isInteger(n) || n < 0 || n > 1000)) {
        throw new Error("SIGNATURE_INVALID");
      }
      return point;
    });
  });
  if (count < 8 || count > 3000) throw new Error("SIGNATURE_INVALID");
  return { name: value.name.trim(), strokes, accepted: true };
}
