import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";
import {
    normalizeSerialNumber,
    toCompanyCarnetPassStatus,
} from "../server/lib/carnetpass-status.js";

const MAX_SERIAL_NUMBERS = 100;
const CARNETPASS_ID_PATTERN = /^CP-\d{4}-\d{6}$/;

function getBearerToken(req) {
    const authorization = req.headers.authorization;

    if (
        typeof authorization !== "string"
        || !authorization.startsWith("Bearer ")
    ) {
        return null;
    }

    const token = authorization.slice(7).trim();

    return token || null;
}

function getSupabaseAdmin() {
    const url =
        process.env.SUPABASE_URL
        || process.env.VITE_SUPABASE_URL;

    const serviceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY
        || process.env.SUPABASE_SECRET_KEY;

    if (!url || !serviceRoleKey) {
        throw new Error("Configuration Supabase serveur absente.");
    }

    return createClient(url, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

function getRedis() {
    const url =
        process.env.KV_REST_API_URL
        || process.env.UPSTASH_REDIS_REST_URL
        || process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;

    const token =
        process.env.KV_REST_API_TOKEN
        || process.env.UPSTASH_REDIS_REST_TOKEN
        || process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;

    if (!url || !token) {
        throw new Error("Configuration Redis serveur absente.");
    }

    return new Redis({ url, token });
}

async function getAuthenticatedUser(req, supabaseAdmin) {
    const token = getBearerToken(req);

    if (!token) return null;

    const {
        data: { user },
        error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) return null;

    return user;
}

async function getCompanyMembership(
    supabaseAdmin,
    userId,
    companyId
) {
    const { data, error } = await supabaseAdmin
        .from("company_members")
        .select("company_id")
        .eq("user_id", userId)
        .eq("company_id", companyId)
        .limit(1);

    if (error) {
        console.error("carnetpass-status membership query failed:", {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
        });

        throw new Error("Impossible de vérifier l’entreprise.");
    }

    return Array.isArray(data) ? data[0] || null : null;
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");

        return res.status(405).json({
            ok: false,
            code: "METHOD_NOT_ALLOWED",
            error: "Méthode non autorisée.",
        });
    }

    try {
        const supabaseAdmin = getSupabaseAdmin();
        const user = await getAuthenticatedUser(req, supabaseAdmin);

        if (!user) {
            return res.status(401).json({
                ok: false,
                code: "AUTH_REQUIRED",
                error: "Connexion professionnelle requise.",
            });
        }

        const companyId =
            typeof req.body?.companyId === "string"
                ? req.body.companyId.trim()
                : "";

        if (!companyId || companyId.length > 128) {
            return res.status(400).json({
                ok: false,
                code: "INVALID_COMPANY_ID",
                error: "Entreprise professionnelle invalide.",
            });
        }

        const membership = await getCompanyMembership(
            supabaseAdmin,
            user.id,
            companyId
        );

        if (!membership?.company_id) {
            return res.status(403).json({
                ok: false,
                code: "COMPANY_REQUIRED",
                error: "Accès à cette entreprise non autorisé.",
            });
        }

        const serialNumbers = req.body?.serialNumbers;

        if (
            !Array.isArray(serialNumbers)
            || serialNumbers.length === 0
            || serialNumbers.length > MAX_SERIAL_NUMBERS
        ) {
            return res.status(400).json({
                ok: false,
                code: "INVALID_SERIAL_NUMBERS",
                error: "Liste de numéros de série invalide.",
            });
        }

        const normalizedSerialNumbers = serialNumbers.map(
            normalizeSerialNumber
        );

        if (
            normalizedSerialNumbers.some(
                (serialNumber) => !serialNumber
            )
        ) {
            return res.status(400).json({
                ok: false,
                code: "INVALID_SERIAL_NUMBERS",
                error: "Liste de numéros de série invalide.",
            });
        }

        const redis = getRedis();

        const statuses = await Promise.all(
            normalizedSerialNumbers.map(async (serialNumber) => {
                const storedCarnetPassId = await redis.get(
                    `carnetpass:serial:${serialNumber}`
                );

                const carnetPassId =
                    typeof storedCarnetPassId === "string"
                        ? storedCarnetPassId.trim().toUpperCase()
                        : "";

                if (!CARNETPASS_ID_PATTERN.test(carnetPassId)) {
                    return { exists: false };
                }

                const value = await redis.get(
                    `carnetpass:${carnetPassId}`
                );

                return toCompanyCarnetPassStatus(
                    value,
                    companyId
                );
            })
        );

        return res.status(200).json({
            ok: true,
            statuses,
        });
    } catch (error) {
        console.error("carnetpass-status error:", error);

        return res.status(500).json({
            ok: false,
            code: "CARNETPASS_STATUS_FAILED",
            error: "Impossible de vérifier les CarnetPass.",
        });
    }
}