import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { researchPilot } from "./lib/document-research.js";

const allowedEmail = "contact@carnetpass.fr";

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk.toString();
    if (body.length > 2048) throw new Error("TOO_LARGE");
  }
  return JSON.parse(body);
}

export default async function documentResearchHandler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Allow", "POST");
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée." });
  if (process.env.VERCEL_ENV !== "preview") return res.status(404).json({ error: "Fonction indisponible." });
  if (!req.headers?.["content-type"]?.startsWith("application/json")) return res.status(415).json({ error: "Format invalide." });

  const match = /^Bearer ([^\s]+)$/i.exec(req.headers?.authorization ?? "");
  if (!match || match[1].length > 16384) return res.status(401).json({ error: "Connexion requise." });
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) return res.status(503).json({ error: "Authentification indisponible." });

  try {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.getUser(match[1]);
    if (error || !data?.user?.email_confirmed_at || data.user.email?.toLowerCase() !== allowedEmail) {
      return res.status(403).json({ error: "Accès réservé à l'administration CarnetPass." });
    }

    let input;
    try { input = await readJson(req); }
    catch { return res.status(400).json({ error: "Recherche invalide." }); }
    if (!input || typeof input !== "object" || ["brand", "model", "reference"].some((key) => typeof input[key] !== "string" || input[key].length < 2 || input[key].length > 100)) {
      return res.status(400).json({ error: "Marque, modèle et référence exacts requis." });
    }

    if (!process.env.UPSTASH_REDIS_REST_KV_REST_API_URL || !process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN) {
      return res.status(503).json({ error: "Limitation des recherches indisponible." });
    }
    const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL, token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN });
    const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 h"), prefix: "carnetpass:document-research" });
    const limit = await limiter.limit(data.user.id);
    if (!limit.success) return res.status(429).json({ error: "Limite de cinq recherches par heure atteinte." });

    return res.status(200).json(researchPilot(input));
  } catch {
    return res.status(503).json({ error: "Recherche momentanément indisponible." });
  }
}
