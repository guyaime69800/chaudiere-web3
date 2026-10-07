export const ESTIMATE_NOTICE =
  "Estimation indicative, sous réserve des conditions en vigueur et de l’accord des organismes concernés.";
export const OFFICIAL_AID_HOSTS = new Set([
  "france-renov.gouv.fr",
  "www.service-public.gouv.fr",
  "www.anah.gouv.fr",
  "www.legifrance.gouv.fr",
  "www.ecologie.gouv.fr",
]);
export const PROJECT_FIELDS = [
  "postalCode",
  "occupancy",
  "housing",
  "work",
  "currentEquipment",
  "equipmentId",
  "householdSize",
  "taxIncome",
  "taxYear",
  "housingAge",
  "principalResidence",
  "plannedEquipment",
  "budget",
  "eligibleCost",
  "otherGrants",
  "ceeAmount",
  "previousMpr",
  "workDate",
  "rgeDeclaration",
  "technicalCriteria",
];
const numeric = new Set([
  "householdSize",
  "taxIncome",
  "taxYear",
  "housingAge",
  "budget",
  "eligibleCost",
  "otherGrants",
  "ceeAmount",
  "previousMpr",
]);
export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function projectInput(input) {
  const result = {};
  for (const field of PROJECT_FIELDS) {
    const value = input?.[field];
    if (value === "" || value === null || value === undefined) continue;
    if (numeric.has(field)) {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 10000000)
        throw new Error(`Valeur invalide : ${field}`);
      result[field] = n;
    } else if (typeof value === "string" && value.length <= 120)
      result[field] = value.trim();
    else throw new Error(`Valeur invalide : ${field}`);
  }
  if (
    result.householdSize !== undefined &&
    (!Number.isInteger(result.householdSize) ||
      result.householdSize < 1 ||
      result.householdSize > 20)
  )
    throw new Error("Composition du foyer invalide.");
  if (result.postalCode && !/^\d{5}$/.test(result.postalCode))
    throw new Error("Code postal invalide.");
  if (result.workDate && !validDate(result.workDate))
    throw new Error("Date invalide.");
  if (
    result.taxYear !== undefined &&
    (!Number.isInteger(result.taxYear) ||
      result.taxYear < 2000 ||
      result.taxYear > 2100)
  )
    throw new Error("Année fiscale invalide.");
  return result;
}
export function officialSource(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      parsed.port === "" &&
      OFFICIAL_AID_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}
