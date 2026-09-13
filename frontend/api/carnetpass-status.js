import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeSerialNumber,
  toCompanyCarnetPassStatus,
} from "../server/lib/carnetpass-status.js";

const MAX_SERIAL_NUMBERS = 100;

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
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY;

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
    || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN
    || process.env.UPSTASH_REDIS_REST_TOKEN;

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

async function getCompanyMembership(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Impossible de vérifier l’entreprise.");
  }

  return data;
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

    const membership = await getCompanyMembership(
      supabaseAdmin,
      user.id
    );

    if (!membership?.company_id) {
      return res.status(403).json({
        ok: false,
        code: "COMPANY_REQUIRED",
        error: "Aucune entreprise professionnelle trouvée.",
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

    if (normalizedSerialNumbers.some((serialNumber) => !serialNumber)) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_SERIAL_NUMBER",
        error: "Un numéro de série est invalide.",
      });
    }

    const redis = getRedis();

    const records = await Promise.all(
      normalizedSerialNumbers.map((serialNumber) =>
        redis.get(`carnetpass:serial:${serialNumber}`)
      )
    );

    const statuses = records.map((record) =>
      toCompanyCarnetPassStatus(record, membership.company_id)
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