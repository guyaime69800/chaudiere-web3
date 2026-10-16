export const COMMERCIAL_TERMS_VERSION = "2026-10-12.3";
export const COMMERCIAL_TERMS_SHA256 = "bcc83e51b906a9771d931bbe38565da73c04b4070d7f5a727d10764a0db1dc03";
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
