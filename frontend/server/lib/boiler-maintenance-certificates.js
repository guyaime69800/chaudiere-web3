import { createClient } from "@supabase/supabase-js";
import { requireVerifiedCompany } from "./require-verified-company.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_BODY_BYTES = 30_000;

const CERTIFICATE_READ_COLUMNS = [
  "id",
  "intervention_id",
  "company_id",
  "equipment_id",
  "technician_id",
  "status",
  "document_version",
  "certificate_number",
  "company_snapshot",
  "equipment_snapshot",
  "customer_snapshot",
  "installation_snapshot",
  "technician_snapshot",
  "boiler_energy",
  "flue_exhaust_type",
  "commissioning_date",
  "nominal_power_kw",
  "forced_air_burner",
  "previous_maintenance_date",
  "previous_chimney_sweeping_date",
  "controlled_points",
  "measuring_instruments",
  "measurements",
  "ambient_co_ppm",
  "ambient_co_status",
  "boiler_efficiency_percent",
  "reference_efficiency_percent",
  "pollutant_emissions",
  "advice_good_use",
  "advice_improvements",
  "advice_replacement",
  "boiler_energy_class",
  "replacement_energy_classes",
  "technician_signature",
  "created_at",
  "updated_at",
  "issued_at",
].join(", ");

function requestError(status, code, publicMessage) {
  const error = new Error(code);

  error.status = status;
  error.code = code;
  error.publicMessage = publicMessage;

  return error;
}

function createAdminSupabase() {
  const url = process.env.VITE_SUPABASE_URL;

  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw requestError(
      503,
      "DATABASE_CONFIGURATION_MISSING",
      "Le service des attestations est indisponible."
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function normalizeSnapshot(value, code, publicMessage) {
  if (value === undefined || value === null) {
    return {};
  }

  if (!isPlainObject(value)) {
    throw requestError(400, code, publicMessage);
  }

  const serialized = JSON.stringify(value);

  if (serialized.length > 8_000) {
    throw requestError(400, code, publicMessage);
  }

  return value;
}

function validatePostBody(body) {
  if (!isPlainObject(body)) {
    throw requestError(
      400,
      "BODY_INVALID",
      "Les données de l’attestation sont invalides."
    );
  }

  const serialized = JSON.stringify(body);

  if (Buffer.byteLength(serialized, "utf8") > MAX_BODY_BYTES) {
    throw requestError(
      413,
      "BODY_TOO_LARGE",
      "Les données de l’attestation sont trop volumineuses."
    );
  }

  const allowedFields = new Set([
    "interventionId",
    "customer",
    "installation",
  ]);

  for (const field of Object.keys(body)) {
    if (!allowedFields.has(field)) {
      throw requestError(
        400,
        "FIELD_FORBIDDEN",
        "Les données de l’attestation contiennent un champ non autorisé."
      );
    }
  }

  if (
    typeof body.interventionId !== "string" ||
    !UUID_PATTERN.test(body.interventionId.trim())
  ) {
    throw requestError(
      400,
      "INTERVENTION_ID_INVALID",
      "L’intervention sélectionnée est invalide."
    );
  }

  return {
    interventionId: body.interventionId.trim().toLowerCase(),
    customer: normalizeSnapshot(
      body.customer,
      "CUSTOMER_INVALID",
      "Les informations du commanditaire sont invalides."
    ),
    installation: normalizeSnapshot(
      body.installation,
      "INSTALLATION_INVALID",
      "Les informations de l’installation sont invalides."
    ),
  };
}
function normalizeOptionalText(value, fieldName, maxLength = 2_000) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw requestError(
      400,
      "FIELD_INVALID",
      `${fieldName} est invalide.`
    );
  }

  const normalized = value.trim();

  if (normalized.length > maxLength) {
    throw requestError(
      400,
      "FIELD_TOO_LONG",
      `${fieldName} est trop long.`
    );
  }

  return normalized || null;
}

function normalizeOptionalNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = Number(value);

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw requestError(
      400,
      "NUMBER_INVALID",
      `${fieldName} est invalide.`
    );
  }

  return normalized;
}

function normalizeOptionalDate(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw requestError(
      400,
      "DATE_INVALID",
      `${fieldName} est invalide.`
    );
  }

  return value;
}

