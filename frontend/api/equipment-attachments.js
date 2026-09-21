import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient } from "@supabase/supabase-js";
import { del, get, issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned } from "@vercel/blob/client";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { requireVerifiedCompany } from "../server/lib/require-verified-company.js";

// API privée des pièces jointes CarnetPass.
//
// POST   /api/equipment-attachments
//   - délivre une URL d'envoi Vercel Blob courte et limitée ;
//   - reçoit ensuite le webhook Vercel signé et enregistre les métadonnées.
// GET    /api/equipment-attachments?equipmentId=<uuid>
//   - liste les pièces jointes visibles pour l'entreprise connectée.
// GET    /api/equipment-attachments?attachmentId=<uuid>&action=view|download
//   - diffuse un Blob privé après contrôle des droits.
// DELETE /api/equipment-attachments?attachmentId=<uuid>
//   - effectue d'abord une suppression logique, puis supprime le Blob.

const MAX_JSON_BODY_BYTES = 30_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DOCUMENT_KINDS = new Set([
    "photo",
    "invoice",
    "quote",
    "proof",
    "other",
]);

const ALLOWED_MIME_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
]);

const MIME_EXTENSIONS = {
    "application/pdf": new Set(["pdf"]),
    "image/jpeg": new Set(["jpg", "jpeg"]),
    "image/png": new Set(["png"]),
    "image/webp": new Set(["webp"]),
};

const ATTACHMENT_READ_COLUMNS = [
    "id",
    "equipment_id",
    "intervention_id",
    "uploaded_by",
    "document_kind",
    "title",
    "description",
    "original_filename",
    "mime_type",
    "size_bytes",
    "sha256",
    "created_at",
].join(", ");

const ATTACHMENT_PRIVATE_COLUMNS = [
    ATTACHMENT_READ_COLUMNS,
    "company_id",
    "blob_url",
    "blob_pathname",
    "deleted_at",
    "deleted_by",
].join(", ");

function requestError(status, code, publicMessage) {
    const error = new Error(code);

    error.status = status;
    error.code = code;
    error.publicMessage = publicMessage;

    return error;
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
            "Le service des pièces jointes est momentanément indisponible."
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

function createRateLimiters() {
    const url =
        process.env.UPSTASH_REDIS_REST_URL ||
        process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;

    const token =
        process.env.UPSTASH_REDIS_REST_TOKEN ||
        process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;

    if (!url || !token) return null;

    const redis = new Redis({ url, token });

    return {
        requests: new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(180, "10 m"),
            prefix: "carnetpass:equipment-attachments:request",
            analytics: true,
        }),
        mutations: new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(40, "1 h"),
            prefix: "carnetpass:equipment-attachments:mutation",
            analytics: true,
        }),
    };
}

const rateLimiters = createRateLimiters();

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
    if (!limiter) {
        throw requestError(
            503,
            "RATE_LIMIT_UNAVAILABLE",
            "Le contrôle de sécurité est momentanément indisponible."
        );
    }

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
        ? Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
        : 60;

    res.setHeader("Retry-After", String(seconds));
    res.status(429).json({
        ok: false,
        code: "RATE_LIMITED",
        error: "Trop de demandes. Réessaie un peu plus tard.",
    });

    return false;
}

function hasForbiddenControlCharacter(value) {
    for (const character of value) {
        const codePoint = character.codePointAt(0);

        if (codePoint <= 0x1f || codePoint === 0x7f) {
            return true;
        }
    }

    return false;
}

