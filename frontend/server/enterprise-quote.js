import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const limiter = process.env.UPSTASH_REDIS_REST_KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN
  ? new Ratelimit({ redis: new Redis({ url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL, token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN }), limiter: Ratelimit.slidingWindow(3, "1 h"), prefix: "carnetpass:enterprise-quote" })
  : null;

function clean(value, maximum) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk.toString();
    if (body.length > 12000) throw new Error("TOO_LARGE");
  }
  return JSON.parse(body);
}

export default async function enterpriseQuoteHandler(req, res) {
  res.setHeader("Allow", "POST");
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée." });
  if (!req.headers?.["content-type"]?.startsWith("application/json")) return res.status(415).json({ error: "Format de demande invalide." });

  let data;
  try { data = await readJson(req); }
  catch { return res.status(400).json({ error: "Questionnaire invalide." }); }
  if (!data || typeof data !== "object" || Array.isArray(data)) return res.status(400).json({ error: "Questionnaire invalide." });
  if (clean(data.website, 200)) return res.status(200).json({ ok: true });

  const company = clean(data.company, 120);
  const name = clean(data.name, 100);
  const email = clean(data.email, 254);
  const phone = clean(data.phone, 40);
  const needs = clean(data.needs, 3000);
  const timing = clean(data.timing, 40);
  const technicians = Number(data.technicians);
  const equipment = data.equipment === "" ? null : Number(data.equipment);
  if (!company || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || needs.length < 20 || !Number.isInteger(technicians) || technicians < 1 || technicians > 100000 || (equipment !== null && (!Number.isInteger(equipment) || equipment < 0 || equipment > 10000000))) {
    return res.status(400).json({ error: "Vérifiez les champs obligatoires du questionnaire." });
  }
  if (!limiter) return res.status(503).json({ error: "Le formulaire est temporairement indisponible. Réessayez plus tard." });
  try {
    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
    const limit = await limiter.limit(ip);
    if (!limit.success) return res.status(429).json({ error: "Trop de demandes ont été envoyées. Réessayez dans une heure." });
  } catch {
    return res.status(503).json({ error: "Le formulaire est temporairement indisponible. Réessayez plus tard." });
  }
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: "L’envoi des demandes n’est pas encore configuré. Réessayez plus tard." });

  const text = [
    "Nouvelle demande de formule Entreprise CarnetPass",
    `Entreprise : ${company}`,
    `Contact : ${name}`,
    `E-mail : ${email}`,
    `Téléphone : ${phone || "Non renseigné"}`,
    `Techniciens : ${technicians}`,
    `Équipements : ${equipment ?? "Non renseigné"}`,
    `Échéance : ${timing || "Non précisée"}`,
    "",
    "Besoins et contraintes :",
    needs,
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.ENTERPRISE_QUOTE_FROM_EMAIL || "CarnetPass <contact@carnetpass.fr>", to: ["contact@carnetpass.fr"], reply_to: email, subject: `Demande Entreprise CarnetPass — ${company}`, text }),
    });
    if (!response.ok) throw new Error(`Resend ${response.status}`);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Échec envoi demande Entreprise", error);
    return res.status(502).json({ error: "La demande n’a pas pu être envoyée. Réessayez plus tard." });
  }
}
