import { supabase } from "./supabaseClient";

const CARNETPASS_ID_PATTERN = /^CP-\d{4}-\d{6}$/;

function sanitizeStatus(value) {
  if (
    !value
    || typeof value !== "object"
    || value.exists !== true
  ) {
    return { exists: false };
  }

  if (
    !CARNETPASS_ID_PATTERN.test(
      value.carnetPassId || ""
    )
  ) {
    return { exists: false };
  }

  const status = [
    "active",
    "blockchain_pending",
    "unavailable",
  ].includes(value.status)
    ? value.status
    : "unavailable";

  return {
    exists: true,
    carnetPassId: value.carnetPassId,
    status,
  };
}

export async function getCompanyCarnetPassStatuses(
  companyId,
  equipments
) {
  const normalizedCompanyId =
    typeof companyId === "string"
      ? companyId.trim()
      : "";

  if (!normalizedCompanyId) {
    throw new Error(
      "Entreprise professionnelle invalide."
    );
  }

  if (
    !Array.isArray(equipments)
    || equipments.length === 0
  ) {
    return [];
  }

  const { data, error } =
    await supabase.auth.getSession();

  if (error || !data?.session?.access_token) {
    throw new Error(
      "Reconnectez-vous pour vérifier les CarnetPass."
    );
  }

  const response = await fetch(
    "/api/carnetpass-status",
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        companyId: normalizedCompanyId,
        equipments: equipments.map((equipment) => ({
          id: equipment.id,
          serialNumber: equipment.serial_number || null,
        })),
      }),
    }
  );

  const result = await response.json().catch(() => null);

  if (!response.ok || result?.ok !== true) {
    throw new Error(
      result?.error
      || "Impossible de vérifier les CarnetPass."
    );
  }

  if (
    !Array.isArray(result.statuses)
    || result.statuses.length !== equipments.length
  ) {
    throw new Error(
      "Réponse de vérification CarnetPass invalide."
    );
  }

  return result.statuses.map(sanitizeStatus);
}

export async function createCompanyCarnetPass(equipment) {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data?.session?.access_token) {
    throw new Error("Reconnectez-vous avant de créer le CarnetPass.");
  }

  const response = await fetch("/api/carnetpass", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      manufacturerReference: equipment.productReference.trim(),
      serialNumber: equipment.serialNumber.trim() || null,
      equipmentRecordId: equipment.equipmentRecordId || null,
      brand: equipment.brand.trim(),
      model: equipment.model.trim(),
      productType: equipment.productType,
    }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || result?.ok !== true) {
    throw new Error(result?.error || "Création du CarnetPass indisponible.");
  }

  if (
    !/^CP-\d{4}-\d{6}$/.test(result.carnetPassId || "")
    || !/^cp_qr_[A-Za-z0-9_-]{43}$/.test(result.qrToken || "")
  ) {
    throw new Error(
      "Réponse de création incomplète. Vérifiez le statut de l’équipement avant de réessayer.",
    );
  }

  return result;
}
