import { Redis } from "@upstash/redis";

const allowed = new Set(["polygon_warning", "polygon_critical", "polygon_unavailable", "service_unavailable", "shiba_grounding", "shiba_unavailable"]);

export async function reportAnomaly(type, detail) {
  if (!allowed.has(type)) return;
  const safeDetail = String(detail || "").replace(/[^a-zA-Z0-9_,.: -]/g, "").slice(0, 240);
  console.warn(JSON.stringify({ event: "carnetpass_anomaly", type, detail: safeDetail }));
  if (!process.env.RESEND_API_KEY || !process.env.UPSTASH_REDIS_REST_KV_REST_API_URL || !process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN) return;

  try {
    const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL, token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN });
    const key = `carnetpass:anomaly-alert:${process.env.VERCEL_ENV || "local"}:${type}`;
    const first = await redis.set(key, "1", { nx: true, ex: 3600 });
    if (first !== "OK") return;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "CarnetPass <contact@carnetpass.fr>",
        to: ["contact@carnetpass.fr"],
        subject: `[CarnetPass ${process.env.VERCEL_ENV || "local"}] Anomalie ${type}`,
        text: `Anomalie détectée : ${type}\nDétail technique : ${safeDetail}\nConsultez les journaux Vercel pour le diagnostic. Aucune donnée personnelle ni clé n'est incluse dans cette alerte.`,
      }),
    });
    if (!response.ok) {
      await redis.del(key);
      console.error("Envoi alerte CarnetPass indisponible", response.status);
    }
  } catch (error) {
    console.error("Signalement anomalie indisponible", error?.message);
  }
}
