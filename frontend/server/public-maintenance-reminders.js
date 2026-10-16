import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { sendReminderEmail } from "./maintenance-reminder-dispatch.js";
import { verifySignedPublicManageToken } from "./lib/public-reminder-link.js";

const previewProject = "https://bqqzzbwqmiyxcotvqtoc.supabase.co";
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const newToken = () => randomBytes(32).toString("base64url");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const generic = { ok: true, message: "Si cette adresse peut recevoir un rappel, un lien de vérification lui a été envoyé. Il expire dans une heure." };
const redisClient = () => new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

export function publicReminderEnabled(environment) {
  return (environment.VERCEL_ENV === "preview"
    && environment.VERCEL_GIT_COMMIT_REF === "feature/documentation-multi-docs"
    && environment.VITE_SUPABASE_URL === previewProject)
    || (environment.VERCEL_ENV === "production" && environment.PUBLIC_REMINDERS_ENABLED === "true");
}

function database() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error("DB_UNAVAILABLE");
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

function todayParis() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function withinTenYears(day) {
  const [year, month, date] = todayParis().split("-").map(Number);
  const max = new Date(Date.UTC(year, month - 1, date + 3650, 12)).toISOString().slice(0, 10);
  return day <= max;
}

function responseRow(row) {
  return { id: row.id, carnetPassId: row.carnet_pass_id, dueOn: row.due_on,
    leadDays: row.lead_days, status: row.status, version: row.version,
    notificationState: row.notification_state };
}

async function throttle(req, email) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const redis = redisClient();
  const limits = [
    [`carnetpass:public-reminder-request:ip:${hash(ip)}`, 5],
    [`carnetpass:public-reminder-request:email:${hash(email)}`, 3],
  ];
  const counts = await Promise.all(limits.map(async ([key]) => {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 3600);
    return count;
  }));
  return counts.every((count, index) => count <= limits[index][1]);
}

