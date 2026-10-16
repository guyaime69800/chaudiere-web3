import { exportCompanyFile } from "./lib/company-export-files.js";
import { cleanupCompanyData } from "./lib/company-data-cleanup.js";
import { rateRequest } from "./lib/devis-security.js";
import { buildCompanyExport, exportManifest, exportPage, responsibleCompany } from "./lib/account-export.js";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { accountMfaAccessError } from "./lib/mfa-access.js";

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

function reply(res, status, message) {
  return res.status(status).json({ ok: status < 400, message });
}

export default async function handler(req, res, { clientFactory = createClient, exportRateLimit = rateRequest } = {}) {
  res.setHeader("Allow", "GET, POST, DELETE");
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST", "DELETE"].includes(req.method)) return reply(res, 405, "Méthode non autorisée.");

  if (req.method !== "GET" && !req.body) {
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

  const auth = clientFactory(url, publicKey, clientOptions);
  const { data: { user }, error: authError } = await auth.auth.getUser(bearer[1]);
  if (authError || !user?.id || !user.email_confirmed_at) return reply(res, 401, "Reconnectez-vous.");

  const admin = clientFactory(url, secretKey, clientOptions);
  const mfaError = await accountMfaAccessError(user, bearer[1], admin);
  if (mfaError) return reply(res, mfaError.status, mfaError.message);
  const { data: memberships, error: membershipError } = await admin.from("company_members")
    .select("company_id, role").eq("user_id", user.id);
  if (membershipError) return reply(res, 503, "Impossible de vérifier les entreprises du compte.");

  if (req.method === "GET") {
    if (!["export", "export-manifest", "export-page", "export-file", "data-status"].includes(req.query?.action)) return reply(res, 400, "Action inconnue.");
    try {
      const starting = req.query.action === "export" || req.query.action === "export-manifest";
      await exportRateLimit(req, starting ? "account-export-start" : "account-export-read", user.id, starting ? 2 : 1200);
      responsibleCompany(memberships);
      if (req.query.action === "data-status") {
        const companyId=responsibleCompany(memberships);
        const {data,error}=await admin.from("company_data_erasure_operations").select("id,equipment_id,created_at,completed_at").eq("company_id",companyId).order("created_at",{ascending:false}).limit(10);
        if(error) return reply(res,503,"La gestion autonome doit être installée dans la base avant activation.");
        return res.status(200).json({ok:true,operations:data});
      }
      if(req.query.action === "export-manifest")return res.status(200).json(await exportManifest(admin,user,memberships));
      if(req.query.action === "export-page")return res.status(200).json(await exportPage(admin,memberships,req.query.table,Number(req.query.offset||0)));
      if(req.query.action === "export-file")return await exportCompanyFile(admin,memberships,req.query,res);
      const archive = await buildCompanyExport(admin, user, memberships);
      res.setHeader("Content-Disposition", 'attachment; filename="carnetpass-export.json"');
      return res.status(200).json(archive);
    } catch (error) {
      if(res.headersSent){res.destroy(error);return;}
      return reply(res, error.status || 503, error.message || "Export indisponible.");
    }
  }

  if (req.method === "POST") {
    if (req.body?.action === "erase-company-data") {
      try {
        const companyId=responsibleCompany(memberships);
        await exportRateLimit(req,"company-data-erasure",user.id,3);
        const {data: company,error}=await admin.from("companies").select("id,name").eq("id",companyId).single();
        if(error || company?.id!==companyId) return reply(res,503,"Entreprise indisponible.");
        if(req.body.confirmation!==company.name || req.body.archived!==true) return reply(res,400,"Confirmez le nom de l’entreprise et la sauvegarde des documents à conserver.");
        if(typeof req.body.password!=="string" || !req.body.password || req.body.password.length>256) return reply(res,400,"Saisissez votre mot de passe.");
        const {data: proof,error: passwordError}=await auth.auth.signInWithPassword({email:user.email,password:req.body.password});
        if(passwordError || proof?.user?.id!==user.id)return reply(res,403,"Mot de passe incorrect.");
        const equipmentId=req.body.equipmentId || null;
        if(equipmentId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(equipmentId))return reply(res,400,"Dossier invalide.");
        const {data: operation,error: eraseError}=await admin.rpc("erase_company_dossiers",{p_company_id:companyId,p_actor_id:user.id,p_equipment_id:equipmentId});
        if(eraseError)return reply(res,503,"Suppression non effectuée. Réessayez après vérification du service.");
        // SQL has committed the erasure and durable cleanup jobs; storage errors never misreport rollback.
        await cleanupCompanyData(admin,{companyId,limit:10}).catch(()=>{});
        return res.status(202).json({ok:true,operation,message:"Dossiers effacés de la base. Le nettoyage des fichiers et des QR se poursuit automatiquement ; consultez son état ci-dessous."});
      } catch(error) {return reply(res,error.status||503,error.message||"Suppression indisponible.");}
    }
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
