import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const carnetPassId = req.body?.carnetPassId;
  const question = req.body?.question;
  if (typeof carnetPassId !== "string" || !/^CP-\d{4}-\d{6}$/.test(carnetPassId)
      || typeof question !== "string" || question.length > 8
      || !/^(?:F\s*\.?\s*)?0*\d{1,3}$/i.test(question.trim())) {
    return res.status(400).json({ ok: false, error: "Indiquez un code défaut valide." });
  }
  try {
    const carnet = await redis.get(`carnetpass:${carnetPassId}`);
    if (!carnet || carnet.status !== "active") return res.status(404).json({ ok: false, error: "CarnetPass indisponible." });
    const ip = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown").split(",")[0].trim();
    const visitor = createHash("sha256").update(`${ip}:${carnetPassId}`).digest("hex");
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const key = `public-shiba:${month}:${visitor}`;
    const count = Number(await redis.incr(key));
    if (count === 1) {
      const expiresAt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 1000;
      await redis.expireat(key, expiresAt);
    }
    if (count > 5) return res.status(429).json({ ok: false, remaining: 0, error: "Vous avez utilisé vos cinq questions Shiba Bot pour ce mois. Les entretiens, la notice disponible et les numéros d’urgence restent consultables. Pour cet appareil, contactez l’entreprise intervenante." });
    return res.status(200).json({ ok: true, remaining: 5 - count });
  } catch {
    return res.status(503).json({ ok: false, error: "Shiba Bot est momentanément indisponible. Les informations de sécurité restent accessibles." });
  }
}