function isPlainObject(value) {
    return Boolean(
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function readJsonBody(req) {
    const contentLength = Number(req.headers?.["content-length"] || 0);

    if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
        throw requestError(
            413,
            "BODY_TOO_LARGE",
            "La demande envoyée est trop volumineuse."
        );
    }

    let body = req.body;

    if (Buffer.isBuffer(body)) {
        if (body.byteLength > MAX_JSON_BODY_BYTES) {
            throw requestError(
                413,
                "BODY_TOO_LARGE",
                "La demande envoyée est trop volumineuse."
            );
        }

        body = body.toString("utf8");
    }

    if (typeof body === "string") {
        if (Buffer.byteLength(body, "utf8") > MAX_JSON_BODY_BYTES) {
            throw requestError(
                413,
                "BODY_TOO_LARGE",
                "La demande envoyée est trop volumineuse."
            );
        }

        try {
            body = JSON.parse(body);
        } catch {
            throw requestError(
                400,
                "INVALID_JSON",
                "Les données envoyées sont invalides."
            );
        }
    }

    if (!isPlainObject(body)) {
        throw requestError(
            400,
            "INVALID_BODY",
            "Les données envoyées sont invalides."
        );
    }

    let serialized;

    try {
        serialized = JSON.stringify(body);
    } catch {
        throw requestError(
            400,
            "INVALID_BODY",
            "Les données envoyées sont invalides."
        );
    }

    if (Buffer.byteLength(serialized, "utf8") > MAX_JSON_BODY_BYTES) {
        throw requestError(
            413,
            "BODY_TOO_LARGE",
            "La demande envoyée est trop volumineuse."
        );
    }

    return body;
}

function queryValue(value) {
    if (Array.isArray(value)) return value[0];
    return value;
}

function requireUuid(value, code, publicMessage) {
    const normalized =
        typeof value === "string"
            ? value.trim().toLowerCase()
            : "";

    if (!UUID_PATTERN.test(normalized)) {
        throw requestError(400, code, publicMessage);
    }

    return normalized;
}

function optionalUuid(value, code, publicMessage) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    return requireUuid(value, code, publicMessage);
}

function normalizeText(value, {
    field,
    required = false,
    maxLength,
}) {
    if (value === undefined || value === null) {
        if (required) {
            throw requestError(
                400,
                "UPLOAD_METADATA_INVALID",
                `${field} est obligatoire.`
            );
        }

        return null;
    }

    if (typeof value !== "string") {
        throw requestError(
            400,
            "UPLOAD_METADATA_INVALID",
            `${field} est invalide.`
        );
    }

    const normalized = value.trim().normalize("NFC");

    if (
        (required && !normalized) ||
        normalized.length > maxLength ||
        hasForbiddenControlCharacter(normalized)
    ) {
        throw requestError(
            400,
            "UPLOAD_METADATA_INVALID",
            `${field} est invalide.`
        );
    }

    return normalized || null;
}

function normalizeOriginalFilename(value) {
    const originalFilename = normalizeText(value, {
        field: "Le nom du fichier",
        required: true,
        maxLength: 180,
    });

    if (
        originalFilename === "." ||
        originalFilename === ".." ||
        /[\\/]/.test(originalFilename)
    ) {
        throw requestError(
            400,
            "FILENAME_INVALID",
            "Le nom du fichier est invalide."
        );
    }

    return originalFilename;
}

function normalizeMimeType(value) {
    const mimeType =
        typeof value === "string"
            ? value.trim().toLowerCase()
            : "";

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        throw requestError(
            400,
            "FILE_TYPE_FORBIDDEN",
            "Seuls les fichiers PDF, JPEG, PNG et WebP sont autorisés."
        );
    }

    return mimeType;
}

function pathnameExtension(pathname) {
    const match = /\.([a-z0-9]+)$/i.exec(pathname);
    return match?.[1]?.toLowerCase() || "";
}

