// Initial proposal only. No seed is automatically validated or published.
// Source consulted 2026-10-07: Service Public F35083 (verified 2026-09-01).
// Cumulation guide is older: administrator must check September changes before validation.
export const initialAidDrafts = [
  {
    schemaVersion: 1,
    slug: "mpr-pac-air-eau-metropole",
    name: "MaPrimeRénov’ par geste — PAC air/eau en métropole",
    kind: "subsidy",
    geography: "metropolitan",
    work: ["heating"],
    effectiveFrom: "2026-09-01",
    effectiveUntil: "2026-12-31",
    freshnessDays: 30,
    conditions: [
      {
        field: "occupancy",
        op: "in",
        value: ["owner", "landlord"],
        label: "Propriétaire occupant ou bailleur.",
      },
      {
        field: "principalResidence",
        op: "eq",
        value: "yes",
        label: "Logement utilisé comme résidence principale.",
      },
      {
        field: "housingAge",
        op: "gte",
        value: 2,
        label:
          "Logement construit depuis au moins deux ans pour une PAC air/eau ; date à confirmer à la notification.",
      },
      {
        field: "plannedEquipment",
        op: "eq",
        value: "heat_pump_air_water",
        label: "Installation d’une pompe à chaleur air/eau.",
      },
      {
        field: "technicalCriteria",
        op: "eq",
        value: "yes",
        label:
          "Critères techniques de la PAC vérifiés dans les textes et le devis.",
      },
    ],
    formula: {
      type: "income_fixed",
      taxYear: 2025,
      bands: [
        { name: "Très modestes", amount: 5000 },
        { name: "Modestes", amount: 4000 },
        { name: "Intermédiaires", amount: 3000 },
      ],
      thresholds: {
        other: [
          [17363, 22259, 31185],
          [25393, 32553, 45842],
          [30540, 39148, 55196],
          [35676, 45735, 64550],
          [40835, 52348, 73907],
        ],
        idf: [
          [24031, 29253, 40851],
          [35270, 42933, 60051],
          [42357, 51564, 71846],
          [49455, 60208, 84562],
          [56580, 68877, 96817],
        ],
      },
      additional: { other: [5151, 6598, 9357], idf: [7116, 8663, 12257] },
    },
    caps: {
      eligibleCost: 12000,
      lifetimeAmount: 20000,
      mprCeeRates: [0.9, 0.75, 0.6],
      totalAidRate: 1,
    },
    cumulation:
      "MaPrimeRénov’ + CEE : écrêtement selon ressources ; total des aides plafonné. Historique MaPrimeRénov’ sur cinq ans à fournir. Les CEE saisis doivent provenir d’une offre documentée.",
    rge: { required: true, domain: "heat_pump_air_water" },
    remainingChecks: [
      "Accord final de l’Anah, période et disponibilité du dispositif.",
      "Qualifications et visite préalable du chantier.",
      "Engagement d’occupation ou de location, délais et justificatifs demandés.",
      "Plafonds de cumul : confirmer la version en vigueur avant publication.",
    ],
    sources: [
      {
        url: "https://www.service-public.gouv.fr/particuliers/vosdroits/F35083",
        consultedOn: "2026-10-07",
        editorialUpdatedOn: "2026-09-01",
      },
    ],
  },
  ...[
    [
      "cee",
      "Certificats d’économie d’énergie",
      "https://france-renov.gouv.fr/aides/cee",
      "Offre variable selon le fournisseur, les travaux, la date et les conditions ; aucun montant universel.",
    ],
    [
      "eco-ptz",
      "Éco-prêt à taux zéro",
      "https://france-renov.gouv.fr/aides/eco-pret-taux-zero",
      "Financement à rembourser, pas une subvention ; vérifier conditions et plafond auprès de la banque.",
    ],
    [
      "aides-locales",
      "Aides locales",
      "https://france-renov.gouv.fr/aides/simulation",
      "Rechercher les aides de la collectivité pour la localisation et les travaux ; montant non évalué.",
    ],
  ].map(([slug, name, url, notes]) => ({
    schemaVersion: 1,
    slug,
    name,
    kind: "orientation",
    geography: "France",
    effectiveFrom: "2026-10-07",
    effectiveUntil: null,
    freshnessDays: 30,
    conditions: [],
    sources: [{ url, consultedOn: "2026-10-07", editorialUpdatedOn: null }],
    notes,
  })),
];
