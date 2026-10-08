// Call only after auth.getUser(token) has verified this exact bearer token.
// Authorization never uses user_metadata or a browser-supplied assurance level.
export function mfaAccessError(verifiedUser, verifiedToken, { required = false } = {}) {
  const enrolled = verifiedUser?.factors?.some((factor) => factor.status === "verified");
  if (!required && !enrolled) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(verifiedToken.split(".")[1], "base64url").toString("utf8")); }
  catch { claims = null; }
  if (claims?.sub === verifiedUser.id && claims.aal === "aal2") return null;
  return {
    status: 403,
    code: enrolled ? "MFA_REQUIRED" : "MFA_ENROLLMENT_REQUIRED",
    message: enrolled
      ? "Validez le code de votre application d’authentification pour continuer."
      : "Activez la double authentification pour accéder à l’administration CarnetPass.",
  };
}

export async function accountMfaAccessError(verifiedUser, verifiedToken, database) {
  const enrolledError = mfaAccessError(verifiedUser, verifiedToken);
  if (enrolledError) return enrolledError;
  // A verified AAL2 bearer already satisfies either account policy.
  if (!mfaAccessError(verifiedUser, verifiedToken, { required: true })) return null;
  const { data: operator, error } = await database.from("platform_admins")
    .select("role").eq("user_id", verifiedUser.id).maybeSingle();
  if (error) return { status: 503, code: "MFA_UNAVAILABLE", message: "Contrôle de sécurité indisponible. Réessayez." };
  return mfaAccessError(verifiedUser, verifiedToken, { required: Boolean(operator) });
}