export function validateAidRule(rule) {
  if (
    !rule ||
    rule.schemaVersion !== 1 ||
    !/^[a-z0-9-]{3,80}$/.test(rule.slug || "") ||
    !rule.name ||
    rule.name.length > 200
  )
    throw new Error("Identité du dispositif invalide.");
  if (!["subsidy", "loan", "orientation"].includes(rule.kind))
    throw new Error("Type du dispositif invalide.");
  if (
    !Array.isArray(rule.sources) ||
    !rule.sources.length ||
    rule.sources.length > 8 ||
    rule.sources.some(
      (s) =>
        !officialSource(s.url) ||
        !validDate(s.consultedOn) ||
        (s.editorialUpdatedOn && !validDate(s.editorialUpdatedOn)),
    )
  )
    throw new Error("Sources officielles datées requises.");
  if (
    !validDate(rule.effectiveFrom) ||
    (rule.effectiveUntil &&
      (!validDate(rule.effectiveUntil) ||
        rule.effectiveUntil < rule.effectiveFrom))
  )
    throw new Error("Période invalide.");
  if (
    !["metropolitan", "France"].includes(rule.geography) ||
    (rule.work &&
      (!Array.isArray(rule.work) ||
        rule.work.some((w) => typeof w !== "string" || w.length > 80)))
  )
    throw new Error("Périmètre invalide.");
  if (
    !Number.isInteger(rule.freshnessDays) ||
    rule.freshnessDays < 1 ||
    rule.freshnessDays > 366
  )
    throw new Error("Fraîcheur invalide.");
  if (
    !Array.isArray(rule.conditions) ||
    rule.conditions.length > 30 ||
    rule.conditions.some(
      (c) =>
        !PROJECT_FIELDS.includes(c.field) ||
        !["eq", "in", "gte", "lte"].includes(c.op) ||
        (c.op === "in" && (!Array.isArray(c.value) || c.value.length > 100)) ||
        (["gte", "lte"].includes(c.op) && !Number.isFinite(c.value)) ||
        typeof c.label !== "string" ||
        c.label.length > 1000,
    )
  )
    throw new Error("Conditions invalides.");
  const f = rule.formula;
  if (
    rule.kind !== "orientation" &&
    (!f || !["fixed", "income_fixed"].includes(f.type))
  )
    throw new Error("Formule non prise en charge.");
  if (f?.type === "fixed" && (!Number.isFinite(f.amount) || f.amount < 0))
    throw new Error("Montant invalide.");
  if (
    f?.type === "income_fixed" &&
    (!Array.isArray(f.bands) ||
      f.bands.length !== 3 ||
      f.bands.some((b) => !Number.isFinite(b.amount) || b.amount < 0) ||
      !["idf", "other"].every(
        (region) =>
          Array.isArray(f.thresholds?.[region]) &&
          f.thresholds[region].length === 5 &&
          f.thresholds[region].every(
            (row) =>
              Array.isArray(row) &&
              row.length === 3 &&
              row.every(
                (v, i) =>
                  Number.isFinite(v) && v >= 0 && (i === 0 || v >= row[i - 1]),
              ),
          ),
      ) ||
      !["idf", "other"].every(
        (region) =>
          f.additional?.[region]?.length === 3 &&
          f.additional[region].every((v) => Number.isFinite(v) && v >= 0),
      ))
  )
    throw new Error("Barème de ressources incomplet.");
  const caps = rule.caps || {};
  for (const field of ["eligibleCost", "lifetimeAmount", "totalAidRate"])
    if (
      caps[field] !== undefined &&
      (!Number.isFinite(caps[field]) || caps[field] < 0)
    )
      throw new Error("Plafond invalide.");
  if (
    caps.totalAidRate > 1 ||
    (caps.mprCeeRates &&
      (caps.mprCeeRates.length !== 3 ||
        caps.mprCeeRates.some((v) => !Number.isFinite(v) || v < 0 || v > 1)))
  )
    throw new Error("Écrêtement invalide.");
  return rule;
}
export function qualifiedRge(
  record,
  { siret, domain, date, today = new Date().toISOString().slice(0, 10) },
) {
  if (!record)
    return {
      status: "non_verified",
      message: "Qualification absente ou non vérifiée.",
    };
  if (
    !validDate(record.valid_from) ||
    !validDate(record.valid_until) ||
    !validDate(date) ||
    record.valid_until < record.valid_from
  )
    return {
      status: "non_verified",
      message: "Dates de qualification absentes ou invalides.",
    };
  if (record.valid_until < date || record.valid_until < today)
    return {
      status: "expired",
      message: "Qualification expirée à la date pertinente.",
    };
  if (
    record.siret !== siret ||
    !record.domains?.includes(domain) ||
    record.valid_from > date
  )
    return {
      status: "unsuitable",
      message: "Entreprise, domaine ou période de qualification inadaptés.",
    };
  if (
    !record.verified_by ||
    !record.verified_at ||
    !officialSource(record.verification_source) ||
    !Number.isFinite(Date.parse(record.verified_at)) ||
    Date.parse(record.verified_at) > Date.parse(today + "T23:59:59Z") ||
    Date.parse(today) - Date.parse(record.verified_at) > 90 * 86400000
  )
    return {
      status: "declared",
      message:
        "Déclaration à contrôler dans l’annuaire officiel (contrôle de moins de 90 jours requis).",
    };
  return {
    status: "verified",
    message:
      "Correspondance entreprise, domaine et dates vérifiée par l’équipe.",
  };
}
function usable(row, today) {
  const r = row.rule;
  const age = Date.parse(today) - Date.parse(row.validated_at?.slice(0, 10));
  return (
    row.status === "published" &&
    row.validated_by &&
    Number.isFinite(age) &&
    age >= 0 &&
    age <= r.freshnessDays * 86400000 &&
    r.effectiveFrom <= today &&
    (!r.effectiveUntil || today <= r.effectiveUntil) &&
    r.sources.every(
      (s) =>
        s.consultedOn <= today &&
        Date.parse(today) - Date.parse(s.consultedOn) <=
          r.freshnessDays * 86400000,
    )
  );
}
export function simulateAid(
  project,
  versions,
  {
    today = new Date().toISOString().slice(0, 10),
    rge = null,
    siret = null,
    sourceStates = null,
  } = {},
) {
  const input = projectInput(project);
  const aids = [];
  for (const row of versions) {
    const r = validateAidRule(row.rule);
    const item = {
      id: row.id,
      version: row.version,
      name: r.name,
      slug: r.slug,
      kind: r.kind,
      sources: r.sources,
      validatedAt: row.validated_at,
      status: "not_evaluated",
      amount: null,
      missing: [],
      conditions: [],
      rge: null,
    };
    const sourcesFresh =
      !sourceStates ||
      r.sources.every((s) => {
        const state = sourceStates.find((x) => x.url === s.url),
          age =
            Date.parse(today) -
            Date.parse(state?.last_success_at?.slice(0, 10));
        return (
          state &&
          Number.isFinite(age) &&
          age >= 0 &&
          age <= Math.min(r.freshnessDays, state.freshness_days) * 86400000
        );
      });
    if (!usable(row, today) || !sourcesFresh) {
      item.conditions.push(
        "Référentiel non publié, hors période ou trop ancien : vérifier auprès du service public.",
      );
      aids.push(item);
      continue;
    }
    if (r.work && !r.work.includes(input.work)) continue;
    if (
      r.geography === "metropolitan" &&
      (!input.postalCode || ["97", "98"].includes(input.postalCode.slice(0, 2)))
    ) {
      item.missing.push("Localisation métropolitaine à préciser.");
      aids.push(item);
      continue;
    }
    for (const c of r.conditions) {
      if (input[c.field] === undefined) {
        item.missing.push(c.label);
        continue;
      }
      const value = input[c.field];
      const passes =
        c.op === "eq"
          ? value === c.value
          : c.op === "in"
            ? c.value.includes(value)
            : c.op === "gte"
              ? value >= c.value
              : value <= c.value;
      if (!passes) item.conditions.push(c.label);
    }
    if (r.rge?.required) {
      item.rge = qualifiedRge(rge, {
        siret,
        domain: r.rge.domain,
        date: input.workDate || today,
        today,
      });
      if (
        item.rge.status !== "verified" &&
        (input.rgeDeclaration !== "yes" ||
          ["expired", "unsuitable"].includes(item.rge.status))
      )
        item.conditions.push(
          `${item.rge.message} Le devis peut être préparé, l’aide reste à confirmer.`,
        );
    }
    if (r.kind === "orientation") {
      item.conditions.push(
        r.notes || "Montant variable à vérifier auprès du financeur.",
      );
      aids.push(item);
      continue;
    }
    const f = r.formula;
    let amount = f.amount;
    let band = 0;
    if (f.type === "income_fixed") {
      for (const field of [
        "householdSize",
        "taxIncome",
        "taxYear",
        "postalCode",
      ])
        if (input[field] === undefined) item.missing.push(field);
      if (input.taxYear !== undefined && input.taxYear !== f.taxYear)
        item.conditions.push(
          `Revenu fiscal de l’année ${f.taxYear} nécessaire.`,
        );
      if (!item.missing.length) {
        const region = [
          "75",
          "77",
          "78",
          "91",
          "92",
          "93",
          "94",
          "95",
        ].includes(input.postalCode.slice(0, 2))
          ? "idf"
          : "other";
        const size = input.householdSize;
        const thresholds = f.thresholds[region][Math.min(size, 5) - 1]?.map(
          (v, i) => v + Math.max(size - 5, 0) * f.additional[region][i],
        );
        band = thresholds?.findIndex((v) => input.taxIncome <= v) ?? -1;
        if (band === -1)
          item.conditions.push(
            "Ressources hors des catégories couvertes par ce dispositif.",
          );
        else amount = f.bands[band].amount;
      }
    }
    for (const field of [
      "budget",
      "eligibleCost",
      "otherGrants",
      "ceeAmount",
      "previousMpr",
      "workDate",
    ])
      if (input[field] === undefined) item.missing.push(field);
    if (
      input.workDate &&
      (input.workDate < r.effectiveFrom ||
        (r.effectiveUntil && input.workDate > r.effectiveUntil))
    )
      item.conditions.push("Calendrier hors de la période publiée.");
    if (input.eligibleCost > input.budget)
      item.conditions.push("Dépense éligible supérieure au devis total.");
    if (item.missing.length || item.conditions.length) {
      aids.push(item);
      continue;
    }
    const cost = Math.min(input.eligibleCost, r.caps?.eligibleCost ?? Infinity);
    amount = Math.min(
      amount,
      cost,
      Math.max(0, (r.caps?.lifetimeAmount ?? Infinity) - input.previousMpr),
    );
    if (r.caps?.mprCeeRates)
      amount = Math.min(
        amount,
        Math.max(0, cost * r.caps.mprCeeRates[band] - input.ceeAmount),
      );
    amount = Math.min(
      amount,
      Math.max(
        0,
        cost * (r.caps?.totalAidRate ?? 1) -
          input.otherGrants -
          input.ceeAmount,
      ),
    );
    item.amount = Math.round(amount * 100) / 100;
    item.status = "estimated";
    item.conditions.push(...(r.remainingChecks || []));
    item.caps = r.caps;
    item.cumulation = r.cumulation;
    aids.push(item);
  }
  const subsidy = aids.filter((a) => a.kind === "subsidy");
  const calculated = subsidy.filter((a) => a.amount !== null);
  // Missing aids never silently become zero; only partial, explicitly scoped totals.
  const knownTotal =
    calculated.reduce((s, a) => s + a.amount, 0) +
    (input.otherGrants || 0) +
    (input.ceeAmount || 0);
  const allEvaluated =
    subsidy.length > 0 &&
    subsidy.length === calculated.length &&
    knownTotal <= input.budget;
  return {
    schemaVersion: 1,
    createdAt: today,
    notice: ESTIMATE_NOTICE,
    input,
    aids,
    subtotal: calculated.length
      ? Math.round(calculated.reduce((s, a) => s + a.amount, 0) * 100) / 100
      : null,
    remaining:
      allEvaluated &&
      input.budget !== undefined &&
      input.otherGrants !== undefined &&
      input.ceeAmount !== undefined
        ? Math.max(
            0,
            input.budget -
              calculated.reduce((s, a) => s + a.amount, 0) -
              input.otherGrants -
              input.ceeAmount,
          )
        : null,
    scope:
      "Uniquement les dispositifs calculés ci-dessous ; CEE et aides locales non évalués sauf montants documentés saisis.",
    rules: versions.map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status,
      validatedAt: v.validated_at,
      rule: v.rule,
    })),
  };
}
