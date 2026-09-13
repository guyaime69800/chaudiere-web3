const CARNETPASS_ID_PATTERN = /^CP-\d{4}-\d{6}$/;

function hasControlCharacter(value) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);

    return code <= 31 || code === 127;
  });
}

export function normalizeSerialNumber(value) {
  if (
    typeof value !== "string"
    || value.length > 128
    || hasControlCharacter(value)
  ) {
    return null;
  }

  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");

  return normalized || null;
}

export function decodeCarnetPassRecord(value) {
  if (!value) return null;

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") return null;

  try {
    const decoded = JSON.parse(value);

    return decoded && typeof decoded === "object" && !Array.isArray(decoded)
      ? decoded
      : null;
  } catch {
    return null;
  }
}

export function toCompanyCarnetPassStatus(value, companyId) {
  const carnetPass = decodeCarnetPassRecord(value);

  if (
    !carnetPass
    || typeof companyId !== "string"
    || carnetPass.createdByCompanyId !== companyId
    || !CARNETPASS_ID_PATTERN.test(carnetPass.carnetPassId || "")
  ) {
    return { exists: false };
  }

  const status = ["active", "blockchain_pending"].includes(carnetPass.status)
    ? carnetPass.status
    : "unavailable";

  return {
    exists: true,
    carnetPassId: carnetPass.carnetPassId,
    status,
  };
}