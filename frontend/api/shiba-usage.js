import { requireVerifiedCompany } from "../server/lib/require-verified-company.js";
import { getShibaPlan, readShibaUsage, shibaQuotaEnabled } from "../server/lib/shiba-quota.js";

export default async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "Méthode non autorisée." });
  if (!shibaQuotaEnabled()) return response.status(200).json({ enabled: false });
  const professional = await requireVerifiedCompany(request, response);
  if (!professional) return;
  try {
    const plan = await getShibaPlan(request, professional);
    return response.status(200).json(await readShibaUsage(professional, plan));
  } catch (error) {
    console.error("Compteur Shiba indisponible :", error);
    return response.status(503).json({ error: "Le compteur Shiba est momentanément indisponible." });
  }
}