function validateRequestedPathname(pathname, equipmentId, mimeType) {
    if (
        typeof pathname !== "string" ||
        pathname.length > 300 ||
        hasForbiddenControlCharacter(pathname)
    ) {
        throw requestError(
            400,
            "BLOB_PATH_INVALID",
            "Le chemin d'enregistrement du fichier est invalide."
        );
    }

    const prefix = `equipment-attachments/${equipmentId}/`;
    const filename = pathname.slice(prefix.length);

    if (
        !pathname.startsWith(prefix) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/i.test(
            filename
        )
    ) {
        throw requestError(
            400,
            "BLOB_PATH_INVALID",
            "Le chemin d'enregistrement du fichier est invalide."
        );
    }

    if (!MIME_EXTENSIONS[mimeType]?.has(pathnameExtension(pathname))) {
        throw requestError(
            400,
            "FILE_EXTENSION_MISMATCH",
            "L'extension du fichier ne correspond pas à son format."
        );
    }

    return pathname;
}

function parseClientPayload(clientPayload) {
    if (
        typeof clientPayload !== "string" ||
        !clientPayload ||
        Buffer.byteLength(clientPayload, "utf8") > 8_000
    ) {
        throw requestError(
            400,
            "UPLOAD_METADATA_INVALID",
            "Les informations du document sont invalides."
        );
    }

    let value;

    try {
        value = JSON.parse(clientPayload);
    } catch {
        throw requestError(
            400,
            "UPLOAD_METADATA_INVALID",
            "Les informations du document sont invalides."
        );
    }

    if (!isPlainObject(value)) {
        throw requestError(
            400,
            "UPLOAD_METADATA_INVALID",
            "Les informations du document sont invalides."
        );
    }

    const allowedFields = new Set([
        "equipmentId",
        "interventionId",
        "documentKind",
        "title",
        "description",
        "originalFilename",
        "mimeType",
        "accessToken",
    ]);

    for (const field of Object.keys(value)) {
        if (!allowedFields.has(field)) {
            throw requestError(
                400,
                "UPLOAD_METADATA_INVALID",
                `Le champ ${field} n'est pas autorisé.`
            );
        }
    }

    const equipmentId = requireUuid(
        value.equipmentId,
        "EQUIPMENT_ID_INVALID",
        "L'équipement sélectionné est invalide."
    );
    const interventionId = optionalUuid(
        value.interventionId,
        "INTERVENTION_ID_INVALID",
        "L'intervention sélectionnée est invalide."
    );
    const documentKind =
        typeof value.documentKind === "string"
            ? value.documentKind.trim().toLowerCase()
            : "";

    if (!DOCUMENT_KINDS.has(documentKind)) {
        throw requestError(
            400,
            "DOCUMENT_KIND_INVALID",
            "Le type de document est invalide."
        );
    }

    const accessToken =
        typeof value.accessToken === "string"
            ? value.accessToken.trim()
            : "";

    if (
        !accessToken ||
        accessToken.length > 4_096 ||
        hasForbiddenControlCharacter(accessToken)
    ) {
        throw requestError(
            401,
            "AUTH_TOKEN_INVALID",
            "La session utilisateur est invalide. Reconnecte-toi."
        );
    }

    return {
        equipmentId,
        interventionId,
        documentKind,
        title: normalizeText(value.title, {
            field: "Le titre",
            required: true,
            maxLength: 160,
        }),
        description: normalizeText(value.description, {
            field: "La description",
            maxLength: 1_000,
        }),
        originalFilename: normalizeOriginalFilename(value.originalFilename),
        mimeType: normalizeMimeType(value.mimeType),
        accessToken,
    };
}

async function loadEquipment(supabase, equipmentId, companyId) {
    const { data, error } = await supabase
        .from("equipments")
        .select("id")
        .eq("id", equipmentId)
        .eq("company_id", companyId)
        .maybeSingle();

    if (error) {
        throw requestError(
            503,
            "DATABASE_UNAVAILABLE",
            "La vérification de l'équipement est momentanément indisponible."
        );
    }

    if (!data) {
        throw requestError(
            404,
            "EQUIPMENT_NOT_FOUND",
            "Cet équipement est introuvable dans ton entreprise."
        );
    }

    return data;
}