async function requestVerification(req, res) {
  const carnetPassId = String(req.body?.carnetPassId || "").trim().toUpperCase();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const dueOn = req.body?.dueOn;
  const leadDays = Number(req.body?.leadDays ?? 30);
  if (!/^CP-\d{4}-\d{6}$/.test(carnetPassId) || !emailPattern.test(email)
    || email.length > 254 || !validDate(dueOn) || dueOn <= todayParis() || !withinTenYears(dueOn)
    || !Number.isInteger(leadDays) || leadDays < 0 || leadDays > 365) {
    return res.status(400).json({ ok: false, error: "Adresse, équipement ou échéance invalide." });
  }
  try {
    if (!(await throttle(req, email))) return res.status(200).json(generic);
    // In Preview, sending is restricted to one explicitly configured test inbox.
    if (process.env.VERCEL_ENV === "preview"
      && email !== String(process.env.REMINDER_TEST_EMAIL || "").trim().toLowerCase()) {
      return res.status(200).json(generic);
    }
    const carnet = await redisClient().get(`carnetpass:${carnetPassId}`);
    if (carnet?.status !== "active" || !carnet.equipmentRecordId
      || !carnet.createdByCompanyId) return res.status(200).json(generic);
    const db = database();
    const { data: equipment, error: equipmentError } = await db.from("equipments")
      .select("id,company_id").eq("id", carnet.equipmentRecordId).maybeSingle();
    if (equipmentError || equipment?.company_id !== carnet.createdByCompanyId) {
      return res.status(200).json(generic);
    }
    const { data: subscription, error: subscriptionError } = await db.from("subscriptions")
      .select("plan,status,trial_ends_at,current_period_end")
      .eq("company_id", equipment.company_id).maybeSingle();
    if (subscriptionError || !subscription || !["active", "trialing"].includes(subscription.status)
      || (subscription.plan === "free" && (!subscription.trial_ends_at || new Date(subscription.trial_ends_at) <= new Date()))
      || (subscription.plan === "enterprise" && (!subscription.current_period_end || new Date(subscription.current_period_end) <= new Date()))) {
      return res.status(200).json(generic);
    }
    const verifyToken = newToken();
    const manageToken = newToken();
    const { data: request, error: insertError } = await db.from("public_reminder_requests")
      .insert({ equipment_id: equipment.id, company_id: equipment.company_id,
        carnet_pass_id: carnetPassId, recipient_email: email, due_on: dueOn,
        lead_days: leadDays, verification_hash: hash(verifyToken),
        management_hash: hash(manageToken),
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
      .select("id").single();
    if (insertError || !request) throw new Error("REQUEST_SAVE_FAILED");
    const site = process.env.VERCEL_ENV === "preview"
      ? `https://${process.env.VERCEL_URL}` : "https://www.carnetpass.fr";
    const link = `${site}/rappel/activer#verify=${verifyToken}&manage=${manageToken}`;
    await sendReminderEmail({
      to: email,
      subject: "Vérifiez votre adresse pour le rappel CarnetPass",
      text: `Vous avez demandé un rappel d’entretien pour l’appareil ${carnetPassId}, avec une échéance choisie au ${dueOn}.\n\nActivez-le en ouvrant ce lien dans l’heure : ${link}\n\nCette vérification confirme uniquement le contrôle de votre adresse e-mail, pas la propriété de l’appareil. Si vous n’avez rien demandé, ignorez ce message.`,
      idempotencyKey: `public-reminder-verify-${request.id}`,
    });
    return res.status(200).json(generic);
  } catch {
    return res.status(503).json({ ok: false, error: "La demande de rappel est momentanément indisponible." });
  }
}

async function activate(req, res) {
  const verify = req.body?.verify;
  const manage = req.body?.manage;
  if (!tokenPattern.test(verify) || !tokenPattern.test(manage)) {
    return res.status(400).json({ ok: false, error: "Lien invalide." });
  }
  try {
    const db = database();
    const { data: request, error: requestError } = await db.from("public_reminder_requests")
      .select("carnet_pass_id,equipment_id,company_id,expires_at,consumed_at")
      .eq("verification_hash", hash(verify)).eq("management_hash", hash(manage))
      .maybeSingle();
    const carnet = requestError || !request ? null
      : await redisClient().get(`carnetpass:${request.carnet_pass_id}`);
    if (!request || request.consumed_at || new Date(request.expires_at) <= new Date()
      || carnet?.status !== "active" || carnet.equipmentRecordId !== request.equipment_id
      || carnet.createdByCompanyId !== request.company_id) {
      return res.status(400).json({ ok: false, error: "Lien expiré ou appareil indisponible. Demandez un nouveau lien depuis la fiche QR." });
    }
    const { data, error } = await db.rpc("activate_public_maintenance_reminder", {
      p_verification_hash: hash(verify), p_management_hash: hash(manage),
    });
    if (error || !data) return res.status(400).json({ ok: false, error: "Lien expiré ou déjà utilisé. Demandez un nouveau lien depuis la fiche QR." });
    return res.status(200).json({ ok: true, reminder: responseRow(data) });
  } catch {
    return res.status(503).json({ ok: false, error: "Activation indisponible." });
  }
}

async function manage(req, res) {
  const token = req.body?.manage;
  const signed = verifySignedPublicManageToken(token, process.env.REMINDER_MANAGE_SIGNING_KEY);
  if (!tokenPattern.test(token) && !signed) {
    return res.status(400).json({ ok: false, error: "Lien invalide." });
  }
  try {
    const db = database();
    let managementHash = tokenPattern.test(token) ? hash(token) : null;
    if (!managementHash) {
      const { data: target, error: targetError } = await db.from("public_maintenance_reminders")
        .select("management_hash,version").eq("id", signed.id).maybeSingle();
      if (targetError || !target || target.version !== signed.version) {
        return res.status(404).json({ ok: false, error: "Lien périmé. Utilisez le lien de gestion reçu à l’activation." });
      }
      managementHash = target.management_hash;
    }
    if (req.body?.operation === "read") {
      const { data, error } = await db.from("public_maintenance_reminders")
        .select("id,carnet_pass_id,due_on,lead_days,status,version,notification_state")
        .eq("management_hash", managementHash).maybeSingle();
      if (error || !data) return res.status(404).json({ ok: false, error: "Rappel introuvable." });
      return res.status(200).json({ ok: true, reminder: responseRow(data) });
    }
    const cancel = req.body?.operation === "cancel";
    const dueOn = req.body?.dueOn;
    const leadDays = Number(req.body?.leadDays);
    const version = Number(req.body?.version);
    if (!cancel && (!validDate(dueOn) || dueOn <= todayParis() || !withinTenYears(dueOn)
      || !Number.isInteger(leadDays) || leadDays < 0 || leadDays > 365)) {
      return res.status(400).json({ ok: false, error: "Échéance invalide." });
    }
    if (!Number.isInteger(version) || version < 1) return res.status(400).json({ ok: false, error: "Version invalide." });
    const { data, error } = await db.rpc("update_public_maintenance_reminder", {
      p_management_hash: managementHash, p_expected_version: version,
      p_due_on: cancel ? null : dueOn, p_lead_days: cancel ? null : leadDays,
      p_cancel: cancel,
    });
    if (error || !data) return res.status(409).json({ ok: false, error: "Rappel déjà modifié ou en cours d’envoi. Actualisez la page." });
    return res.status(200).json({ ok: true, reminder: responseRow(data) });
  } catch {
    return res.status(503).json({ ok: false, error: "Gestion du rappel indisponible." });
  }
}

export default async function publicMaintenanceReminders(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!publicReminderEnabled(process.env)) return res.status(404).json({ ok: false, error: "Service indisponible." });
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false });
  }
  if (req.body?.operation === "request") return requestVerification(req, res);
  if (req.body?.operation === "activate") return activate(req, res);
  if (["read", "update", "cancel"].includes(req.body?.operation)) return manage(req, res);
  return res.status(400).json({ ok: false, error: "Action invalide." });
}
