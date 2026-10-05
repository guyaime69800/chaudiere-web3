import { supabase } from "./supabaseClient";

export async function signUp({ fullName, email, phone, password, discoverySource }) {
  const normalizedPhone = phone.replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]{10,15}$/.test(normalizedPhone)) {
    throw new Error("Invalid phone number");
  }
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: new URL("/connexion", window.location.origin).href,
      data: {
        full_name: fullName.trim(),
        professional_phone: normalizedPhone,
        discovery_source: discoverySource,
      },
    },
  });

  if (error) {
    throw error;
  }

  return data;
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
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}
