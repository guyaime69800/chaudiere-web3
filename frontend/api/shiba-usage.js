import { requireVerifiedCompany } from "../server/lib/require-verified-company.js";
import { getShibaPlan, readShibaUsage, shibaQuotaEnabled } from "../server/lib/shiba-quota.js";

export default async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "Méthode non autorisée." });
  if (!shibaQuotaEnabled() && process.env.VERCEL_ENV !== "production") return response.status(200).json({ enabled: false });
  const professional = await requireVerifiedCompany(request, response);
  if (!professional) return;
  if (process.env.VERCEL_ENV === "production" && professional.accessKind !== "discovery") {
    return response.status(200).json({ enabled: false });
  }
  try {
    const plan = process.env.VERCEL_ENV === "production" ? "free" : await getShibaPlan(request, professional);
    return response.status(200).json(await readShibaUsage(professional, plan));
  } catch (error) {
    console.error("Compteur Shiba indisponible :", error);
    return response.status(503).json({ error: "Le compteur Shiba est momentanément indisponible." });
  }
}
