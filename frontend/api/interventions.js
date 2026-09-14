import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { requireVerifiedCompany } from "../server/lib/require-verified-company.js";
import {
    buildMaintenanceProof,
    registerMaintenanceProof,
} from "../server/lib/equipment-registry-v2.js";
import {
    decodeCarnetPassRecord,
    normalizeSerialNumber,
} from "../server/lib/carnetpass-status.js";

// Route privée : POST /api/interventions
// Le navigateur n'envoie jamais l'entreprise, le technicien,
// le CarnetPass ni les empreintes Polygon : le serveur les détermine.

const MAX_BODY_BYTES = 30_000;

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CARNETPASS_ID_PATTERN = /^CP-\d{4}-\d{6}$/;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const TRANSACTION_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

const INTERVENTION_TYPES = new Set([
    "maintenance",
    "repair",
    "installation",
    "commissioning",
    "inspection",
    "other",
]);

const RESULT_STATUSES = new Set([
    "resolved",
    "partially_resolved",
    "not_resolved",
    "not_applicable",
]);
const INTERVENTION_READ_COLUMNS = [
    "id",
    "equipment_id",
    "carnet_pass_id",
    "intervention_at",
    "intervention_type",
    "symptoms",
    "fault_code",
    "diagnosis",
    "work_performed",
    "parts_replaced",
    "measurements",
    "result_status",
    "validation_status",
    "polygon_state",
    "polygon_chain_id",
    "polygon_transaction_hash",
    "polygon_block_number",
    "polygon_confirmed_at",
].join(", ");
const ALLOWED_BODY_FIELDS = new Set([
    "equipmentId",
    "interventionType",
    "symptoms",
    "faultCode",
    "diagnosis",
    "workPerformed",
    "partsReplaced",
    "measurements",
    "resultStatus",
    "aiAssistanceUsed",
    "aiAnswerHelpful",
    "aiFeedback",
    "aiTrainingAllowed",
]);

const RETRYABLE_PRE_SUBMISSION_ERRORS = new Set([
    "RPC_URL_INVALID",
    "RPC_URL_NOT_HTTPS",
    "RPC_CONNECTION_FAILED",
    "WRONG_NETWORK",
    "PRIVATE_KEY_FORMAT",
    "PRIVATE_KEY_PARSE_FAILED",
    "WALLET_MISMATCH",
    "SERVER_WALLET_ADDRESS_INVALID",
    "CONTRACT_ADDRESS_INVALID",
    "CONTRACT_LOOKUP_FAILED",
    "CONTRACT_NOT_FOUND",
    "CONTRACT_READ_FAILED",
    "CONTRACT_PAUSED",
    "SERVER_WALLET_NOT_AUTHORIZED",
    "EQUIPMENT_NOT_FOUND",
    "SERVER_WALLET_BALANCE_TOO_LOW",
    "SERVER_WALLET_EMPTY",
    "GAS_ESTIMATE_INVALID",
    "GAS_PRICE_UNAVAILABLE",
    "PROOF_INVALID",
]);

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

const requestRateLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, "10 m"),
    prefix: "carnetpass:interventions:request",
    analytics: true,
});

const creationRateLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "1 h"),
    prefix: "carnetpass:interventions:create",
    analytics: true,
});

const POLYGON_WRITER_LOCK_KEY = "carnetpass:polygon-writer-lock";
const POLYGON_WRITER_LOCK_SECONDS = 180;

const RELEASE_LOCK_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  end

  return 0
