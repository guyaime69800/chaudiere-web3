import { supabase } from "./supabaseClient";

function getCompanyErrorMessage(error) {
  const message = error?.message || "";

  if (message.includes("14 chiffres")) {
    return "Le SIRET doit contenir exactement 14 chiffres.";
  }

  if (message.includes("appartenez déjà")) {
    return "Votre compte est déjà rattaché à une entreprise.";
  }

  if (error?.code === "23505") {
    return "Certaines informations existent déjà. Vérifiez votre entreprise avant de réessayer.";
  }

  return "Impossible d’enregistrer l’entreprise. Veuillez réessayer.";
}

export async function createCompany({
  name,
  siret,
  phone,
  jobTitle,
}) {
  const { data, error } = await supabase.rpc(
    "create_company_onboarding",
    {
      p_name: name.trim(),
      p_siret: siret.trim() || null,
      p_phone: phone.trim() || null,
      p_job_title: jobTitle.trim() || null,
    }
  );

  if (error) {
    throw new Error(getCompanyErrorMessage(error));
  }

  return data;
}

export async function getMyCompany(userId) {
  if (!userId) {
    return null;
  }

  // Récupère les appartenances du compte connecté.
  const {
    data: memberships,
    error: membershipError,
  } = await supabase
    .from("company_members")
    .select("company_id, role, created_at")
    .eq("user_id", userId)
    .limit(2);

  if (membershipError) {
    throw new Error(
      "Impossible de vérifier votre entreprise."
    );
  }

  if (!memberships || memberships.length === 0) {
    return null;
  }

  // Comme l’API, on refuse de choisir une entreprise au hasard.
  if (memberships.length !== 1) {
    throw new Error(
      "Plusieurs entreprises sont associées à votre compte. Contactez l’assistance."
    );
  }

  const membership = memberships[0];

  // Charge les informations de l’entreprise.
  const {
    data: company,
    error: companyError,
  } = await supabase
    .from("companies")
    .select("id, name, siret, phone, is_demo, created_at")
    .eq("id", membership.company_id)
    .single();

  if (companyError) {
    throw new Error(
      "Impossible de charger les informations de l’entreprise."
    );
  }

  // Charge son abonnement.
  const {
    data: subscription,
    error: subscriptionError,
  } = await supabase
    .from("subscriptions")
    .select(
      "plan, status, trial_ends_at, current_period_end"
    )
    .eq("company_id", membership.company_id)
    .maybeSingle();

  if (subscriptionError) {
    throw new Error(
      "Impossible de charger l’abonnement."
    );
  }

  // Charge la validation en lecture seule.
  // Le navigateur ne peut pas approuver l’entreprise.
  const {
    data: verification,
    error: verificationError,
  } = await supabase
    .from("company_verifications")
    .select(
      "status, verified_siret, verified_at, updated_at"
    )
    .eq("company_id", membership.company_id)
    .maybeSingle();

  if (verificationError) {
    throw new Error(
      "Impossible de charger le statut de validation de l’entreprise. Réessayez."
    );
  }

  return {
    ...company,
    role: membership.role,
    subscription,

    // Sans ligne de validation, l’entreprise reste non validée.
    verification: verification ?? {
      status: "pending",
      verified_siret: null,
      verified_at: null,
      updated_at: null,
    },
  };
}

export async function updateCompanySiret(companyId, siret) {
  const normalizedSiret = siret.replace(/\s/g, "");
  if (!/^\d{14}$/.test(normalizedSiret)) {
    throw new Error("Le SIRET doit contenir exactement 14 chiffres.");
  }

  const { error } = await supabase.rpc("update_company_siret", {
    p_company_id: companyId,
    p_siret: normalizedSiret,
  });

  if (error) {
    if (error.code === "42501") {
      throw new Error("Votre session ou votre rôle ne permet pas cette modification. Reconnectez-vous ou contactez le propriétaire.");
    }
    if (error.code === "22023") {
      throw new Error("Le SIRET doit contenir exactement 14 chiffres.");
    }
    throw new Error("Impossible d’enregistrer le SIRET. Actualisez le statut avant de réessayer.");
  }
}

export async function verifyMyCompany() {
  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession();

  const accessToken = sessionData?.session?.access_token;

  if (sessionError || !accessToken) {
    throw new Error(
      "Votre connexion a expiré. Reconnectez-vous."
    );
  }

  let response;

  try {
    response = await fetch("/api/verify-company", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    throw new Error(
      "Le service de vérification est inaccessible. Réessayez."
    );
  }

  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.ok) {
    throw new Error(
      result?.error
      || "Impossible de vérifier l’entreprise."
    );
  }

  return result;
}