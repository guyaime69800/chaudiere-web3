// Only manufacturer-hosted or explicitly public user manuals belong here.
// Never add a professional PDF or an installation procedure to this list.
export const PUBLIC_USER_MANUAL_MODELS = [
  { equipmentId: "public-airwell-hdla-022n-09m25", brand: "Airwell", model: "HDLA-022N-09M25", manufacturerReference: "HDLA-022N-09M25" },
];
const airwellHdlaManual = {
  id: "airwell-hdla-022n-09m25-user",
  title: "Notice d’utilisation Airwell HDLA-022N-09M25",
  url: "https://lh.airwell-res.com/sites/default/files/product_uploads/23.AW_.HDLA_.09-24.R32.UM%2BIM.EN_.FR_.DE_.IT_.SP_.POR_.NL_.05.22.pdf",
  publisher: "Airwell",
  firstPage: 40,
  description: "Notice officielle du fabricant. La partie française « Manuel de propriétaire » commence à la page 40 ; la partie installation est réservée aux professionnels.",
  topics: [
    {
      keywords: ["filtre", "nettoyer", "nettoyage", "entretien"],
      answer: "La notice prévoit un nettoyage régulier du filtre à air. Arrêtez et débranchez l’appareil avant de le retirer ; nettoyez-le avec un détergent doux, rincez-le et laissez-le sécher à l’ombre avant de le remettre en place.",
      page: 11,
      pdfPage: 50,
    },
    {
      keywords: ["cl", "rappel filtre", "voyant filtre"],
      answer: "L’indication « CL » correspond, selon la notice, au rappel de nettoyage du filtre après 240 heures d’utilisation. Nettoyez d’abord le filtre ; la notice indique ensuite la remise à zéro du voyant avec la télécommande ou la commande manuelle.",
      page: 12,
      pdfPage: 51,
    },
    {
      keywords: ["nf", "remplacer filtre", "changement filtre"],
      answer: "L’indication « nF » correspond au rappel de remplacement du filtre après 2 880 heures d’utilisation. La notice décrit la remise à zéro du voyant après remplacement.",
      page: 12,
      pdfPage: 51,
    },
    {
      keywords: ["veille", "sommeil", "nuit"],
      answer: "La fonction Veille ajuste progressivement la température pendant la nuit pour réduire la consommation. Elle s’active avec la télécommande et n’est pas disponible en mode ventilation ou déshumidification.",
      page: 9,
      pdfPage: 48,
    },
    {
      keywords: ["volet", "flux d air", "orientation", "souffle"],
      answer: "La notice recommande de régler l’orientation verticale du flux d’air avec la télécommande. Évitez un angle trop vertical longtemps en mode refroidissement ou déshumidification, car de la condensation peut se former.",
      page: 10,
      pdfPage: 49,
    },
    {
      keywords: ["ne demarre", "ne s allume", "trois minutes", "3 minutes"],
      answer: "Après un arrêt, l’appareil peut attendre trois minutes avant de redémarrer : c’est une protection décrite dans la notice. Si le problème persiste, contactez un professionnel.",
      page: 13,
      pdfPage: 52,
    },
    {
      keywords: ["odeur", "bruit", "fumee", "fuite", "erreur", "panne"],
      answer: "En présence d’une odeur de brûlé, d’un bruit anormal important, d’un cordon endommagé ou d’un écoulement inhabituel, la notice demande d’arrêter l’appareil et de contacter un service agréé. N’essayez pas de le réparer vous-même.",
      page: 13,
      pdfPage: 52,
    },
  ],
};

// Manufacturer user booklet U0619437_1903_FR_33, reviewed 2026-10-24.
// Exact reference only: do not infer coverage for Micro, Duo or NAEMA 3.
const atlanticNaema2Manual = {
  id: "atlantic-naema-2-021240-user",
  title: "Notice d’utilisation Atlantic NAEMA 2 — 021240",
  publisher: "Atlantic",
  url: "https://fra-connect.mo.cloudinary.net/PRODUCT/DOCUMENT/1760/55128616NOTICE2.pdf?ts=1741651619072",
  firstPage: 1,
  description: "Notice d’utilisation Atlantic NAEMA 2. Les opérations d’installation, d’entretien et de réparation restent réservées aux professionnels qualifiés.",
  topics: [
    { keywords: ["programme", "programmer", "programmation", "horaire", "horaires", "navilink"],
      answer: "Avec un Navilink 105, 125 ou 128, le programme horaire se règle sur la sonde d’ambiance, pas sur l’interface de la chaudière. Pour un autre thermostat, consultez les indications correspondant à votre configuration dans la notice.", page: 6, pdfPage: 6 },
    { keywords: ["absence", "vacances"],
      answer: "Pour une absence prolongée, le mode absence éventuel se règle sur la sonde ou le thermostat. Consultez aussi la notice de cet accessoire ; sa présence et ses fonctions dépendent de votre installation.", page: 6, pdfPage: 6 },
    { keywords: ["panne", "erreur", "reparation", "demontage"],
      answer: "En cas de panne ou de fonctionnement anormal, ne tentez pas de réparation directe. Contactez le professionnel qui suit l’installation. La notice réserve les interventions techniques aux professionnels qualifiés.", page: 3, pdfPage: 3 },
  ],
};

const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function getPublicUserManual(equipment) {
  const brand = normalize(equipment?.brand || equipment?.identity?.brand);
  const exactReferences = [equipment?.manufacturerReference, equipment?.productReference]
    .map(value => normalize(value).replace(/ /g, ""));
  if (brand === "atlantic" && exactReferences.some(value => ["021240", "naema212021240"].includes(value))) return atlanticNaema2Manual;
  const reference = normalize([
    equipment?.manufacturerReference,
    equipment?.productReference,
    equipment?.model,
    equipment?.identity?.model,
  ].filter(Boolean).join(" "));
  return brand === "airwell" && /(?:^| )hdla 022n 09m25(?:$| )/.test(reference) ? airwellHdlaManual : null;
}

export function answerFromPublicUserManual(manual, question) {
  if (!manual || typeof question !== "string" || !question.trim()) return null;
  const normalized = normalize(question);
  if (/\b(install|installer|installation|demont|repar|raccord|cabl|frigorif|refrigerant|compresseur)\w*\b/.test(normalized)) {
    return { answer: "Cette opération relève d’un professionnel. Shiba ne répond ici qu’aux questions d’utilisation couvertes par la notice publique.", page: null, pdfPage: null };
  }
  const scored = manual.topics.map((topic) => ({
    topic,
    score: topic.keywords.reduce((total, keyword) => total + (` ${normalized} `.includes(` ${keyword} `) ? Math.max(keyword.length, keyword.length <= 2 ? 30 : 0) : 0), 0),
  })).sort((left, right) => right.score - left.score)[0];
  return scored?.score ? scored.topic : null;
}
