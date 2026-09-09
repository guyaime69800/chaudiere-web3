import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// Cette route fonctionne uniquement côté serveur Vercel.
// La clé SUPABASE_SECRET_KEY ne doit jamais être utilisée dans frontend/src.

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

const verificationRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  prefix: "carnetpass:company-verification",
  analytics: true,
});

function sendError(res, status, code, message) {
  return res.status(status).json({
    ok: false,
    code,
    error: message,
  });
}

function getBearerToken(req) {
  const authorization = req.headers?.authorization;

  if (
    typeof authorization !== "string"
    || authorization.length > 16384
  ) {
    return null;
  }

  const match = /^Bearer ([^\s]+)$/i.exec(authorization);

  return match?.[1] || null;
}

function getVerificationRecord(value) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

function findExactEstablishment(result, siret) {
  const establishments = [
    result?.siege,
    ...(Array.isArray(result?.matching_etablissements)
      ? result.matching_etablissements
      : []),
  ];

  return establishments.find(
    (establishment) => establishment?.siret === siret
  ) || null;
}

async function saveVerificationResult(
  adminClient,
  companyId,
  siret,
  status
) {
  const { error } = await adminClient.rpc(
    "record_company_verification",
    {
      p_company_id: companyId,
      p_verified_siret: siret,
      p_status: status,
    }
  );

  if (error) {
    if (error.code === "40001") {
      throw new Error("SIRET_CHANGED");
    }

    if (error.code === "42501") {
      throw new Error("VERIFICATION_SUSPENDED");
    }

    throw new Error("VERIFICATION_SAVE_FAILED");
  }
}

