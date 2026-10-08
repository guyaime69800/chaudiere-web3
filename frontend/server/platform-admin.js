import { createClient } from "@supabase/supabase-js";
import { platformAdminEnvironment } from "./lib/platform-admin-environment.js";
import { mfaAccessError } from "./lib/mfa-access.js";

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const send = (res, status, message, extra = {}) => res.status(status).json({ ok: status < 400, message, ...extra });

async function bodyOf(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new Error("Too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export default async function platformAdminHandler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Allow", "GET, POST");
  if (!["GET", "POST"].includes(req.method)) return send(res, 405, "Méthode non autorisée.");
  const environment = platformAdminEnvironment(process.env);
  if (environment.status) return send(res, environment.status, environment.message);
  const url = process.env.VITE_SUPABASE_URL;
  const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publicKey || !secretKey) return send(res, 503, "Configuration indisponible.");
  const token = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "")?.[1];
  if (!token || token.length > 16384) return send(res, 401, "Reconnectez-vous.");
  const auth = createClient(url, publicKey, options);
  const { data: { user }, error: authError } = await auth.auth.getUser(token);
  if (authError || !user?.email_confirmed_at) return send(res, 401, "Reconnectez-vous.");
  const admin = createClient(url, secretKey, options);
  const { data: operator, error: roleError } = await admin.from("platform_admins")
    .select("role").eq("user_id", user.id).maybeSingle();
  if (roleError) return send(res, 503, "Accès administrateur indisponible.");
  if (req.method === "GET" && req.query?.security === "1") {
    return send(res, 200, "OK", { role: operator?.role || null, mfaRequired: Boolean(operator) });
  }
  if (!operator) return send(res, 403, "Accès réservé à l'équipe CarnetPass.");
  const mfaError = mfaAccessError(user, token, { required: true });
  if (mfaError) return send(res, mfaError.status, mfaError.message, { code: mfaError.code });

  if (req.method === "GET") {
    const search = String(req.query?.search || "").trim();
    if (search.length > 80) return send(res, 400, "Recherche trop longue.");
    const query = admin.from("companies").select("id, name, siret, created_at, company_verifications(status), subscriptions(plan, status, current_period_end, enterprise_seat_limit)")
      .order("created_at", { ascending: false }).limit(30);
    if (search) query.ilike("name", `%${search.replace(/[%_,()]/g, "")}%`);
    const { data: companies, error: companyError } = await query;
    if (companyError) return send(res, 503, "Entreprises indisponibles.");
    const { data: events, error: eventError } = await admin.from("enterprise_access_events")
      .select("company_id, actor_id, action, payment_reference, contract_end, note, seat_limit, target_user_id, created_at")
      .order("created_at", { ascending: false }).limit(30);
    if (eventError) return send(res, 503, "Historique indisponible.");
    const { data: collaborators, error: collabError } = await admin.from("platform_admins")
      .select("user_id, role, created_at").order("created_at", { ascending: true });
    if (collabError) return send(res, 503, "Collaborateurs indisponibles.");
    let members = [];
    let memberCount = 0;
    let memberLoadError = false;
    const selectedCompany = String(req.query?.companyId || "");
    if (selectedCompany) {
      if (!/^[0-9a-f-]{36}$/i.test(selectedCompany)) return send(res, 400, "Entreprise invalide.");
      const { data: rows, count, error: memberError } = await admin.from("company_members")
        .select("user_id, role", { count: "exact" }).eq("company_id", selectedCompany)
        .limit(100);
      if (memberError) {
        console.error("Platform admin company members lookup failed", { code: memberError.code, message: memberError.message });
        memberLoadError = true;
      } else {
        memberCount = count || 0;
        members = await Promise.all((rows || []).map(async (row) => {
          const { data: found } = await admin.auth.admin.getUserById(row.user_id);
          return { ...row, email: found?.user?.email || null };
        }));
      }
    }
    return send(res, 200, "OK", { environment: environment.name, role: operator.role, companies, events, collaborators, members, memberCount, memberLoadError, selectedCompanyId: selectedCompany });
  }

  let body;
  try { body = await bodyOf(req); } catch { return send(res, 400, "Requête invalide."); }
  if (["activate", "suspend", "set-seats"].includes(body?.action)) {
    const companyId = body.companyId;
    if (typeof companyId !== "string" || !/^[0-9a-f-]{36}$/i.test(companyId)) return send(res, 400, "Entreprise invalide.");
    const contractEnd = body.action === "activate" ? new Date(body.contractEnd) : null;
    if (body.action === "activate" && (!Number.isFinite(contractEnd.getTime())
      || contractEnd <= new Date() || contractEnd > new Date(Date.now() + 5 * 366 * 86400000))) {
      return send(res, 400, "Échéance invalide.");
    }
    const reference = String(body.paymentReference || "").trim();
    const note = String(body.note || "").trim();
    const seatLimit = body.action === "suspend" ? null : Number(body.seatLimit);
    if (reference.length > 120 || note.length > 500 || (body.action === "activate" && reference.length < 3)) {
      return send(res, 400, "Référence du règlement ou note invalide.");
    }
    if (body.action !== "suspend" && (!Number.isInteger(seatLimit) || seatLimit < 1 || seatLimit > 10000)) {
      return send(res, 400, "Nombre de comptes invalide.");
    }
    const { error } = await admin.rpc("platform_set_enterprise", {
      p_actor: user.id, p_company: companyId, p_action: body.action === "set-seats" ? "set_seats" : body.action,
      p_contract_end: contractEnd?.toISOString() || null,
      p_payment_reference: reference, p_note: note, p_seat_limit: seatLimit,
    });
    if (error) return send(res, 409, "Changement refusé. Vérifiez l'entreprise, son abonnement Stripe test et les informations du contrat.");
    return send(res, 200, body.action === "activate" ? "Accès Entreprise activé."
      : body.action === "suspend" ? "Accès Entreprise suspendu." : "Nombre de comptes mis à jour.");
  }
  if (["add-technician", "remove-technician"].includes(body?.action)) {
    const companyId = body.companyId;
    const email = String(body.email || "").trim().toLowerCase();
    const note = String(body.note || "").trim();
    if (typeof companyId !== "string" || !/^[0-9a-f-]{36}$/i.test(companyId)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || note.length > 500) {
      return send(res, 400, "Entreprise, e-mail ou note invalide.");
    }
    const { error } = await admin.rpc("platform_manage_technician", {
      p_actor: user.id, p_company: companyId, p_email: email,
      p_add: body.action === "add-technician", p_note: note,
    });
    if (error) return send(res, 409, "Changement refusé. Vérifiez le compte confirmé, l'abonnement et les places disponibles.");
    return send(res, 200, body.action === "add-technician" ? "Technicien ajouté." : "Technicien retiré.");
  }
  if (body?.action === "add-collaborator" || body?.action === "remove-collaborator") {
    if (operator.role !== "founder") return send(res, 403, "Seul le fondateur gère les collaborateurs.");
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return send(res, 400, "Adresse e-mail invalide.");
    const { data, error } = await admin.rpc("platform_manage_collaborator", {
      p_actor: user.id, p_email: email, p_add: body.action === "add-collaborator",
    });
    if (error) return send(res, 409, "Compte confirmé introuvable ou opération refusée.");
    return send(res, 200, "Collaborateur mis à jour.", { userId: data });
  }
  return send(res, 400, "Action inconnue.");
}
