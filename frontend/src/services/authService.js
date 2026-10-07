import { supabase } from "./supabaseClient";

export async function signUp({ fullName, email, phone, password, discoverySource, discoverySourceOther }) {
  const normalizedPhone = phone.replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]{10,15}$/.test(normalizedPhone)) {
    throw new Error("Invalid phone number");
  }
  if (discoverySource === "other" && !discoverySourceOther?.trim()) {
    throw new Error("Précisez comment vous avez connu CarnetPass.");
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: new URL("/espace-pro", window.location.origin).href,
      data: {
        full_name: fullName.trim(),
        professional_phone: normalizedPhone,
        discovery_source: discoverySource,
        ...(discoverySource === "other" && discoverySourceOther?.trim()
          ? { discovery_source_details: discoverySourceOther.trim().slice(0, 160) }
          : {}),
      },
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function updateProfessionalPhone(phone) {
  const normalizedPhone = String(phone || "").replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]{10,15}$/.test(normalizedPhone)) {
    throw new Error("Indiquez un numéro de téléphone professionnel valide (10 à 15 chiffres).");
  }

  const { error } = await supabase.auth.updateUser({
    data: { professional_phone: normalizedPhone },
  });

  if (error) {
    throw new Error("Impossible d’enregistrer le téléphone du compte. Reconnectez-vous puis réessayez.");
  }
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signOut() {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    try { await fetch("/api/maintenance-control", { method: "DELETE", headers: { Authorization: `Bearer ${data.session.access_token}` } }); }
    catch { /* Sign-out remains available if the maintenance service is down. */ }
  }
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}
