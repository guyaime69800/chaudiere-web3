import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { MAINTENANCE_KEY } from "./lib/maintenance-state.js";

const options = { auth: { persistSession: false, autoRefreshToken: false } };

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2048) throw new Error("Body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (process.env.VERCEL_ENV !== "production") return res.status(404).json({ ok: false });
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ ok: false });
  const url = process.env.VITE_SUPABASE_URL;
  const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const redisUrl = process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
  if (!url || !publicKey || !secretKey || !redisUrl || !redisToken) {
    return res.status(503).json({ ok: false, error: "Configuration indisponible." });
  }
  const bearer = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "")?.[1];
  if (!bearer || bearer.length > 16384) return res.status(401).json({ ok: false });
  const auth = createClient(url, publicKey, options);
  const { data: { user }, error: authError } = await auth.auth.getUser(bearer);
  if (authError || !user?.email_confirmed_at) return res.status(401).json({ ok: false });
  const db = createClient(url, secretKey, options);
  const { data: operator, error: roleError } = await db.from("platform_admins")
    .select("role").eq("user_id", user.id).maybeSingle();
  if (roleError) return res.status(503).json({ ok: false, error: "Administration indisponible." });
  if (operator?.role !== "founder") return res.status(403).json({ ok: false });
  const redis = new Redis({ url: redisUrl, token: redisToken });
  try {
    if (req.method === "GET") {
      const state = await redis.get(MAINTENANCE_KEY);
      return res.status(200).json({ ok: true, state: state || { enabled: false } });
    }
    let body;
    try { body = await readBody(req); }
    catch { return res.status(400).json({ ok: false, error: "Requête invalide." }); }
    if (typeof body.enabled !== "boolean" || typeof body.message !== "string"
      || body.message.length > 300 || /[\u0000-\u001f\u007f]/.test(body.message)) {
      return res.status(400).json({ ok: false, error: "Paramètres invalides." });
    }
    const state = { enabled: body.enabled, message: body.message.trim(), updatedAt: new Date().toISOString(), updatedBy: user.id };
    await redis.set(MAINTENANCE_KEY, state);
    return res.status(200).json({ ok: true, state });
  } catch {
    return res.status(503).json({ ok: false, error: "État de maintenance indisponible." });
  }
}
