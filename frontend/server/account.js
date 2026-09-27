import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

function reply(res, status, message) {
  return res.status(status).json({ ok: status < 400, message });
}

export default async function handler(req, res) {
  res.setHeader("Allow", "POST, DELETE");
  res.setHeader("Cache-Control", "no-store");
  if (!["POST", "DELETE"].includes(req.method)) return reply(res, 405, "Méthode non autorisée.");

  if (!req.body) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.reduce((size, chunk) => size + chunk.length, 0) > 4096) return reply(res, 413, "Requête trop volumineuse.");
    try { req.body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return reply(res, 400, "Requête invalide."); }
  }

  const url = process.env.VITE_SUPABASE_URL;
  const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publicKey || !secretKey) return reply(res, 503, "Gestion du compte indisponible.");

  const bearer = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "");
  if (!bearer || bearer[1].length > 16384) return reply(res, 401, "Reconnectez-vous.");

  const auth = createClient(url, publicKey, clientOptions);
  const { data: { user }, error: authError } = await auth.auth.getUser(bearer[1]);
  if (authError || !user?.id || !user.email_confirmed_at) return reply(res, 401, "Reconnectez-vous.");

  const admin = createClient(url, secretKey, clientOptions);
  const { data: memberships, error: membershipError } = await admin.from("company_members")
    .select("company_id, role").eq("user_id", user.id);
  if (membershipError) return reply(res, 503, "Impossible de vérifier les entreprises du compte.");

  if (req.method === "POST") {
    if (req.body?.action !== "cancel-discovery") return reply(res, 400, "Action inconnue.");
    if (memberships.length !== 1 || memberships[0].role !== "admin") {
      return reply(res, 403, "Seul l’administrateur de l’entreprise peut arrêter l’essai.");
    }
    const { data: subscription, error } = await admin.from("subscriptions")
      .select("plan, status").eq("company_id", memberships[0].company_id).single();
    if (error) return reply(res, 503, "Abonnement indisponible.");
    if (subscription.plan !== "free") return reply(res, 409, "Contactez l’assistance pour cette formule.");
    if (subscription.status === "canceled") return reply(res, 200, "L’essai est déjà arrêté.");
    const { error: updateError } = await admin.from("subscriptions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("company_id", memberships[0].company_id).eq("plan", "free");
    if (updateError) return reply(res, 503, "Impossible d’arrêter l’essai.");
    return reply(res, 200, "Essai Découverte arrêté. Aucun paiement n’était associé.");
  }

  // Une preuve par mot de passe est demandée avant cette action irréversible.
  const password = req.body?.password;
  if (typeof password !== "string" || !password || password.length > 256) {
    return reply(res, 400, "Saisissez votre mot de passe pour confirmer.");
  }
  for (const membership of memberships) {
    if (membership.role !== "admin") continue;
    const { data: subscription, error: subscriptionError } = await admin.from("subscriptions")
      .select("plan, status").eq("company_id", membership.company_id).maybeSingle();
    if (subscriptionError) return reply(res, 503, "Impossible de vérifier la formule.");
    if (subscription && subscription.plan !== "free" && subscription.status !== "canceled") {
      return reply(res, 409, "Résiliez d’abord la formule payante avec l’assistance.");
    }
  }
  const { error: passwordError } = await auth.auth.signInWithPassword({ email: user.email, password });
  if (passwordError) return reply(res, 403, "Mot de passe incorrect.");

  // Le soft delete garde les identifiants de référence des historiques techniques.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, true);
  if (deleteError) return reply(res, 503, "Suppression impossible. Contactez l’assistance.");

  const { error: profileError } = await admin.from("profiles")
    .update({ full_name: "Compte supprimé", job_title: null, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  const { error: membersError } = await admin.from("company_members").delete().eq("user_id", user.id);
  if (profileError || membersError) {
    console.error("Account cleanup failed", { userId: user.id, profileError, membersError });
    return reply(res, 503, "Accès supprimé. Le nettoyage du profil nécessite l’assistance.");
  }

  for (const membership of memberships) {
    if (membership.role !== "admin") continue;
    const { count, error: countError } = await admin.from("company_members")
      .select("user_id", { count: "exact", head: true }).eq("company_id", membership.company_id);
    if (!countError && count === 0) {
      const { error: cancelError } = await admin.from("subscriptions").update({ status: "canceled", updated_at: new Date().toISOString() })
        .eq("company_id", membership.company_id).eq("plan", "free");
      if (cancelError) console.error("Discovery cancellation after account deletion failed", { companyId: membership.company_id, cancelError });
    }
  }
  return reply(res, 200, "Compte supprimé. Les historiques techniques sont conservés.");
}
