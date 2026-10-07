import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { createHash } from "node:crypto";
import { platformAdminEnvironment } from "./platform-admin-environment.js";
export const fail = (status, message) =>
  Object.assign(new Error(message), { status });
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
export function devisDatabase(env = process.env) {
  if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    throw fail(503, "Base Shiba Devis non configurée.");
  return createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
}
export function devisRedis(env = process.env) {
  const url =
    env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_KV_REST_API_URL;
  const token =
    env.UPSTASH_REDIS_REST_TOKEN || env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
  if (!url || !token) throw fail(503, "Protection technique indisponible.");
  return new Redis({ url, token });
}
export async function rateRequest(req, scope, identity = null, max = 60) {
  const ip = String(
    req.headers?.["x-forwarded-for"] || req.headers?.["x-real-ip"] || "unknown",
  )
    .split(",")[0]
    .trim();
  const key = identity || createHash("sha256").update(ip).digest("hex");
  const rate = new Ratelimit({
    redis: devisRedis(),
    limiter: Ratelimit.slidingWindow(max, "10 m"),
    prefix: `carnetpass:devis:${process.env.VERCEL_ENV || "local"}:${scope}`,
    analytics: false,
  });
  const result = await rate.limit(key);
  if (!result.success)
    throw fail(
      429,
      "Protection technique : réessayez dans quelques minutes. Aucun crédit Shiba Bot n’est consommé.",
    );
}
export async function readDevisBody(req, max = 32768) {
  let body = req.body;
  if (body === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > max) throw fail(413, "Requête trop volumineuse.");
      chunks.push(bytes);
    }
    body = Buffer.concat(chunks);
  }
  if (Buffer.isBuffer(body)) {
    if (body.length > max) throw fail(413, "Requête trop volumineuse.");
    body = body.toString("utf8");
  }
  if (typeof body === "string") {
    if (Buffer.byteLength(body) > max)
      throw fail(413, "Requête trop volumineuse.");
    try {
      body = JSON.parse(body);
    } catch {
      throw fail(400, "Requête invalide.");
    }
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Buffer.byteLength(JSON.stringify(body)) > max
  )
    throw fail(400, "Requête invalide.");
  return body;
}
export async function devisIdentity(req) {
  const token = /^Bearer ([^\s]+)$/i.exec(
    req.headers?.authorization || "",
  )?.[1];
  if (!token || token.length > 16384)
    throw fail(401, "Connectez-vous pour enregistrer ou gérer ces données.");
  const auth = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    options,
  );
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data?.user?.email_confirmed_at || data.user.is_anonymous)
    throw fail(401, "Connexion confirmée requise.");
  return { user: data.user, db: devisDatabase() };
}
export async function devisOperator(req) {
  const environment = platformAdminEnvironment(process.env);
  if (environment.status) throw fail(environment.status, environment.message);
  const context = await devisIdentity(req);
  const { data, error } = await context.db
    .from("platform_admins")
    .select("role")
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (error) throw fail(503, "Contrôle administrateur indisponible.");
  if (!data) throw fail(403, "Accès réservé à l’équipe CarnetPass.");
  return { ...context, operator: data };
}
export async function devisCompany(
  req,
  { verified = false, manager = false } = {},
) {
  const context = await devisIdentity(req);
  const { data: members, error } = await context.db
    .from("company_members")
    .select("company_id,role")
    .eq("user_id", context.user.id)
    .limit(2);
  if (error) throw fail(503, "Vérification d’entreprise indisponible.");
  if (
    members?.length !== 1 ||
    !["owner", "admin", "technician"].includes(members[0].role)
  )
    throw fail(403, "Entreprise unique autorisée requise.");
  if (manager && !["owner", "admin"].includes(members[0].role))
    throw fail(
      403,
      "Réservé au propriétaire ou à un administrateur de l’entreprise.",
    );
  const { data: company, error: ce } = await context.db
    .from("companies")
    .select("id,siret,company_verifications(status,verified_siret,verified_at)")
    .eq("id", members[0].company_id)
    .maybeSingle();
  if (ce || !company) throw fail(503, "Entreprise indisponible.");
  const verification = Array.isArray(company.company_verifications)
    ? company.company_verifications[0]
    : company.company_verifications;
  if (
    ["suspended", "rejected"].includes(verification?.status) ||
    (verified &&
      (verification?.status !== "approved" ||
        !verification.verified_at ||
        !/^\d{14}$/.test(company.siret || "") ||
        verification.verified_siret !== company.siret))
  )
    throw fail(
      403,
      "Une entreprise vérifiée et non suspendue est nécessaire pour analyser une plaque.",
    );
  return { ...context, company, member: members[0] };
}
export async function checked(
  query,
  message = "Données indisponibles. Appliquez la migration Shiba Devis si nécessaire.",
) {
  const { data, error } = await query;
  if (error) throw fail(503, message);
  return data;
}
export function sendDevisError(res, error) {
  return res
    .status(error.status || 503)
    .json({
      ok: false,
      error: error.status
        ? error.message
        : "Service temporairement indisponible. Vous pouvez continuer la préparation manuelle.",
    });
}
