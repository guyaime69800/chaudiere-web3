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
    return "Une entreprise utilise déjà ce numéro SIRET.";
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

  const { data: membership, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(
      "Impossible de vérifier votre entreprise."
    );
  }

  if (!membership) {
    return null;
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, siret, phone, created_at")
    .eq("id", membership.company_id)
    .single();

  if (companyError) {
    throw new Error(
      "Impossible de charger les informations de l’entreprise."
    );
  }

  const { data: subscription, error: subscriptionError } =
    await supabase
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

  return {
    ...company,
    role: membership.role,
    subscription,
  };
}