async function loadIntervention(
    supabase,
    interventionId,
    equipmentId,
    companyId
) {
    if (!interventionId) return null;

    const { data, error } = await supabase
        .from("interventions")
        .select("id")
        .eq("id", interventionId)
        .eq("equipment_id", equipmentId)
        .eq("company_id", companyId)
        .maybeSingle();

    if (error) {
        throw requestError(
            503,
            "DATABASE_UNAVAILABLE",
            "La vérification de l'intervention est momentanément indisponible."
        );
    }

    if (!data) {
        throw requestError(
            404,
            "INTERVENTION_NOT_FOUND",
            "Cette intervention n'appartient pas à l'équipement sélectionné."
        );
    }

    return data;
}

function parseTrustedTokenPayload(tokenPayload) {
    if (
        typeof tokenPayload !== "string" ||
        !tokenPayload ||
        Buffer.byteLength(tokenPayload, "utf8") > 12_000
    ) {
        throw new Error("Invalid attachment token payload");
    }

    const value = JSON.parse(tokenPayload);

    if (
        !isPlainObject(value) ||
        value.version !== 1 ||
        !UUID_PATTERN.test(value.companyId || "") ||
        !UUID_PATTERN.test(value.equipmentId || "") ||
        !UUID_PATTERN.test(value.uploadedBy || "") ||
        (value.interventionId !== null &&
            !UUID_PATTERN.test(value.interventionId || "")) ||
        !DOCUMENT_KINDS.has(value.documentKind) ||
        !ALLOWED_MIME_TYPES.has(value.mimeType) ||
        typeof value.pathname !== "string" ||
        typeof value.title !== "string" ||
        typeof value.originalFilename !== "string"
    ) {
        throw new Error("Invalid attachment token payload");
    }

    return value;
}

function detectMimeType(header) {
    if (
        header.length >= 5 &&
        header.subarray(0, 5).toString("ascii") === "%PDF-"
    ) {
        return "application/pdf";
    }

    // Certains PDF contiennent quelques octets avant leur en-tête.
    if (header.toString("latin1").includes("%PDF-")) {
        return "application/pdf";
    }

    if (
        header.length >= 3 &&
        header[0] === 0xff &&
        header[1] === 0xd8 &&
        header[2] === 0xff
    ) {
        return "image/jpeg";
    }

    if (
        header.length >= 8 &&
        header.subarray(0, 8).equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        )
    ) {
        return "image/png";
    }

    if (
        header.length >= 12 &&
        header.subarray(0, 4).toString("ascii") === "RIFF" &&
        header.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
        return "image/webp";
    }

    return null;
}

