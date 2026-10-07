export const DEVIS_STORAGE_KEY = "carnetpass:shiba-devis:draft:v1";
export const HOUSING_TYPES = { house: "Maison", apartment: "Appartement", unknown: "À préciser" };
export const OCCUPANCY_TYPES = { owner: "Propriétaire occupant", landlord: "Propriétaire bailleur", tenant: "Locataire", coproperty: "Copropriété", unknown: "À préciser" };
export const WORK_TYPES = { heating: "Chauffage", hot_water: "Eau chaude", insulation: "Isolation", ventilation: "Ventilation", renovation: "Rénovation globale", cooling: "Climatisation", other: "Autres travaux" };
export const EQUIPMENT_TYPES = { boiler: "Chaudière", heat_pump: "Pompe à chaleur", air_conditioning: "Climatisation", water_heater: "Chauffe-eau", other: "Autre", unknown: "À préciser" };
export const EMPTY_PROJECT = { housing: "", occupancy: "", work: "", currentEquipment: "", postalCode: "", equipmentId: "" };

// Curated official entry points only. No benefits table or eligibility formula
// has been validated: these references must never be used to invent amounts.
export const AID_SOURCES = [
  { id: "simulation", name: "France Rénov’ — simulateur officiel", url: "https://france-renov.gouv.fr/aides/simulation", referencedOn: "2026-10-07", updatedOn: null, purpose: "Renseigner votre situation dans le simulateur du service public." },
  { id: "mpr", name: "France Rénov’ — MaPrimeRénov’", url: "https://france-renov.gouv.fr/aides/maprimerenov", referencedOn: "2026-10-07", updatedOn: null, purpose: "Vérifier les parcours, travaux et conditions applicables à votre situation." },
  { id: "loan", name: "France Rénov’ — éco-prêt à taux zéro", url: "https://france-renov.gouv.fr/aides/eco-pret-taux-zero", referencedOn: "2026-10-07", updatedOn: null, purpose: "Examiner un financement à rembourser, distinct d’une subvention." },
];

function choice(value, choices) {
  return Object.hasOwn(choices, value) ? value : "";
}

export function cleanProject(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  return {
    housing: choice(input.housing, HOUSING_TYPES),
    occupancy: choice(input.occupancy, OCCUPANCY_TYPES),
    work: choice(input.work, WORK_TYPES),
    currentEquipment: choice(input.currentEquipment, EQUIPMENT_TYPES),
    postalCode: typeof input.postalCode === "string" && /^\d{0,5}$/.test(input.postalCode) ? input.postalCode : "",
    equipmentId: typeof input.equipmentId === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(input.equipmentId) ? input.equipmentId : "",
  };
}

export function readProject(storage) {
  try {
    const stored = JSON.parse(storage?.getItem(DEVIS_STORAGE_KEY) || "null");
    return cleanProject(stored?.version === 1 ? stored.project : null);
  } catch { return { ...EMPTY_PROJECT }; }
}

export function saveProject(storage, project) {
  try {
    storage.setItem(DEVIS_STORAGE_KEY, JSON.stringify({ version: 1, project: cleanProject(project) }));
    return true;
  } catch { return false; }
}

export function forgetProject(storage) {
  try { storage.removeItem(DEVIS_STORAGE_KEY); return true; }
  catch { return false; }
}

// References older than 90 days require editorial review. This is an internal
// source-review interval, not a statement of legal validity or eligibility.
export function currentAidSources(sources, today = new Date().toISOString().slice(0, 10)) {
  const now = Date.parse(today);
  return (Array.isArray(sources) ? sources : []).filter((source) => {
    try {
      const url = new URL(source.url);
      const age = now - Date.parse(source.referencedOn);
      return url.protocol === "https:" && url.hostname === "france-renov.gouv.fr"
        && Number.isFinite(age) && age >= 0 && age <= 90 * 86400000;
    } catch { return false; }
  });
}

export function prepareProject(input, { sources = AID_SOURCES, today } = {}) {
  const project = cleanProject(input);
  const missing = [];
  if (!project.housing || project.housing === "unknown") missing.push("Le type de logement.");
  if (!project.occupancy || project.occupancy === "unknown") missing.push("Votre statut par rapport au logement.");
  if (!project.work) missing.push("Les travaux envisagés.");
  if (!project.currentEquipment || project.currentEquipment === "unknown") missing.push("Le type d’équipement actuel.");
  if (!/^\d{5}$/.test(project.postalCode)) missing.push("La localisation, si vous souhaitez vérifier les aides locales.");
  const energeticWork = ["heating", "hot_water", "insulation", "ventilation", "renovation"].includes(project.work);
  const availableSources = currentAidSources(sources, today).filter((source) => source.id === "simulation" || energeticWork);
  return {
    project, missing, sources: availableSources, amount: null, eligibility: "not_assessed",
    assumptions: [
      "Projet préparatoire : aucun devis signé, montant d’aide ou engagement n’est déduit des réponses.",
      "L’âge du logement, les performances des travaux, la situation réelle et les règles en vigueur restent à vérifier.",
    ],
    checklist: [
      "Relever la référence exacte de l’équipement et réunir les notices autorisées disponibles.",
      "Préciser la surface, l’âge du logement, son usage et les performances attendues avec un professionnel.",
      "Vérifier les aides et leur ordre de demande auprès du service public ou du financeur avant tout engagement.",
      "Vérifier les qualifications requises de l’entreprise pour les travaux et aides envisagés.",
      "Rassembler les devis, justificatifs et autorisations demandés par chaque organisme.",
      "Pour la simulation, renseigner uniquement le revenu fiscal utile ; envoyer les justificatifs fiscaux directement à l’organisme qui les demande.",
    ],
    quoteChecklist: [
      "Décrire le besoin du client, les contraintes d’accès et les constatations à confirmer lors de la visite.",
      "Distinguer fourniture, pose, adaptations, mise en service et évacuation des déchets.",
      "Renseigner références, quantités, prix, taxes, délais et conditions à partir de données vérifiées par le professionnel.",
      "Identifier les pièces administratives et aides à vérifier ; distinguer les aides potentielles des aides accordées.",
      "Faire valider les données techniques et le devis final par le professionnel responsable.",
    ],
  };
}

export function projectText(result, professional = false) {
  const p = result.project;
  const fields = [HOUSING_TYPES[p.housing], OCCUPANCY_TYPES[p.occupancy], WORK_TYPES[p.work], EQUIPMENT_TYPES[p.currentEquipment], p.postalCode].filter(Boolean);
  return ["Shiba Devis — dossier préparatoire gratuit", fields.join(" · "),
    "Estimation indicative sans calcul de montant. Éligibilité non évaluée ; aucun financement garanti.",
    "Informations à compléter :", ...result.missing, "Hypothèses :", ...result.assumptions,
    "Étapes à vérifier :", ...result.checklist,
    ...(professional ? ["Trame de préparation du devis :", ...result.quoteChecklist] : []),
    "Sources d’orientation (barèmes non intégrés) :", ...result.sources.map((s) => `${s.name} — ${s.url} — référencée le ${s.referencedOn} ; mise à jour éditoriale non connue.`),
  ].join("\n");
}