`;

const PARIS_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

function requestError(status, code, publicMessage) {
    const error = new Error(code);

    error.status = status;
    error.code = code;
    error.publicMessage = publicMessage;

    return error;
}

function hasForbiddenControlCharacter(value) {
    return Array.from(value).some((character) => {
        const code = character.charCodeAt(0);

        return (
            code <= 8 ||
            code === 11 ||
            code === 12 ||
            (code >= 14 && code <= 31) ||
            code === 127
        );
    });
}

function normalizeOptionalText(
    value,
    maxLength,
    code,
    publicMessage
) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    if (typeof value !== "string") {
        throw requestError(400, code, publicMessage);
    }

    const normalized = value
        .replace(/\r\n?/g, "\n")
        .trim();

    if (!normalized) return null;

    if (
        normalized.length > maxLength ||
        hasForbiddenControlCharacter(normalized)
    ) {
        throw requestError(400, code, publicMessage);
    }

    return normalized;
}

function normalizeRequiredText(
    value,
    maxLength,
    code,
    publicMessage
) {
    const normalized = normalizeOptionalText(
        value,
        maxLength,
        code,
        publicMessage
    );

    if (!normalized) {
        throw requestError(400, code, publicMessage);
    }

    return normalized;
}

function normalizeEnum(value, allowedValues, code, publicMessage) {
    if (typeof value !== "string") {
        throw requestError(400, code, publicMessage);
    }

    const normalized = value.trim().toLowerCase();

    if (!allowedValues.has(normalized)) {
        throw requestError(400, code, publicMessage);
    }

    return normalized;
}

function normalizeBoolean(
    value,
    defaultValue,
    code,
    publicMessage
) {
    if (value === undefined) return defaultValue;

    if (typeof value !== "boolean") {
        throw requestError(400, code, publicMessage);
    }

    return value;
}

function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
}

function normalizePartsReplaced(value) {
    if (value === undefined || value === null) return [];

    if (!Array.isArray(value) || value.length > 50) {
        throw requestError(
            400,
            "PARTS_REPLACED_INVALID",
            "La liste des pièces remplacées est invalide."
        );
    }

    return value.map((item) => {
        if (typeof item === "string") {
            const name = normalizeRequiredText(
                item,
                160,
                "PARTS_REPLACED_INVALID",
                "Chaque pièce doit contenir un nom ou une référence valide."
            );

            return {
                name,
                reference: null,
                quantity: 1,
            };
        }

        if (!isPlainObject(item)) {
            throw requestError(
                400,
                "PARTS_REPLACED_INVALID",
                "Chaque pièce remplacée doit être correctement renseignée."
            );
        }

        const allowedKeys = new Set([
            "name",
            "reference",
            "quantity",
        ]);

        for (const key of Object.keys(item)) {
            if (!allowedKeys.has(key)) {
                throw requestError(
                    400,
                    "PARTS_REPLACED_INVALID",
                    "Une pièce remplacée contient une donnée inconnue."
                );
            }
        }

        const name = normalizeOptionalText(
            item.name,
            160,
            "PARTS_REPLACED_INVALID",
            "Le nom d'une pièce est invalide."
        );

        const reference = normalizeOptionalText(
            item.reference,
            160,
            "PARTS_REPLACED_INVALID",
            "La référence d'une pièce est invalide."
        );

        if (!name && !reference) {
            throw requestError(
                400,
                "PARTS_REPLACED_INVALID",
                "Chaque pièce doit contenir un nom ou une référence."
            );
        }

        const quantity = item.quantity ?? 1;

        if (
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 999
        ) {
            throw requestError(
                400,
                "PARTS_REPLACED_INVALID",
                "La quantité d'une pièce doit être comprise entre 1 et 999."
            );
        }

        return {
            name,
            reference,
            quantity,
        };
    });
}

function normalizeMeasurements(value) {
    if (value === undefined || value === null) return {};

    if (!isPlainObject(value)) {
        throw requestError(
            400,
            "MEASUREMENTS_INVALID",
            "Les mesures de l'intervention sont invalides."
        );
    }

    const entries = Object.entries(value);

    if (entries.length > 30) {
        throw requestError(
            400,
            "MEASUREMENTS_INVALID",
            "Trente mesures maximum peuvent être enregistrées."
        );
    }

    const blockedKeys = new Set([
        "__proto__",
        "prototype",
        "constructor",
    ]);

    const normalized = {};

    for (const [rawKey, rawValue] of entries) {
        const key = rawKey.trim();

        if (
            !key ||
            key.length > 80 ||
            hasForbiddenControlCharacter(key) ||
            blockedKeys.has(key.toLowerCase()) ||
            Object.prototype.hasOwnProperty.call(normalized, key)
        ) {
            throw requestError(
                400,
                "MEASUREMENTS_INVALID",
                "Le nom d'une mesure est invalide."
            );
        }

        if (
            rawValue === null ||
            typeof rawValue === "boolean"
        ) {
            normalized[key] = rawValue;
            continue;
        }

        if (typeof rawValue === "number") {
            if (!Number.isFinite(rawValue)) {
                throw requestError(
                    400,
                    "MEASUREMENTS_INVALID",
                    "La valeur d'une mesure est invalide."
                );
            }

            normalized[key] = rawValue;
            continue;
        }

        if (typeof rawValue === "string") {
            const measurement = rawValue.trim();

            if (
                !measurement ||
                measurement.length > 200 ||
                hasForbiddenControlCharacter(measurement)
            ) {
                throw requestError(
                    400,
                    "MEASUREMENTS_INVALID",
                    "La valeur d'une mesure est invalide."
                );
            }

            normalized[key] = measurement;
            continue;
        }

        throw requestError(
            400,
            "MEASUREMENTS_INVALID",
            "Une mesure doit être un texte, un nombre ou une valeur oui/non."
        );
    }

    return normalized;
}

function validateRequestBody(body) {
    if (!isPlainObject(body)) {
        throw requestError(
            400,
            "INVALID_BODY",
            "Les données de l'intervention sont invalides."
        );
    }

    let serializedBody;

    try {
        serializedBody = JSON.stringify(body);
    } catch {
        throw requestError(
            400,
            "INVALID_BODY",
            "Les données de l'intervention sont invalides."
        );
    }

    if (
        typeof serializedBody !== "string" ||
        Buffer.byteLength(serializedBody, "utf8") > MAX_BODY_BYTES
    ) {
        throw requestError(
            413,
            "BODY_TOO_LARGE",
            "Les données de l'intervention sont trop volumineuses."
        );
    }

    for (const key of Object.keys(body)) {
        if (!ALLOWED_BODY_FIELDS.has(key)) {
            throw requestError(
                400,
                "UNKNOWN_FIELD",
                "La demande contient une donnée inconnue."
            );
        }
    }

    if (
        typeof body.equipmentId !== "string" ||
        !UUID_PATTERN.test(body.equipmentId.trim())
    ) {
        throw requestError(
            400,
            "EQUIPMENT_ID_INVALID",
            "L'identifiant de l'équipement est invalide."
        );
    }

    const interventionType = normalizeEnum(
        body.interventionType,
        INTERVENTION_TYPES,
        "INTERVENTION_TYPE_INVALID",
        "Le type d'intervention est invalide."
    );

    const resultStatus = normalizeEnum(
        body.resultStatus,
        RESULT_STATUSES,
        "RESULT_STATUS_INVALID",
        "Le résultat de l'intervention est invalide."
    );

    const symptoms = normalizeOptionalText(
        body.symptoms,
        4000,
        "SYMPTOMS_INVALID",
        "Les symptômes doivent contenir au maximum 4 000 caractères."
    );

    const faultCode = normalizeOptionalText(
        body.faultCode,
        100,
        "FAULT_CODE_INVALID",
        "Le code défaut doit contenir au maximum 100 caractères."
    );

    const diagnosis = normalizeOptionalText(
        body.diagnosis,
        4000,
        "DIAGNOSIS_INVALID",
        "Le diagnostic doit contenir au maximum 4 000 caractères."
    );

    const workPerformed = normalizeRequiredText(
        body.workPerformed,
        8000,
        "WORK_PERFORMED_INVALID",
        "L'opération effectuée est obligatoire et limitée à 8 000 caractères."
    );

    const partsReplaced = normalizePartsReplaced(
        body.partsReplaced
    );

    const measurements = normalizeMeasurements(
        body.measurements
    );

    const aiAssistanceUsed = normalizeBoolean(
        body.aiAssistanceUsed,
        false,
        "AI_ASSISTANCE_INVALID",
        "L'utilisation de l'aide IA est invalide."
    );

    let aiAnswerHelpful = null;

    if (
        body.aiAnswerHelpful !== undefined &&
        body.aiAnswerHelpful !== null
    ) {
        aiAnswerHelpful = normalizeBoolean(
            body.aiAnswerHelpful,
            null,
            "AI_FEEDBACK_INVALID",
            "L'évaluation de la réponse IA est invalide."
        );
    }

    const aiFeedback = normalizeOptionalText(
        body.aiFeedback,
        2000,
        "AI_FEEDBACK_INVALID",
        "Le retour sur l'aide IA doit contenir au maximum 2 000 caractères."
    );

    const aiTrainingAllowed = normalizeBoolean(
        body.aiTrainingAllowed,
        false,
        "AI_TRAINING_CONSENT_INVALID",
        "L'autorisation d'amélioration de l'IA est invalide."
    );

    if (
        !aiAssistanceUsed &&
        (aiAnswerHelpful !== null || aiFeedback !== null)
    ) {
        throw requestError(
            400,
            "AI_FEEDBACK_INCONSISTENT",
            "Un retour sur l'IA nécessite d'avoir utilisé l'aide IA."
        );
    }

    return {
        equipmentId: body.equipmentId.trim().toLowerCase(),
        interventionType,
        symptoms,
        faultCode,
        diagnosis,
        workPerformed,
        partsReplaced,
        measurements,
        resultStatus,
        aiAssistanceUsed,
        aiAnswerHelpful,
        aiFeedback,
        aiTrainingAllowed,
    };
}

function createAdminSupabase() {
    const url =
        process.env.SUPABASE_URL ||
        process.env.VITE_SUPABASE_URL;

    const key =
        process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw requestError(
            503,
            "DATABASE_UNAVAILABLE",
            "Le service d'enregistrement est momentanément indisponible."
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

function getClientIp(req) {
    const forwarded = req.headers?.["x-forwarded-for"];

    if (typeof forwarded === "string") {
        return forwarded.split(",")[0]?.trim() || "unknown";
    }

    const realIp = req.headers?.["x-real-ip"];

    return typeof realIp === "string" && realIp
        ? realIp
        : "unknown";
}

async function checkRateLimit(limiter, identifier, res) {
    let result;

    try {
        result = await limiter.limit(identifier);
    } catch {
        throw requestError(
            503,
            "RATE_LIMIT_UNAVAILABLE",
            "Le contrôle de sécurité est momentanément indisponible."
        );
    }

    if (result.success) return true;

    const seconds = Number.isFinite(result.reset)
        ? Math.max(
            1,
            Math.ceil((result.reset - Date.now()) / 1000)
        )
        : 60;

    res.setHeader("Retry-After", String(seconds));

    res.status(429).json({
        ok: false,
        code: "RATE_LIMITED",
        error: "Trop de demandes. Réessaie un peu plus tard.",
    });

    return false;
}

function getParisDay(date) {
    const values = {};

    for (const part of PARIS_DATE_FORMATTER.formatToParts(date)) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    }

    return `${values.year}-${values.month}-${values.day}`;
}

async function loadEquipment(
    supabase,
    equipmentId,
    companyId
) {
    const { data, error } = await supabase
        .from("equipments")
        .select("id, company_id, serial_number")
        .eq("id", equipmentId)
        .eq("company_id", companyId)
        .maybeSingle();

    if (error) {
        throw requestError(
            503,
            "DATABASE_UNAVAILABLE",
            "La vérification de l'équipement est indisponible."
        );
    }

    if (!data) {
        throw requestError(
            404,
            "EQUIPMENT_NOT_FOUND",
            "Cet équipement est introuvable pour ton entreprise."
        );
    }

    const serialNumber = normalizeSerialNumber(
        data.serial_number
    );

    if (!serialNumber) {
        throw requestError(
            409,
            "EQUIPMENT_SERIAL_REQUIRED",
            "Cet équipement doit posséder un numéro de série valide."
        );
    }

    return {
        ...data,
        serialNumber,
    };
}
function serializeIntervention(intervention) {
    return {
        id: intervention.id,
        equipmentId: intervention.equipment_id,
        carnetPassId: intervention.carnet_pass_id,
        interventionAt: intervention.intervention_at,
        interventionType: intervention.intervention_type,
        symptoms: intervention.symptoms,
        faultCode: intervention.fault_code,
        diagnosis: intervention.diagnosis,
        workPerformed: intervention.work_performed,
        partsReplaced: intervention.parts_replaced,
        measurements: intervention.measurements,
        resultStatus: intervention.result_status,
        validationStatus: intervention.validation_status,
        polygonState: intervention.polygon_state,
        polygonChainId: intervention.polygon_chain_id,
        polygonTransactionHash:
            intervention.polygon_transaction_hash,
        polygonBlockNumber: intervention.polygon_block_number,
        polygonConfirmedAt: intervention.polygon_confirmed_at,
    };
}
async function loadPublicActiveCarnetPass(carnetPassId) {
    let rawCarnetPass;

    try {
        rawCarnetPass = await redis.get(
            `carnetpass:${carnetPassId}`
        );
    } catch {
        throw requestError(
            503,
            "CARNETPASS_LOOKUP_UNAVAILABLE",
            "La vérification du CarnetPass est momentanément indisponible."
        );
    }

    const carnetPass = decodeCarnetPassRecord(rawCarnetPass);
    const blockchain = carnetPass?.blockchain;

    if (
        !carnetPass ||
        carnetPass.carnetPassId !== carnetPassId ||
        carnetPass.status !== "active" ||
        blockchain?.state !== "confirmed" ||
        Number(blockchain?.chainId) !== 137 ||
        !BYTES32_PATTERN.test(blockchain?.equipmentKey || "")
    ) {
        throw requestError(
            404,
            "CARNETPASS_NOT_FOUND",
            "Ce CarnetPass actif est introuvable."
        );
    }

    return carnetPass;
}
async function readInterventions(req, res) {
    if (
        !(await checkRateLimit(
            requestRateLimit,
            `ip:${getClientIp(req)}`,
            res
        ))
    ) {
        return;
    }

    const rawCarnetPassId = Array.isArray(
        req.query?.carnetPassId
    )
        ? req.query.carnetPassId[0]
        : req.query?.carnetPassId;

    const supabase = createAdminSupabase();

    if (rawCarnetPassId !== undefined) {
        const carnetPassId =
            typeof rawCarnetPassId === "string"
                ? rawCarnetPassId.trim().toUpperCase()
                : "";

        if (!CARNETPASS_ID_PATTERN.test(carnetPassId)) {
            throw requestError(
                400,
                "CARNETPASS_ID_INVALID",
                "L'identifiant CarnetPass est invalide."
            );
        }

        await loadPublicActiveCarnetPass(carnetPassId);

        const { data, error, count } = await supabase
            .from("interventions")
            .select(INTERVENTION_READ_COLUMNS, {
                count: "exact",
            })
            .eq("carnet_pass_id", carnetPassId)
            .eq("polygon_state", "confirmed")
            .order("intervention_at", { ascending: false })
            .limit(100);

        if (error) {
            throw requestError(
                503,
                "DATABASE_UNAVAILABLE",
                "L'historique du CarnetPass est momentanément indisponible."
            );
        }

        const interventions = Array.isArray(data) ? data : [];

        return res.status(200).json({
            ok: true,
            total: count ?? interventions.length,
            interventions: interventions.map(serializeIntervention),
        });
    }

    const creator = await requireVerifiedCompany(req, res);

    if (!creator) return;

    const { data, error, count } = await supabase
        .from("interventions")
        .select(INTERVENTION_READ_COLUMNS, {
            count: "exact",
        })
        .eq("company_id", creator.companyId)
        .order("intervention_at", { ascending: false })
        .limit(100);

    if (error) {
        throw requestError(
            503,
            "DATABASE_UNAVAILABLE",
            "L'historique des interventions est momentanément indisponible."
        );
    }

    const interventions = Array.isArray(data) ? data : [];

    return res.status(200).json({
        ok: true,
        total: count ?? interventions.length,
        interventions: interventions.map(serializeIntervention),
    });
}
async function loadActiveCarnetPass(

    serialNumber,
    companyId
) {
    let mappedCarnetPassId;
    let rawCarnetPass;

    try {
        mappedCarnetPassId = await redis.get(
            `carnetpass:serial:${serialNumber}`
        );

        if (
            typeof mappedCarnetPassId === "string" &&
            CARNETPASS_ID_PATTERN.test(mappedCarnetPassId)
        ) {
            rawCarnetPass = await redis.get(
                `carnetpass:${mappedCarnetPassId}`
            );
        }
    } catch {
        throw requestError(
            503,
            "CARNETPASS_LOOKUP_UNAVAILABLE",
            "La vérification du CarnetPass est momentanément indisponible."
        );
    }

    const carnetPass = decodeCarnetPassRecord(
        rawCarnetPass
    );

    const recordSerialNumber = normalizeSerialNumber(
        carnetPass?.serialNumber
    );

    const blockchain = carnetPass?.blockchain;

    if (
        !carnetPass ||
        carnetPass.carnetPassId !== mappedCarnetPassId ||
        carnetPass.createdByCompanyId !== companyId ||
        carnetPass.status !== "active" ||
        recordSerialNumber !== serialNumber ||
        blockchain?.state !== "confirmed" ||
        Number(blockchain?.chainId) !== 137 ||
        !BYTES32_PATTERN.test(blockchain?.equipmentKey || "")
    ) {
        throw requestError(
            409,
            "ACTIVE_CARNETPASS_REQUIRED",
            "Cet équipement ne possède pas de CarnetPass Polygon actif."
        );
    }

    return carnetPass;
}

async function loadExistingIntervention(
    supabase,
    equipmentId,
    technicianId,
    interventionDay
) {
    const { data, error } = await supabase
        .from("interventions")
        .select(
            [
                "id",
                "intervention_at",
                "intervention_day",
                "polygon_state",
                "polygon_transaction_hash",
                "polygon_error_code",
            ].join(", ")
        )
        .eq("equipment_id", equipmentId)
        .eq("technician_id", technicianId)
        .eq("intervention_day", interventionDay)
        .maybeSingle();

    if (error) {
        throw requestError(
            503,
            "DATABASE_UNAVAILABLE",
            "La vérification des interventions est indisponible."
        );
    }

    return data;
}

function isPreSubmissionFailure(code) {
    return (
        typeof code === "string" &&
        (
            code.startsWith("ENV_MISSING_") ||
            RETRYABLE_PRE_SUBMISSION_ERRORS.has(code)
        )
    );
}

function canRetryExistingIntervention(intervention) {
    return Boolean(
        intervention &&
        intervention.polygon_state === "failed" &&
        !intervention.polygon_transaction_hash &&
        isPreSubmissionFailure(
            intervention.polygon_error_code
        )
    );
}

async function saveBlockchainState(
    supabase,
    interventionId,
    companyId,
    values
) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error } = await supabase
            .from("interventions")
            .update(values)
            .eq("id", interventionId)
            .eq("company_id", companyId)
            .select("id")
            .maybeSingle();

        if (!error && data?.id === interventionId) {
            return;
        }
    }

    throw requestError(
        503,
        "INTERVENTION_STORAGE_UNAVAILABLE",
        "L'état de l'intervention n'a pas pu être enregistré."
    );
}

async function savePreparedIntervention({
    supabase,
    values,
    existingIntervention,
}) {
    if (!existingIntervention) {
        const { error } = await supabase
            .from("interventions")
            .insert(values);

        if (!error) return;

        if (error.code === "23505") {
            throw requestError(
                409,
                "DUPLICATE_INTERVENTION",
                "Une intervention existe déjà aujourd'hui pour cet équipement et ce technicien."
            );
        }

        throw requestError(
            503,
            "DATABASE_UNAVAILABLE",
            "L'intervention n'a pas pu être préparée."
        );
    }

    const { data, error } = await supabase
        .from("interventions")
        .update(values)
        .eq("id", existingIntervention.id)
        .eq("polygon_state", "failed")
        .is("polygon_transaction_hash", null)
        .select("id")
        .maybeSingle();

    if (error || data?.id !== existingIntervention.id) {
        throw requestError(
            409,
            "INTERVENTION_RETRY_REFUSED",
            "Cette intervention ne peut pas être renvoyée automatiquement."
        );
    }
}

function safeDiagnosticCode(error) {
    if (
        typeof error?.code === "string" &&
        /^[A-Z0-9_]{1,100}$/.test(error.code)
    ) {
        return error.code;
    }

    return "UNKNOWN";
}

async function respondToPolygonFailure({
    error,
    res,
    supabase,
    interventionId,
    companyId,
    submittedTransaction,
    submittedAt,
}) {
    const diagnostic = safeDiagnosticCode(error);

    const errorTransactionHash =
        typeof error?.transactionHash === "string" &&
            TRANSACTION_HASH_PATTERN.test(error.transactionHash)
            ? error.transactionHash
            : null;

    const transactionHash =
        submittedTransaction?.transactionHash ||
        errorTransactionHash;

    const hasTransaction = Boolean(transactionHash);
    const transactionReverted =
        diagnostic === "TRANSACTION_REVERTED";

    const polygonState =
        hasTransaction && !transactionReverted
            ? "confirmation_pending"
            : "failed";

    const stateValues = {
        polygon_state: polygonState,
        polygon_error_code: diagnostic,
    };

    if (hasTransaction) {
        stateValues.polygon_chain_id =
            submittedTransaction?.chainId || 137;

        stateValues.polygon_contract_address =
            submittedTransaction?.contractAddress ||
            process.env.EQUIPMENT_REGISTRY_V2_ADDRESS?.trim() ||
            null;

        stateValues.polygon_transaction_hash =
            transactionHash;

        stateValues.polygon_submitted_at =
            submittedAt || new Date().toISOString();
    }

    let stateStored = true;

    try {
        await saveBlockchainState(
            supabase,
            interventionId,
            companyId,
            stateValues
        );
    } catch {
        stateStored = false;
        console.error(
            "État d'échec Polygon non enregistré."
        );
    }

    console.error(
        "Échec de la preuve Polygon d'intervention :",
        diagnostic
    );

    if (diagnostic === "MAINTENANCE_PROOF_ALREADY_EXISTS") {
        return res.status(409).json({
            ok: false,
            code: diagnostic,
            interventionId,
            retryable: false,
            error:
                "Une preuve Polygon existe déjà pour cette intervention. Ne la renvoie pas et vérifie son état.",
        });
    }

    if (hasTransaction && !transactionReverted) {
        return res.status(202).json({
            ok: true,
            pending: true,
            code: "POLYGON_CONFIRMATION_PENDING",
            interventionId,
            transactionHash,
            doNotRetry: true,
            error:
                "La transaction Polygon a été envoyée, mais sa confirmation reste incertaine. Ne renvoie pas l'intervention.",
        });
    }

    if (transactionReverted) {
        return res.status(503).json({
            ok: false,
            code: "POLYGON_TRANSACTION_REVERTED",
            interventionId,
            transactionHash,
            retryable: false,
            error:
                "La transaction Polygon a été refusée. L'intervention n'a pas été certifiée.",
        });
    }

    const retryable =
        stateStored && isPreSubmissionFailure(diagnostic);

    if (
        diagnostic === "SERVER_WALLET_BALANCE_TOO_LOW" ||
        diagnostic === "SERVER_WALLET_EMPTY"
    ) {
        return res.status(503).json({
            ok: false,
            code: "POLYGON_BALANCE_INSUFFICIENT",
            interventionId,
            retryable,
            error:
                "Le service de certification manque temporairement de POL. Aucune transaction n'a été envoyée.",
        });
    }

    if (retryable) {
        return res.status(503).json({
            ok: false,
            code: "POLYGON_REGISTRATION_FAILED",
            interventionId,
            retryable: true,
            error:
                "La preuve Polygon n'a pas été envoyée. Tu pourras réessayer lorsque le service sera disponible.",
        });
    }

    return res.status(503).json({
        ok: false,
        code: "POLYGON_STATUS_UNCERTAIN",
        interventionId,
        retryable: false,
        error:
            "L'état Polygon nécessite une vérification. Ne renvoie pas l'intervention pour le moment.",
    });
}

async function createIntervention(req, res) {
    const contentType = req.headers?.["content-type"];

    if (
        typeof contentType !== "string" ||
        !contentType.toLowerCase().startsWith("application/json")
    ) {
        return res.status(415).json({
            ok: false,
            code: "JSON_REQUIRED",
            error: "La requête doit contenir des données JSON.",
        });
    }

    if (
        !(await checkRateLimit(
            requestRateLimit,
            `ip:${getClientIp(req)}`,
            res
        ))
    ) {
        return;
    }

    const creator = await requireVerifiedCompany(req, res);

    if (!creator) return;

    if (
        !(await checkRateLimit(
            creationRateLimit,
            `user:${creator.userId}`,
            res
        ))
    ) {
        return;
    }

    const input = validateRequestBody(req.body);
    const supabase = createAdminSupabase();

    const equipment = await loadEquipment(
        supabase,
        input.equipmentId,
        creator.companyId
    );

    const carnetPass = await loadActiveCarnetPass(
        equipment.serialNumber,
        creator.companyId
    );

    const writerLockToken = randomUUID();

    let lockAcquired;

    try {
        lockAcquired = await redis.set(
            POLYGON_WRITER_LOCK_KEY,
            writerLockToken,
            {
                nx: true,
                ex: POLYGON_WRITER_LOCK_SECONDS,
            }
        );
    } catch {
        throw requestError(
            503,
            "POLYGON_WRITER_UNAVAILABLE",
            "Le service Polygon est momentanément indisponible."
        );
    }

    if (!lockAcquired) {
        res.setHeader("Retry-After", "5");

        return res.status(503).json({
            ok: false,
            code: "POLYGON_WRITER_BUSY",
            error:
                "Une autre preuve Polygon est en cours. Patiente quelques secondes puis réessaie.",
        });
    }

    try {
        const currentDate = new Date();
        const currentParisDay = getParisDay(currentDate);

        const existingIntervention =
            await loadExistingIntervention(
                supabase,
                equipment.id,
                creator.userId,
                currentParisDay
            );

        if (
            existingIntervention &&
            !canRetryExistingIntervention(existingIntervention)
        ) {
            return res.status(409).json({
                ok: false,
                code: "DUPLICATE_INTERVENTION",
                interventionId: existingIntervention.id,
                error:
                    "Une intervention existe déjà aujourd'hui pour cet équipement et ce technicien.",
            });
        }

        const isRetry = Boolean(existingIntervention);

        const interventionId =
            existingIntervention?.id || randomUUID();

        const interventionAt =
            existingIntervention?.intervention_at ||
            currentDate.toISOString();

        const interventionDay =
            existingIntervention?.intervention_day ||
            currentParisDay;

        const interventionAtUnixMs =
            Date.parse(interventionAt);

        if (!Number.isFinite(interventionAtUnixMs)) {
            throw requestError(
                503,
                "INTERVENTION_DATE_INVALID",
                "La date de l'intervention est invalide."
            );
        }

        const proofData = {
            schema: "carnetpass.intervention.v1",
            equipmentId: equipment.id,
            interventionAtUnixMs,
            interventionDay,
            interventionType: input.interventionType,
            symptoms: input.symptoms,
            faultCode: input.faultCode,
            diagnosis: input.diagnosis,
            workPerformed: input.workPerformed,
            partsReplaced: input.partsReplaced,
            measurements: input.measurements,
            resultStatus: input.resultStatus,
            ai: {
                assistanceUsed: input.aiAssistanceUsed,
                answerHelpful: input.aiAnswerHelpful,
                feedback: input.aiFeedback,
            },
        };

        const proof = buildMaintenanceProof({
            carnetPassId: carnetPass.carnetPassId,
            interventionId,
            companyId: creator.companyId,
            technicianId: creator.userId,
            data: proofData,
        });

        if (
            proof.equipmentKey.toLowerCase() !==
            carnetPass.blockchain.equipmentKey.toLowerCase()
        ) {
            throw requestError(
                409,
                "CARNETPASS_PROOF_MISMATCH",
                "Le CarnetPass ne correspond pas à la preuve Polygon de cet équipement."
            );
        }

        const preparedValues = {
            id: interventionId,
            company_id: creator.companyId,
            equipment_id: equipment.id,
            carnet_pass_id: carnetPass.carnetPassId,
            technician_id: creator.userId,
            intervention_at: interventionAt,
            intervention_day: interventionDay,
            intervention_type: input.interventionType,
            symptoms: input.symptoms,
            fault_code: input.faultCode,
            diagnosis: input.diagnosis,
            work_performed: input.workPerformed,
            parts_replaced: input.partsReplaced,
            measurements: input.measurements,
            result_status: input.resultStatus,
            ai_assistance_used: input.aiAssistanceUsed,
            ai_answer_helpful: input.aiAnswerHelpful,
            ai_feedback: input.aiFeedback,
            ai_training_allowed: input.aiTrainingAllowed,
            validation_status: "pending",
            validated_by: null,
            validated_at: null,
            validation_note: null,
            proof_version: 1,
            polygon_state: "prepared",
            polygon_chain_id: 137,
            polygon_contract_address: null,
            polygon_equipment_key: proof.equipmentKey,
            polygon_proof_id: proof.proofId,
            polygon_data_hash: proof.dataHash,
            polygon_transaction_hash: null,
            polygon_block_number: null,
            polygon_transaction_fee_wei: null,
            polygon_submitted_at: null,
            polygon_confirmed_at: null,
            polygon_error_code: null,
        };

        await savePreparedIntervention({
            supabase,
            values: preparedValues,
            existingIntervention,
        });

        let submittedTransaction = null;
        let submittedAt = null;
        let confirmedProof;

        try {
            confirmedProof = await registerMaintenanceProof({
                ...proof,
                onTransactionSent: async (submitted) => {
                    submittedTransaction = submitted;
                    submittedAt = new Date().toISOString();

                    await saveBlockchainState(
                        supabase,
                        interventionId,
                        creator.companyId,
                        {
                            polygon_state: "submitted",
                            polygon_chain_id: submitted.chainId,
                            polygon_contract_address:
                                submitted.contractAddress,
                            polygon_transaction_hash:
                                submitted.transactionHash,
                            polygon_submitted_at: submittedAt,
                            polygon_error_code: null,
                        }
                    );
                },
            });
        } catch (error) {
            return await respondToPolygonFailure({
                error,
                res,
                supabase,
                interventionId,
                companyId: creator.companyId,
                submittedTransaction,
                submittedAt,
            });
        }

        const confirmedAt = new Date().toISOString();

        try {
            await saveBlockchainState(
                supabase,
                interventionId,
                creator.companyId,
                {
                    polygon_state: "confirmed",
                    polygon_chain_id: confirmedProof.chainId,
                    polygon_contract_address:
                        confirmedProof.contractAddress,
                    polygon_transaction_hash:
                        confirmedProof.transactionHash,
                    polygon_block_number:
                        confirmedProof.blockNumber,
                    polygon_transaction_fee_wei:
                        confirmedProof.transactionFeeWei,
                    polygon_submitted_at:
                        submittedAt || confirmedAt,
                    polygon_confirmed_at: confirmedAt,
                    polygon_error_code: null,
                }
            );
        } catch {
            console.error(
                "Preuve Polygon confirmée mais état final non enregistré."
            );

            return res.status(202).json({
                ok: true,
                pending: true,
                code: "POLYGON_CONFIRMED_STORAGE_PENDING",
                interventionId,
                transactionHash:
                    confirmedProof.transactionHash,
                doNotRetry: true,
                error:
                    "La preuve Polygon est confirmée, mais sa mise à jour dans la base doit être vérifiée. Ne renvoie pas l'intervention.",
            });
        }

        return res.status(isRetry ? 200 : 201).json({
            ok: true,
            intervention: {
                id: interventionId,
                equipmentId: equipment.id,
                carnetPassId: carnetPass.carnetPassId,
                interventionAt,
                interventionDay,
                resultStatus: input.resultStatus,
                polygonState: "confirmed",
            },
            blockchain: {
                chainId: confirmedProof.chainId,
                contractAddress:
                    confirmedProof.contractAddress,
                transactionHash:
                    confirmedProof.transactionHash,
                blockNumber: confirmedProof.blockNumber,
                transactionFeeWei:
                    confirmedProof.transactionFeeWei,
            },
        });
    } finally {
        try {
            await redis.eval(
                RELEASE_LOCK_SCRIPT,
                [POLYGON_WRITER_LOCK_KEY],
                [writerLockToken]
            );
        } catch {
            console.error(
                "Libération du verrou Polygon impossible."
            );
        }
    }
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");

    if (req.method !== "POST" && req.method !== "GET") {
        res.setHeader("Allow", "GET, POST");

        return res.status(405).json({
            ok: false,
            code: "METHOD_NOT_ALLOWED",
            error: "Méthode non autorisée.",
        });
    }

    try {
        if (req.method === "GET") {
            return await readInterventions(req, res);
        }

        return await createIntervention(req, res);
    } catch (error) {
        if (
            Number.isInteger(error?.status) &&
            typeof error?.publicMessage === "string"
        ) {
            return res.status(error.status).json({
                ok: false,
                code: error.code,
                error: error.publicMessage,
            });
        }

        console.error("Erreur interne API interventions.");

        return res.status(500).json({
            ok: false,
            code: "INTERNAL_ERROR",
            error: "Erreur interne lors de l'intervention.",
        });
    }
}