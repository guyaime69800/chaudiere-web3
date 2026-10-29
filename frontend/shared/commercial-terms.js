export const COMMERCIAL_TERMS_VERSION = "2026-10-20.3";
export const COMMERCIAL_TERMS_SHA256 = "2784e90905444865077a5a94d5234cee2a130b1c46131dfe35305b4e3818264f";
export const COMMERCIAL_TERMS_URL = "https://www.carnetpass.fr/conditions-commerciales";
export function acceptedCommercialTerms(value) {
  return value?.accepted === true && value.version === COMMERCIAL_TERMS_VERSION;
}
export function commercialTermsMetadata(userId, companyId, acceptedAt = new Date().toISOString()) {
  return {
    "metadata[cgv_version]": COMMERCIAL_TERMS_VERSION,
    "metadata[cgv_sha256]": COMMERCIAL_TERMS_SHA256,
    "metadata[cgv_user_id]": userId,
    "metadata[cgv_company_id]": companyId,
    "metadata[cgv_accepted_at]": acceptedAt,
    "consent_collection[terms_of_service]": "required",
    "custom_text[terms_of_service_acceptance][message]": `J'accepte les [CGV CarnetPass](${COMMERCIAL_TERMS_URL}).`,
  };
}
