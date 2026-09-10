import { requireVerifiedCompany } from "../server/lib/require-verified-company.js";
import { checkEquipmentRegistryV2 } from "../server/lib/equipment-registry-v2.js";

export default async function handler(req, res) {
  // Cette route contient des informations de contrôle :
  // on interdit leur mise en cache.
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      ok: false,
      error: "Méthode non autorisée.",
    });
  }

  // Vérifie le compte Supabase, l'entreprise et le rôle.
  const creator = await requireVerifiedCompany(req, res);

  if (!creator) return;

  try {
    // Lecture uniquement :
    // cette fonction ne doit envoyer aucune transaction blockchain.
    const status = await checkEquipmentRegistryV2();

    return res.status(200).json({
      ok: true,
      polygon: {
        chainId: status.chainId,
        contractAddress: status.contractAddress,
        serverWalletAddress: status.serverWalletAddress,
        serverAuthorized: status.serverAuthorized,
        paused: status.paused,
        balanceWei: status.balanceWei,
      },
    });
  } catch {
    // Ne jamais renvoyer une clé privée, un RPC secret
    // ou une erreur brute provenant de Polygon / ethers.
    console.error("Erreur de contrôle EquipmentRegistryV2.");

    return res.status(503).json({
      ok: false,
      error: "Le contrôle Polygon V2 est momentanément indisponible.",
    });
  }
}