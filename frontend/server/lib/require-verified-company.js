import { createClient } from "@supabase/supabase-js";

// Vérifie qu'une requête provient d'un utilisateur professionnel autorisé.
// Cette fonction n'utilise aucune clé administrateur Supabase.
// Elle vérifie le vrai jeton de connexion envoyé par l'utilisateur.

export async function requireVerifiedCompany(req, res) {
  const deny = (status, code, error) => {
    res.status(status).json({
      ok: false,
      code,
      error,
    });

    return null;
  };

  const authorization = req.headers?.authorization;

  const match =
    typeof authorization === "string" &&
    authorization.length <= 16384 &&
    /^Bearer ([^\s]+)$/i.exec(authorization);

  if (!match) {
    return deny(
      401,
      "AUTH_REQUIRED",
      "Connecte-toi à ton compte professionnel pour utiliser cette fonction."
    );
  }

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return deny(
      503,
      "AUTH_UNAVAILABLE",
      "La vérification des accès est indisponible. Réessaie plus tard."
    );
  }

  try {
    const token = match[1];

    const supabase = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // getUser vérifie réellement le jeton auprès de Supabase.
    // On ne fait pas confiance à un userId ou à un rôle envoyé par le navigateur.

    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError) {
      if (
        !authError.status ||
        authError.status >= 500 ||
        authError.status === 429
      ) {
        return deny(
          503,
          "AUTH_UNAVAILABLE",
          "La vérification des accès est indisponible. Réessaie plus tard."
        );
      }

      return deny(
        401,
        "AUTH_INVALID",
        "Ta connexion a expiré ou est invalide. Reconnecte-toi."
      );
    }

    const user = authData?.user;

    if (!user?.id || user.is_anonymous) {
      return deny(
        401,
        "AUTH_INVALID",
        "Connecte-toi à ton compte professionnel pour utiliser cette fonction."
      );
    }

    if (!user.email_confirmed_at) {
      return deny(
        403,
        "EMAIL_UNCONFIRMED",
        "Confirme ton adresse e-mail avant de continuer."
      );
    }

    const {
      data: memberships,
      error: membershipError,
    } = await supabase
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", user.id)
      .limit(2);

    if (membershipError) {
      throw new Error("Membership check failed");
    }

    if (!Array.isArray(memberships) || memberships.length === 0) {
      return deny(
        403,
        "COMPANY_REQUIRED",
        "Ton compte doit être rattaché à une entreprise validée."
      );
    }

    // Le parcours actuel prévoit une seule entreprise par utilisateur.
    // En cas d'ambiguïté, on refuse plutôt que de choisir au hasard.

    if (memberships.length !== 1) {
      return deny(
        403,
        "COMPANY_AMBIGUOUS",
        "Plusieurs entreprises sont associées à ton compte. Contacte l'assistance."
      );
    }

    const membership = memberships[0];

    if (
      !membership.company_id ||
      !["owner", "admin", "technician"].includes(membership.role)
    ) {
      return deny(
        403,
        "ROLE_FORBIDDEN",
        "Ton rôle ne permet pas d'utiliser cette fonction."
      );
    }

    const {
      data: company,
      error: companyError,
    } = await supabase
      .from("companies")
      .select(
        "id, siret, is_demo, company_verifications(status, verified_siret, verified_at)"
      )
      .eq("id", membership.company_id)
      .maybeSingle();

    if (companyError) {
      throw new Error("Company check failed");
    }

    const verification = company?.company_verifications;

    const demoAllowed =
      company?.is_demo === true &&
      verification?.status !== "suspended";

    const verifiedAllowed =
      verification?.status === "approved" &&
      typeof company?.siret === "string" &&
      /^[0-9]{14}$/.test(company.siret) &&
      company.siret === verification.verified_siret &&
      Boolean(verification.verified_at);

    if (!company || (!demoAllowed && !verifiedAllowed)) {
      return deny(
        403,
        "COMPANY_NOT_APPROVED",
        "Ton entreprise doit être validée avant de pouvoir utiliser cette fonction."
      );
    }

    return {
      userId: user.id,
      companyId: company.id,
      role: membership.role,
    };
  } catch {
    // Ne jamais afficher le jeton, les clés ou les erreurs brutes Supabase.

    return deny(
      503,
      "AUTH_UNAVAILABLE",
      "La vérification des accès est indisponible. Réessaie plus tard."
    );
  }
}