async function inspectPrivateBlob(pathname, expectedMimeType) {
    const result = await get(pathname, {
        access: "private",
        useCache: false,
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
        throw new Error("Uploaded private blob not found");
    }

    if (
        !Number.isSafeInteger(result.blob.size) ||
        result.blob.size <= 0 ||
        result.blob.size > MAX_FILE_BYTES
    ) {
        throw requestError(
            400,
            "FILE_SIZE_INVALID",
            "Le fichier doit contenir des données et ne pas dépasser 10 Mo."
        );
    }

    const hash = createHash("sha256");
    let header = Buffer.alloc(0);
    let totalBytes = 0;

    for await (const chunk of result.stream) {
        const buffer = Buffer.from(chunk);
        totalBytes += buffer.length;

        if (totalBytes > MAX_FILE_BYTES) {
            throw requestError(
                400,
                "FILE_SIZE_INVALID",
                "Le fichier ne doit pas dépasser 10 Mo."
            );
        }

        hash.update(buffer);

        if (header.length < 1_024) {
            header = Buffer.concat([
                header,
                buffer.subarray(0, 1_024 - header.length),
            ]);
        }
    }

    if (totalBytes !== result.blob.size) {
        throw new Error("Uploaded blob size mismatch");
    }

    const detectedMimeType = detectMimeType(header);

    if (
        detectedMimeType !== expectedMimeType ||
        result.blob.contentType !== expectedMimeType
    ) {
        throw requestError(
            400,
            "FILE_CONTENT_INVALID",
            "Le contenu réel du fichier ne correspond pas au format annoncé."
        );
    }

    const sha256 = hash.digest("hex");

    if (!SHA256_PATTERN.test(sha256)) {
        throw new Error("Invalid SHA-256 result");
    }

    return {
        blobUrl: result.blob.url,
        mimeType: detectedMimeType,
        sizeBytes: totalBytes,
        sha256,
    };
}

async function deleteInvalidBlob(pathname) {
    try {
        await del(pathname);
    } catch {
        console.error("Suppression d'un Blob privé invalide impossible.");
    }
}

async function attachmentAlreadyRecorded(supabase, pathname) {
    const { data, error } = await supabase
        .from("equipment_private_attachments")
        .select("id")
        .eq("blob_pathname", pathname)
        .maybeSingle();

    if (error) {
        throw new Error("Attachment idempotency check failed");
    }

    return Boolean(data);
}

async function completeUpload(payload) {
    const metadata = parseTrustedTokenPayload(payload.tokenPayload);
    const pathname = payload.blob?.pathname;

    if (
        typeof pathname !== "string" ||
        pathname !== metadata.pathname ||
        payload.blob?.contentType !== metadata.mimeType
    ) {
        if (typeof pathname === "string") {
            await deleteInvalidBlob(pathname);
        }

        console.error("Webhook Blob refusé : métadonnées incohérentes.");
        return;
    }

    const supabase = createAdminSupabase();

    if (await attachmentAlreadyRecorded(supabase, pathname)) {
        return;
    }

    try {
        await loadEquipment(
            supabase,
            metadata.equipmentId,
            metadata.companyId
        );
        await loadIntervention(
            supabase,
            metadata.interventionId,
            metadata.equipmentId,
            metadata.companyId
        );
    } catch (error) {
        if (error?.status === 404) {
            await deleteInvalidBlob(pathname);
            console.error("Webhook Blob refusé : périmètre métier introuvable.");
            return;
        }

        throw error;
    }

    let inspected;

    try {
        inspected = await inspectPrivateBlob(pathname, metadata.mimeType);
    } catch (error) {
        if (error?.status === 400) {
            await deleteInvalidBlob(pathname);
            console.error("Webhook Blob refusé : fichier invalide.");
            return;
        }

        throw error;
    }

    const row = {
        company_id: metadata.companyId,
        equipment_id: metadata.equipmentId,
        intervention_id: metadata.interventionId,
        uploaded_by: metadata.uploadedBy,
        document_kind: metadata.documentKind,
        title: metadata.title,
        description: metadata.description,
        original_filename: metadata.originalFilename,
        mime_type: inspected.mimeType,
        size_bytes: inspected.sizeBytes,
        blob_url: inspected.blobUrl,
        blob_pathname: pathname,
        sha256: inspected.sha256,
    };

    const { error } = await supabase
        .from("equipment_private_attachments")
        .upsert(row, {
            onConflict: "blob_pathname",
            ignoreDuplicates: true,
        });

    if (error) {
        throw new Error("Attachment metadata insert failed");
    }
}

async function issueUploadAuthorization(req, res, body) {
    const requested = body?.payload;

    if (!isPlainObject(requested)) {
        throw requestError(
            400,
            "UPLOAD_REQUEST_INVALID",
            "La demande d'envoi du fichier est invalide."
        );
    }

    const input = parseClientPayload(requested.clientPayload);

    // Le SDK Blob appelle directement handleUploadUrl et ne permet pas
    // d'ajouter l'en-tête Supabase. Le jeton de session voyage donc dans
    // clientPayload, sous HTTPS, puis il est contrôlé ici avant tout accès.
    req.headers.authorization = `Bearer ${input.accessToken}`;

    const creator = await requireVerifiedCompany(req, res);
    if (!creator) return null;

    if (
        !(await checkRateLimit(
            rateLimiters?.requests,
            `${creator.userId}:${getClientIp(req)}`,
            res
        ))
    ) {
        return null;
    }

    if (
        !(await checkRateLimit(
            rateLimiters?.mutations,
            `${creator.companyId}:${creator.userId}`,
            res
        ))
    ) {
        return null;
    }

    const pathname = validateRequestedPathname(
        requested.pathname,
        input.equipmentId,
        input.mimeType
    );

    // Multipart n'est pas utile sous 10 Mo et élargirait inutilement la surface
    // d'attaque de cette première version.
    if (requested.multipart === true) {
        throw requestError(
            400,
            "MULTIPART_FORBIDDEN",
            "L'envoi multipart n'est pas autorisé pour ces documents."
        );
    }

    const supabase = createAdminSupabase();
    await loadEquipment(supabase, input.equipmentId, creator.companyId);
    await loadIntervention(
        supabase,
        input.interventionId,
        input.equipmentId,
        creator.companyId
    );

    return {
        creator,
        input,
        pathname,
    };
}

async function handleUploadRequest(req, res) {
    const body = readJsonBody(req);
    let authorization = null;

    if (body.type === "blob.generate-presigned-url") {
        authorization = await issueUploadAuthorization(req, res, body);
        if (!authorization) return;
    } else if (body.type !== "blob.upload-completed") {
        throw requestError(
            400,
            "UPLOAD_EVENT_INVALID",
            "La demande d'envoi du fichier est invalide."
        );
    }

    const result = await handleUploadPresigned({
        request: req,
        body,
        webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY,
        getSignedToken: async (pathname) => {
            if (!authorization || pathname !== authorization.pathname) {
                throw requestError(
                    403,
                    "UPLOAD_FORBIDDEN",
                    "Cet envoi de fichier n'est pas autorisé."
                );
            }

            const validUntil = Date.now() + UPLOAD_TOKEN_TTL_MS;
            const token = await issueSignedToken({
                pathname,
                operations: ["put"],
                validUntil,
                allowedContentTypes: [authorization.input.mimeType],
                maximumSizeInBytes: MAX_FILE_BYTES,
            });

            const tokenPayload = JSON.stringify({
                version: 1,
                companyId: authorization.creator.companyId,
                equipmentId: authorization.input.equipmentId,
                interventionId: authorization.input.interventionId,
                uploadedBy: authorization.creator.userId,
                documentKind: authorization.input.documentKind,
                title: authorization.input.title,
                description: authorization.input.description,
                originalFilename: authorization.input.originalFilename,
                mimeType: authorization.input.mimeType,
                pathname,
            });

            return {
                token,
                urlOptions: {
                    validUntil,
                    allowedContentTypes: [authorization.input.mimeType],
                    maximumSizeInBytes: MAX_FILE_BYTES,
                    addRandomSuffix: false,
                    allowOverwrite: false,
                    cacheControlMaxAge: 60,
                    tokenPayload,
                },
            };
        },
        onUploadCompleted: completeUpload,
    });

    return res.status(200).json(result);
}

function mapAttachment(row, creator) {
    return {
        id: row.id,
        equipmentId: row.equipment_id,
        interventionId: row.intervention_id,
        uploadedBy: row.uploaded_by,
        documentKind: row.document_kind,
        title: row.title,
        description: row.description,
        originalFilename: row.original_filename,
        mimeType: row.mime_type,
        sizeBytes: Number(row.size_bytes),
        sha256: row.sha256,
        createdAt: row.created_at,
        canDelete:
            row.uploaded_by === creator.userId ||
            creator.role === "owner" ||
            creator.role === "admin",
        viewUrl: `/api/equipment-attachments?attachmentId=${encodeURIComponent(
            row.id
        )}&action=view`,
        downloadUrl: `/api/equipment-attachments?attachmentId=${encodeURIComponent(
            row.id
        )}&action=download`,
    };
}

async function authorizeReadRequest(req, res) {
    const creator = await requireVerifiedCompany(req, res);
    if (!creator) return null;

    if (
        !(await checkRateLimit(
            rateLimiters?.requests,
            `${creator.userId}:${getClientIp(req)}`,
            res
        ))
    ) {
        return null;
    }

    return creator;
}

async function listAttachments(req, res, creator, supabase) {
    const equipmentId = requireUuid(
        queryValue(req.query?.equipmentId),
        "EQUIPMENT_ID_INVALID",
        "L'équipement sélectionné est invalide."
    );
    const interventionId = optionalUuid(
        queryValue(req.query?.interventionId),
        "INTERVENTION_ID_INVALID",
        "L'intervention sélectionnée est invalide."
    );

    await loadEquipment(supabase, equipmentId, creator.companyId);
    await loadIntervention(
        supabase,
        interventionId,
        equipmentId,
        creator.companyId
    );

    let query = supabase
        .from("equipment_private_attachments")
        .select(ATTACHMENT_READ_COLUMNS)
        .eq("company_id", creator.companyId)
        .eq("equipment_id", equipmentId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);

    if (interventionId) {
        query = query.eq("intervention_id", interventionId);
    }

    const { data, error } = await query;

    if (error) {
        throw requestError(
            503,
            "DATABASE_UNAVAILABLE",
            "Le chargement des pièces jointes est momentanément indisponible."
        );
    }

    return res.status(200).json({
        ok: true,
        attachments: (data || []).map((row) =>
            mapAttachment(row, creator)
        ),
    });
}

async function loadPrivateAttachment(
    supabase,
    attachmentId,
    companyId
) {
    const { data, error } = await supabase
        .from("equipment_private_attachments")
        .select(ATTACHMENT_PRIVATE_COLUMNS)
        .eq("id", attachmentId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle();

    if (error) {
        throw requestError(
            503,
            "DATABASE_UNAVAILABLE",
            "Le chargement de la pièce jointe est momentanément indisponible."
        );
    }

    if (!data) {
        throw requestError(
            404,
            "ATTACHMENT_NOT_FOUND",
            "Cette pièce jointe est introuvable."
        );
    }

    return data;
}

function asciiFilename(value) {
    const normalized = value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._ -]/g, "_")
        .replace(/[\r\n"]/g, "_")
        .trim();

    return normalized.slice(0, 140) || "document-carnetpass";
}

function contentDisposition(filename, download) {
    const disposition = download ? "attachment" : "inline";
    const fallback = asciiFilename(filename);
    const encoded = encodeURIComponent(filename)
        .replace(/[!'()*]/g, (character) =>
            `%${character.charCodeAt(0).toString(16).toUpperCase()}`
        );

    return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

async function streamAttachment(req, res, creator, supabase) {
    const attachmentId = requireUuid(
        queryValue(req.query?.attachmentId),
        "ATTACHMENT_ID_INVALID",
        "La pièce jointe sélectionnée est invalide."
    );
    const action = queryValue(req.query?.action) || "view";

    if (action !== "view" && action !== "download") {
        throw requestError(
            400,
            "ATTACHMENT_ACTION_INVALID",
            "L'action demandée est invalide."
        );
    }

    const attachment = await loadPrivateAttachment(
        supabase,
        attachmentId,
        creator.companyId
    );

    const blob = await get(attachment.blob_pathname, {
        access: "private",
    });

    if (!blob || blob.statusCode !== 200 || !blob.stream) {
        throw requestError(
            410,
            "ATTACHMENT_FILE_MISSING",
            "Le fichier associé à cette pièce jointe n'est plus disponible."
        );
    }

    if (
        blob.blob.pathname !== attachment.blob_pathname ||
        blob.blob.contentType !== attachment.mime_type ||
        Number(blob.blob.size) !== Number(attachment.size_bytes)
    ) {
        throw requestError(
            409,
            "ATTACHMENT_INTEGRITY_ERROR",
            "L'intégrité de cette pièce jointe doit être vérifiée."
        );
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", attachment.mime_type);
    res.setHeader("Content-Length", String(blob.blob.size));
    res.setHeader(
        "Content-Disposition",
        contentDisposition(
            attachment.original_filename,
            action === "download"
        )
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");

    await pipeline(Readable.fromWeb(blob.stream), res);
}

async function readAttachments(req, res) {
    const creator = await authorizeReadRequest(req, res);
    if (!creator) return;

    const supabase = createAdminSupabase();

    if (queryValue(req.query?.attachmentId)) {
        return streamAttachment(req, res, creator, supabase);
    }

    return listAttachments(req, res, creator, supabase);
}

async function deleteAttachment(req, res) {
    const creator = await requireVerifiedCompany(req, res);
    if (!creator) return;

    if (
        !(await checkRateLimit(
            rateLimiters?.requests,
            `${creator.userId}:${getClientIp(req)}`,
            res
        ))
    ) {
        return;
    }

    if (
        !(await checkRateLimit(
            rateLimiters?.mutations,
            `${creator.companyId}:${creator.userId}`,
            res
        ))
    ) {
        return;
    }

    const attachmentId = requireUuid(
        queryValue(req.query?.attachmentId),
        "ATTACHMENT_ID_INVALID",
        "La pièce jointe sélectionnée est invalide."
    );
    const supabase = createAdminSupabase();
    const attachment = await loadPrivateAttachment(
        supabase,
        attachmentId,
        creator.companyId
    );

    const canDelete =
        attachment.uploaded_by === creator.userId ||
        creator.role === "owner" ||
        creator.role === "admin";

    if (!canDelete) {
        throw requestError(
            403,
            "ATTACHMENT_DELETE_FORBIDDEN",
            "Tu ne peux pas supprimer cette pièce jointe."
        );
    }

    const deletedAt = new Date().toISOString();
    const { data, error } = await supabase
        .from("equipment_private_attachments")
        .update({
            deleted_at: deletedAt,
            deleted_by: creator.userId,
        })
        .eq("id", attachment.id)
        .eq("company_id", creator.companyId)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();

    if (error) {
        throw requestError(
            503,
            "ATTACHMENT_DELETE_FAILED",
            "La suppression de la pièce jointe a échoué."
        );
    }

    if (!data) {
        throw requestError(
            409,
            "ATTACHMENT_ALREADY_DELETED",
            "Cette pièce jointe a déjà été supprimée."
        );
    }

    try {
        await del(attachment.blob_pathname);
    } catch {
        console.error("Nettoyage du Blob privé différé.");

        return res.status(202).json({
            ok: true,
            attachmentId: attachment.id,
            deletedAt,
            cleanupPending: true,
        });
    }

    return res.status(200).json({
        ok: true,
        attachmentId: attachment.id,
        deletedAt,
        cleanupPending: false,
    });
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");

    if (!["GET", "POST", "DELETE"].includes(req.method)) {
        res.setHeader("Allow", "GET, POST, DELETE");

        return res.status(405).json({
            ok: false,
            code: "METHOD_NOT_ALLOWED",
            error: "Méthode non autorisée.",
        });
    }

    try {
        if (req.method === "GET") {
            return await readAttachments(req, res);
        }

        if (req.method === "DELETE") {
            return await deleteAttachment(req, res);
        }

        return await handleUploadRequest(req, res);
    } catch (error) {
        if (res.headersSent) {
            console.error("Erreur après le début de la réponse pièces jointes.");
            return;
        }

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

        console.error("Erreur interne API pièces jointes privées.", error);

        return res.status(500).json({
            ok: false,
            code: "INTERNAL_ERROR",
            error: "Erreur interne lors de la gestion de la pièce jointe.",
        });
    }
}
