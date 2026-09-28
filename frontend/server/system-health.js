import { Redis } from "@upstash/redis";
import { requireVerifiedCompany } from "./lib/require-verified-company.js";
import { reportAnomaly } from "./lib/anomaly-alert.js";

export default async function systemHealthHandler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée." });
  const professional = await requireVerifiedCompany(req, res);
  if (!professional) return;
  if (!["owner", "admin"].includes(professional.role)) return res.status(403).json({ error: "Accès réservé aux responsables." });

  const checks = {
    database: "ok", // L'authentification et l'entreprise viennent d'être vérifiées dans Supabase.
    ai: process.env.OPENAI_API_KEY ? "configured" : "unavailable",
    email: process.env.RESEND_API_KEY ? "configured" : "unavailable",
    stripeTest: process.env.VERCEL_ENV === "preview"
      ? (process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY)?.startsWith("sk_test_") ? "configured" : "unavailable"
      : "not_applicable",
    redis: "unavailable",
  };
  if (process.env.UPSTASH_REDIS_REST_KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN) {
    try {
      const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL, token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN });
      await redis.ping();
      checks.redis = "ok";
    } catch { checks.redis = "unavailable"; }
  }
  const problems = Object.entries(checks).filter(([, state]) => state === "unavailable").map(([name]) => name);
  if (problems.length) await reportAnomaly("service_unavailable", problems.join(","));
  return res.status(200).json({ ok: problems.length === 0, checks, checkedAt: new Date().toISOString() });
}