function normalizeStringArray(value, fieldName) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value) || value.length > 50) {
    throw requestError(
      400,
      "ARRAY_INVALID",
      `${fieldName} est invalide.`
    );
  }

  return value.map((item) => {
    if (typeof item !== "string") {
      throw requestError(
        400,
        "ARRAY_INVALID",
        `${fieldName} est invalide.`
      );
    }

    return item.trim().slice(0, 300);
  }).filter(Boolean);
}
function normalizeJsonObject(
  value,
  fieldName,
  { nullable = false, maxLength = 8_000 } = {}
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return nullable ? null : {};
  }

  if (!isPlainObject(value)) {
    throw requestError(
      400,
      "OBJECT_INVALID",
      `${fieldName} est invalide.`
    );
  }

  const serialized = JSON.stringify(value);

  if (serialized.length > maxLength) {
    throw requestError(
      400,
      "OBJECT_TOO_LARGE",
      `${fieldName} contient trop d’informations.`
    );
  }

  return value;
}

function validatePatchBody(body) {
  if (!isPlainObject(body)) {
    throw requestError(
      400,
      "BODY_INVALID",
      "Les données du brouillon sont invalides."
    );
  }

  if (
    typeof body.certificateId !== "string" ||
    !UUID_PATTERN.test(body.certificateId.trim())
  ) {
    throw requestError(
      400,
      "CERTIFICATE_ID_INVALID",
      "Le brouillon sélectionné est invalide."
    );
  }

  const ambientCoPpm = normalizeOptionalNumber(
    body.ambientCoPpm,
    "La mesure de monoxyde de carbone"
  );

  let ambientCoStatus = null;

  if (ambientCoPpm !== null) {
    ambientCoStatus =
      ambientCoPpm < 10
        ? "normal"
        : ambientCoPpm < 50
          ? "anomaly"
          : "serious_immediate_danger";
  }

  return {
    certificateId: body.certificateId.trim().toLowerCase(),
    boilerEnergy: normalizeOptionalText(
      body.boilerEnergy,
      "L’énergie de la chaudière",
      100
    ),
    flueExhaustType: normalizeOptionalText(
      body.flueExhaustType,
      "Le type d’évacuation",
      100
    ),
    commissioningDate: normalizeOptionalDate(
      body.commissioningDate,
      "La date de mise en service"
    ),
    nominalPowerKw: normalizeOptionalNumber(
      body.nominalPowerKw,
      "La puissance nominale"
    ),
    forcedAirBurner: normalizeJsonObject(
      body.forcedAirBurner,
      "Les informations du brûleur à air soufflé",
      { nullable: true }
    ),
    previousMaintenanceDate: normalizeOptionalDate(
      body.previousMaintenanceDate,
      "La date du précédent entretien"
    ),
    previousChimneySweepingDate: normalizeOptionalDate(
      body.previousChimneySweepingDate,
      "La date du précédent ramonage"
    ),
    controlledPoints: normalizeStringArray(
      body.controlledPoints,
      "Les points contrôlés"
    ),
    measuringInstruments: normalizeStringArray(
      body.measuringInstruments,
      "Les appareils de mesure"
    ),
    measurements: normalizeJsonObject(
      body.measurements,
      "Les mesures techniques"
    ),
    ambientCoPpm,
    ambientCoStatus,
    boilerEfficiencyPercent: normalizeOptionalNumber(
      body.boilerEfficiencyPercent,
      "Le rendement de la chaudière"
    ),
    referenceEfficiencyPercent: normalizeOptionalNumber(
      body.referenceEfficiencyPercent,
      "Le rendement de référence"
    ),
    pollutantEmissions: normalizeJsonObject(
      body.pollutantEmissions,
      "Les émissions polluantes"
    ),
    adviceGoodUse: normalizeOptionalText(
      body.adviceGoodUse,
      "Les conseils de bon usage"
    ),
    adviceImprovements: normalizeOptionalText(
      body.adviceImprovements,
      "Les conseils d’amélioration"
    ),
    adviceReplacement: normalizeOptionalText(
      body.adviceReplacement,
      "Les conseils de remplacement"
    ),
    boilerEnergyClass: normalizeOptionalText(
      body.boilerEnergyClass,
      "La classe énergétique",
      20
    ),
    replacementEnergyClasses: normalizeStringArray(
      body.replacementEnergyClasses,
      "Les classes énergétiques de remplacement"
    ),
  };
}
function serializeCertificate(certificate) {
  return {
    id: certificate.id,
    interventionId: certificate.intervention_id,
    companyId: certificate.company_id,
    equipmentId: certificate.equipment_id,
    technicianId: certificate.technician_id,
    status: certificate.status,
    documentVersion: certificate.document_version,
    certificateNumber: certificate.certificate_number,
    companySnapshot: certificate.company_snapshot,
    equipmentSnapshot: certificate.equipment_snapshot,
    customerSnapshot: certificate.customer_snapshot,
    installationSnapshot: certificate.installation_snapshot,
    technicianSnapshot: certificate.technician_snapshot,
    boilerEnergy: certificate.boiler_energy,
    flueExhaustType: certificate.flue_exhaust_type,
    commissioningDate: certificate.commissioning_date,
    nominalPowerKw: certificate.nominal_power_kw,
    forcedAirBurner: certificate.forced_air_burner,
    previousMaintenanceDate:
      certificate.previous_maintenance_date,
    previousChimneySweepingDate:
      certificate.previous_chimney_sweeping_date,
    controlledPoints: certificate.controlled_points,
    measuringInstruments: certificate.measuring_instruments,
    measurements: certificate.measurements,
    ambientCoPpm: certificate.ambient_co_ppm,
    ambientCoStatus: certificate.ambient_co_status,
    boilerEfficiencyPercent:
      certificate.boiler_efficiency_percent,
    referenceEfficiencyPercent:
      certificate.reference_efficiency_percent,
    pollutantEmissions: certificate.pollutant_emissions,
    adviceGoodUse: certificate.advice_good_use,
    adviceImprovements: certificate.advice_improvements,
    adviceReplacement: certificate.advice_replacement,
    boilerEnergyClass: certificate.boiler_energy_class,
    replacementEnergyClasses:
      certificate.replacement_energy_classes,
    technicianSignature: certificate.technician_signature,
    createdAt: certificate.created_at,
    updatedAt: certificate.updated_at,
    issuedAt: certificate.issued_at,
  };
}