export default async function handler(req, res) {
  res.setHeader("Allow", "POST");

  if (req.method !== "POST") {
    return sendError(
      res,
      405,
      "METHOD_NOT_ALLOWED",
      "Méthode non autorisée."
    );
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const publishableKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !publishableKey || !secretKey) {
    return sendError(
      res,
      503,
      "CONFIGURATION_UNAVAILABLE",
      "La vérification des entreprises est indisponible."
    );
  }

  const token = getBearerToken(req);

  if (!token) {
    return sendError(
      res,
      401,
      "AUTH_REQUIRED",
      "Connectez-vous pour vérifier votre entreprise."
    );
  }

  try {
    // Client utilisateur : il respecte les règles de sécurité RLS.
    const userClient = createClient(
      supabaseUrl,
      publishableKey,
      {
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
      }
    );

    const {
      data: authData,
      error: authError,
    } = await userClient.auth.getUser(token);

    if (authError || !authData?.user?.id) {
      return sendError(
        res,
        401,
        "AUTH_INVALID",
        "Votre connexion a expiré. Reconnectez-vous."
      );
    }

    const user = authData.user;

    if (user.is_anonymous || !user.email_confirmed_at) {
      return sendError(
        res,
        403,
        "ACCOUNT_UNCONFIRMED",
        "Confirmez votre adresse e-mail avant la vérification."
      );
    }

    const limit = await verificationRateLimit.limit(user.id);

    if (!limit.success) {
      const seconds = Number.isFinite(limit.reset)
        ? Math.max(
            1,
            Math.ceil((limit.reset - Date.now()) / 1000)
          )
        : 3600;

      res.setHeader("Retry-After", String(seconds));

      return sendError(
        res,
        429,
        "RATE_LIMITED",
        "Trop de vérifications. Réessayez plus tard."
      );
    }

    const {
      data: memberships,
      error: membershipError,
    } = await userClient
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", user.id)
      .limit(2);

    if (membershipError) {
      throw new Error("MEMBERSHIP_CHECK_FAILED");
    }

    if (!Array.isArray(memberships) || memberships.length !== 1) {
      return sendError(
        res,
        403,
        "COMPANY_REQUIRED",
        "Votre compte doit être rattaché à une seule entreprise."
      );
    }

    const membership = memberships[0];

    if (!["owner", "admin"].includes(membership.role)) {
      return sendError(
        res,
        403,
        "ROLE_FORBIDDEN",
        "Seul un propriétaire ou un administrateur peut vérifier l’entreprise."
      );
    }

    const {
      data: company,
      error: companyError,
    } = await userClient
      .from("companies")
      .select(
        "id, name, siret, company_verifications(status)"
      )
      .eq("id", membership.company_id)
      .maybeSingle();

    if (companyError || !company) {
      throw new Error("COMPANY_CHECK_FAILED");
    }

    const currentVerification = getVerificationRecord(
      company.company_verifications
    );

    if (currentVerification?.status === "suspended") {
      return sendError(
        res,
        403,
        "COMPANY_SUSPENDED",
        "La validation de cette entreprise est suspendue. Contactez l’assistance."
      );
    }

    const siret = String(company.siret || "")
      .replace(/\s/g, "");

    if (!/^[0-9]{14}$/.test(siret)) {
      return sendError(
        res,
        400,
        "SIRET_INVALID",
        "Le SIRET doit contenir exactement 14 chiffres."
      );
    }

    const officialUrl = new URL(
      "https://recherche-entreprises.api.gouv.fr/search"
    );

    officialUrl.searchParams.set("q", siret);
    officialUrl.searchParams.set("page", "1");
    officialUrl.searchParams.set("per_page", "1");
    officialUrl.searchParams.set("minimal", "true");
    officialUrl.searchParams.set(
      "include",
      "siege,matching_etablissements"
    );
    officialUrl.searchParams.set(
      "limite_matching_etablissements",
      "10"
    );

    let officialResponse;

    try {
      officialResponse = await fetch(officialUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "CarnetPass/1.0",
        },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return sendError(
        res,
        503,
        "OFFICIAL_API_UNAVAILABLE",
        "Le registre officiel ne répond pas. Réessayez plus tard."
      );
    }

    if (officialResponse.status === 429) {
      return sendError(
        res,
        503,
        "OFFICIAL_API_BUSY",
        "Le registre officiel est temporairement occupé. Réessayez plus tard."
      );
    }

    if (!officialResponse.ok) {
      return sendError(
        res,
        503,
        "OFFICIAL_API_UNAVAILABLE",
        "Le registre officiel est indisponible. Réessayez plus tard."
      );
    }

    const officialData = await officialResponse.json();
    const result = Array.isArray(officialData?.results)
      ? officialData.results[0]
      : null;

    // Certaines entreprises non diffusibles sont absentes de l’API.
    // Elles restent en attente pour permettre un contrôle manuel.
    if (!result) {
      return res.status(404).json({
        ok: false,
        code: "MANUAL_REVIEW_REQUIRED",
        error:
          "Entreprise introuvable dans le registre public. Une vérification manuelle est nécessaire.",
        status: "pending",
      });
    }

    const establishment = findExactEstablishment(result, siret);

    if (!establishment) {
      return res.status(404).json({
        ok: false,
        code: "MANUAL_REVIEW_REQUIRED",
        error:
          "L’établissement exact n’a pas été trouvé. Une vérification manuelle est nécessaire.",
        status: "pending",
      });
    }

    const companyIsActive =
      result.etat_administratif === "A";

    const establishmentIsActive =
      establishment.etat_administratif === "A";

    const adminClient = createClient(
      supabaseUrl,
      secretKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    if (!companyIsActive || !establishmentIsActive) {
      await saveVerificationResult(
        adminClient,
        company.id,
        siret,
        "rejected"
      );

      return res.status(200).json({
        ok: true,
        status: "rejected",
        message:
          "Ce SIRET correspond à une entreprise cessée ou à un établissement fermé.",
      });
    }

    await saveVerificationResult(
      adminClient,
      company.id,
      siret,
      "approved"
    );

    return res.status(200).json({
      ok: true,
      status: "approved",
      company: {
        name:
          result.nom_complet
          || result.nom_raison_sociale
          || company.name,
        siret,
        address: establishment.adresse || null,
        activity: establishment.activite_principale || null,
      },
      message: "Entreprise vérifiée avec succès.",
    });
  } catch (error) {
    if (error.message === "SIRET_CHANGED") {
      return sendError(
        res,
        409,
        "SIRET_CHANGED",
        "Le SIRET a changé pendant la vérification. Recommencez."
      );
    }

    if (error.message === "VERIFICATION_SUSPENDED") {
      return sendError(
        res,
        403,
        "COMPANY_SUSPENDED",
        "La validation de cette entreprise est suspendue."
      );
    }

    return sendError(
      res,
      503,
      "VERIFICATION_UNAVAILABLE",
      "Impossible de vérifier l’entreprise pour le moment."
    );
  }
}