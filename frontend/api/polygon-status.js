import { requireVerifiedCompany } from "../server/lib/require-verified-company.js";
import { checkEquipmentRegistryV2 } from "../server/lib/equipment-registry-v2.js";
import { reportAnomaly } from "../server/lib/anomaly-alert.js";

export default async function handler(req, res) {
  const startedAt = Date.now();
  const requestId = req.headers?.["x-vercel-id"] ?? null;

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

  const creator = await requireVerifiedCompany(req, res);

  if (!creator) return;

  if (!["owner", "admin"].includes(creator.role)) {
    return res.status(403).json({
      ok: false,
      code: "ROLE_FORBIDDEN",
      error:
        "Seul un propriétaire ou un administrateur peut consulter l’état Polygon.",
    });
  }

  try {
    const status = await checkEquipmentRegistryV2();
    const polygonIssue = status.chainId !== 137 || status.paused || !status.serverAuthorized;
    if (polygonIssue) await reportAnomaly("polygon_critical", "network_contract_or_authorization");
    else if (status.balanceStatus === "critical") await reportAnomaly("polygon_critical", "low_balance");
    else if (status.balanceStatus === "warning") await reportAnomaly("polygon_warning", "low_balance");
    const logMethod =
      status.balanceStatus === "healthy" ? "log" : "warn";

    console[logMethod](
      JSON.stringify({
        level:
          status.balanceStatus === "healthy" ? "info" : "warn",
        message: "polygon_status_checked",
        route: "/api/polygon-status",
        requestId,
        durationMs: Date.now() - startedAt,
        balanceStatus: status.balanceStatus,
        serverAuthorized: status.serverAuthorized,
        paused: status.paused,
      })
    );

    return res.status(200).json({
      ok: true,
      polygon: {
        chainId: status.chainId,
        contractAddress: status.contractAddress,
        serverWalletAddress: status.serverWalletAddress,
        serverAuthorized: status.serverAuthorized,
        paused: status.paused,
        balanceWei: status.balanceWei,
        balancePol: status.balancePol,
        balanceStatus: status.balanceStatus,
        balanceThresholds: status.balanceThresholds,
      },
    });
  } catch (error) {
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
      JSON.stringify({
        level: "error",
        message: "polygon_status_failed",
        route: "/api/polygon-status",
        requestId,
        durationMs: Date.now() - startedAt,
        diagnostic,
      })
    );
    await reportAnomaly("polygon_unavailable", diagnostic);

    return res.status(503).json({
      ok: false,
      error:
        "Le contrôle Polygon V2 est momentanément indisponible.",
      diagnostic,
    });
  }
}