async function readCertificates(req, res) {
  const creator = await requireVerifiedCompany(req, res);

  if (!creator) return;

  const supabase = createAdminSupabase();

  const { data, error, count } = await supabase
    .from("boiler_maintenance_certificates")
    .select(CERTIFICATE_READ_COLUMNS, {
      count: "exact",
    })
    .eq("company_id", creator.companyId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw requestError(
      503,
      "CERTIFICATES_READ_FAILED",
      "Les attestations sont momentanément indisponibles."
    );
  }

  const certificates = Array.isArray(data) ? data : [];

  return res.status(200).json({
    ok: true,
    total: count ?? certificates.length,
    certificates: certificates.map(serializeCertificate),
  });
}

async function createDraftCertificate(req, res) {
  const contentType = req.headers?.["content-type"];

  if (
    typeof contentType !== "string" ||
    !contentType.toLowerCase().startsWith("application/json")
  ) {
    throw requestError(
      415,
      "JSON_REQUIRED",
      "La requête doit contenir des données JSON."
    );
  }

  const creator = await requireVerifiedCompany(req, res);

  if (!creator) return;

  const input = validatePostBody(req.body);
  const supabase = createAdminSupabase();

  const { data: intervention, error: interventionError } =
    await supabase
      .from("interventions")
      .select(
        [
          "id",
          "company_id",
          "equipment_id",
          "technician_id",
          "intervention_type",
          "intervention_at",
          "polygon_state",
        ].join(", ")
      )
      .eq("id", input.interventionId)
      .eq("company_id", creator.companyId)
      .maybeSingle();

  if (interventionError) {
    throw requestError(
      503,
      "INTERVENTION_READ_FAILED",
      "La vérification de l’intervention est indisponible."
    );
  }

  if (!intervention) {
    throw requestError(
      404,
      "INTERVENTION_NOT_FOUND",
      "Cette intervention est introuvable."
    );
  }

  if (intervention.intervention_type !== "maintenance") {
    throw requestError(
      409,
      "MAINTENANCE_REQUIRED",
      "Une attestation chaudière exige une intervention d’entretien."
    );
  }

  if (intervention.polygon_state !== "confirmed") {
    throw requestError(
      409,
      "POLYGON_CONFIRMATION_REQUIRED",
      "La preuve Polygon doit être confirmée avant de préparer l’attestation."
    );
  }

  if (intervention.technician_id !== creator.userId) {
    throw requestError(
      403,
      "TECHNICIAN_MISMATCH",
      "Seul le technicien ayant enregistré l’intervention peut préparer cette attestation."
    );
  }

  const [
    companyResult,
    equipmentResult,
    profileResult,
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, siret, phone")
      .eq("id", creator.companyId)
      .single(),

    supabase
      .from("equipments")
      .select(
        "id, company_id, equipment_type, brand, model, product_reference, serial_number"
      )
      .eq("id", intervention.equipment_id)
      .eq("company_id", creator.companyId)
      .single(),

    supabase
      .from("profiles")
      .select("id, full_name, job_title")
      .eq("id", creator.userId)
      .single(),
  ]);

  if (
    companyResult.error ||
    equipmentResult.error ||
    profileResult.error
  ) {
    console.error("SNAPSHOT_READ_FAILED", {
      company: companyResult.error,
      equipment: equipmentResult.error,
      profile: profileResult.error,
    });
    throw requestError(
      503,
      "SNAPSHOT_READ_FAILED",
      "Les informations nécessaires à l’attestation sont indisponibles."
    );
  }

  const company = companyResult.data;
  const equipment = equipmentResult.data;
  const profile = profileResult.data;

  if (equipment.equipment_type !== "boiler") {
    throw requestError(
      409,
      "BOILER_REQUIRED",
      "L’équipement sélectionné n’est pas une chaudière."
    );
  }

  const companySnapshot = {
    id: company.id,
    name: company.name,
    siret: company.siret,
    phone: company.phone,
  };

  const equipmentSnapshot = {
    id: equipment.id,
    equipmentType: equipment.equipment_type,
    brand: equipment.brand,
    model: equipment.model,
    productReference: equipment.product_reference,
    serialNumber: equipment.serial_number,
  };

  const technicianSnapshot = {
    id: profile.id,
    fullName: profile.full_name,
    jobTitle: profile.job_title,
    email: creator.email,
    companyPhone: company.phone,
    role: creator.role,
  };

  const { data: existing, error: existingError } =
    await supabase
      .from("boiler_maintenance_certificates")
      .select(CERTIFICATE_READ_COLUMNS)
      .eq("intervention_id", intervention.id)
      .maybeSingle();

  if (existingError) {
    throw requestError(
      503,
      "CERTIFICATE_LOOKUP_FAILED",
      "La vérification de l’attestation est indisponible."
    );
  }

  if (existing) {
    return res.status(200).json({
      ok: true,
      alreadyExists: true,
      certificate: serializeCertificate(existing),
    });
  }

  const { data: certificate, error: insertError } =
    await supabase
      .from("boiler_maintenance_certificates")
      .insert({
        intervention_id: intervention.id,
        company_id: creator.companyId,
        equipment_id: equipment.id,
        technician_id: creator.userId,
        status: "draft",
        document_version: 1,
        company_snapshot: companySnapshot,
        equipment_snapshot: equipmentSnapshot,
        customer_snapshot: input.customer,
        installation_snapshot: input.installation,
        technician_snapshot: technicianSnapshot,
      })
      .select(CERTIFICATE_READ_COLUMNS)
      .single();

  if (insertError) {
    if (insertError.code === "23505") {
      throw requestError(
        409,
        "CERTIFICATE_ALREADY_EXISTS",
        "Une attestation existe déjà pour cette intervention."
      );
    }

    throw requestError(
      503,
      "CERTIFICATE_CREATE_FAILED",
      "Le brouillon de l’attestation n’a pas pu être créé."
    );
  }

  return res.status(201).json({
    ok: true,
    certificate: serializeCertificate(certificate),
  });
}
async function updateDraftCertificate(req, res) {
  const contentType = req.headers?.["content-type"];

  if (
    typeof contentType !== "string" ||
    !contentType.toLowerCase().startsWith("application/json")
  ) {
    throw requestError(
      415,
      "JSON_REQUIRED",
      "La requête doit contenir des données JSON."
    );
  }

  const creator = await requireVerifiedCompany(req, res);

  if (!creator) return;

  const input = validatePatchBody(req.body);

  if (
    input.boilerEfficiencyPercent !== null &&
    input.boilerEfficiencyPercent > 100
  ) {
    throw requestError(
      400,
      "EFFICIENCY_INVALID",
      "Le rendement de la chaudière doit être compris entre 0 et 100 %."
    );
  }

  if (
    input.referenceEfficiencyPercent !== null &&
    input.referenceEfficiencyPercent > 100
  ) {
    throw requestError(
      400,
      "REFERENCE_EFFICIENCY_INVALID",
      "Le rendement de référence doit être compris entre 0 et 100 %."
    );
  }

  const supabase = createAdminSupabase();

  const { data: existing, error: readError } =
    await supabase
      .from("boiler_maintenance_certificates")
      .select(
        "id, company_id, technician_id, status"
      )
      .eq("id", input.certificateId)
      .eq("company_id", creator.companyId)
      .maybeSingle();

  if (readError) {
    throw requestError(
      503,
      "CERTIFICATE_READ_FAILED",
      "Le brouillon est momentanément indisponible."
    );
  }

  if (!existing) {
    throw requestError(
      404,
      "CERTIFICATE_NOT_FOUND",
      "Le brouillon est introuvable."
    );
  }

  if (existing.status !== "draft") {
    throw requestError(
      409,
      "CERTIFICATE_ALREADY_ISSUED",
      "Une attestation émise ne peut plus être modifiée."
    );
  }

  if (existing.technician_id !== creator.userId) {
    throw requestError(
      403,
      "TECHNICIAN_MISMATCH",
      "Seul le technicien ayant créé l’attestation peut modifier ce brouillon."
    );
  }

  const { data: certificate, error: updateError } =
    await supabase
      .from("boiler_maintenance_certificates")
      .update({
        boiler_energy: input.boilerEnergy,
        flue_exhaust_type: input.flueExhaustType,
        commissioning_date: input.commissioningDate,
        nominal_power_kw: input.nominalPowerKw,
        forced_air_burner: input.forcedAirBurner,
        previous_maintenance_date:
          input.previousMaintenanceDate,
        previous_chimney_sweeping_date:
          input.previousChimneySweepingDate,
        controlled_points: input.controlledPoints,
        measuring_instruments:
          input.measuringInstruments,
        measurements: input.measurements,
        ambient_co_ppm: input.ambientCoPpm,
        ambient_co_status: input.ambientCoStatus,
        boiler_efficiency_percent:
          input.boilerEfficiencyPercent,
        reference_efficiency_percent:
          input.referenceEfficiencyPercent,
        pollutant_emissions: input.pollutantEmissions,
        advice_good_use: input.adviceGoodUse,
        advice_improvements: input.adviceImprovements,
        advice_replacement: input.adviceReplacement,
        boiler_energy_class: input.boilerEnergyClass,
        replacement_energy_classes:
          input.replacementEnergyClasses,
      })
      .eq("id", existing.id)
      .eq("status", "draft")
      .select(CERTIFICATE_READ_COLUMNS)
      .single();

  if (updateError) {
    console.error("CERTIFICATE_UPDATE_FAILED", {
      code: updateError.code,
      message: updateError.message,
    });

    throw requestError(
      503,
      "CERTIFICATE_UPDATE_FAILED",
      "Le brouillon n’a pas pu être enregistré."
    );
  }

  return res.status(200).json({
    ok: true,
    certificate: serializeCertificate(certificate),
  });
}
export async function handleBoilerMaintenanceCertificates(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      return await readCertificates(req, res);
    }

    if (req.method === "POST") {
      return await createDraftCertificate(req, res);
    }
    if (req.method === "PATCH") {
      return await updateDraftCertificate(req, res);
    }
    res.setHeader("Allow", "GET, POST, PATCH");

    return res.status(405).json({
      ok: false,
      code: "METHOD_NOT_ALLOWED",
      error: "Méthode non autorisée.",
    });
  } catch (error) {
    const status =
      Number.isInteger(error?.status) ? error.status : 500;

    if (status >= 500) {
      console.error("Erreur interne API attestations chaudière.");
    }

    return res.status(status).json({
      ok: false,
      code: error?.code || "INTERNAL_ERROR",
      error:
        error?.publicMessage ||
        "Erreur interne lors de la gestion de l’attestation.",
    });
  }
}