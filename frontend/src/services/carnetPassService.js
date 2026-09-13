import { supabase } from "./supabaseClient";

const CARNETPASS_ID_PATTERN = /^CP-\d{4}-\d{6}$/;

function sanitizeStatus(value) {
  if (!value || typeof value !== "object" || value.exists !== true) {
    return { exists: false };
  }

  if (!CARNETPASS_ID_PATTERN.test(value.carnetPassId || "")) {
    return { exists: false };
  }

  const status = ["active", "blockchain_pending", "unavailable"].includes(
    value.status
  )
    ? value.status
    : "unavailable";

  return {
    exists: true,
    carnetPassId: value.carnetPassId,
    status,
  };
}

export async function getCompanyCarnetPassStatuses(serialNumbers) {
  if (!Array.isArray(serialNumbers) || serialNumbers.length === 0) {
    return [];
  }

  const { data, error } = await supabase.auth.getSession();

  if (error || !data?.session?.access_token) {
    throw new Error("Reconnectez-vous pour vérifier les CarnetPass.");
  }

  const response = await fetch("/api/carnetpass-status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ serialNumbers }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || result?.ok !== true) {
    throw new Error(
      result?.error || "Impossible de vérifier les CarnetPass."
    );
  }

  if (
    !Array.isArray(result.statuses)
    || result.statuses.length !== serialNumbers.length
  ) {
    throw new Error("Réponse de vérification CarnetPass invalide.");
  }

  return result.statuses.map(sanitizeStatus);
}