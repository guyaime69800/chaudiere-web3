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
    } catch (error) {
    // Seuls ces codes de diagnostic peuvent être renvoyés.
    // Aucune clé privée, URL RPC ou erreur brute n'est exposée.
    const allowedDiagnostics = new Set([
      "RPC_URL_INVALID",
      "RPC_URL_NOT_HTTPS",
      "PRIVATE_KEY_FORMAT",
      "CONTRACT_ADDRESS_INVALID",
      "SERVER_WALLET_ADDRESS_INVALID",
      "RPC_CONNECTION_FAILED",
      "WRONG_NETWORK",
      "PRIVATE_KEY_PARSE_FAILED",
      "WALLET_MISMATCH",
      "CONTRACT_LOOKUP_FAILED",
      "CONTRACT_NOT_FOUND",
      "CONTRACT_READ_FAILED",
    ]);

    const diagnostic =
      typeof error?.code === "string" &&
      allowedDiagnostics.has(error.code)
        ? error.code
        : typeof error?.code === "string" &&
            error.code.startsWith("ENV_MISSING_")
          ? error.code
          : "UNKNOWN";

    console.error(
      "Erreur de contrôle EquipmentRegistryV2 :",
      diagnostic
    );

    return res.status(503).json({
      ok: false,
      error: "Le contrôle Polygon V2 est momentanément indisponible.",
      diagnostic,
    });
}
}
