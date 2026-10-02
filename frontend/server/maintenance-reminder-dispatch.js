import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";
import { requireVerifiedCompany } from "./lib/require-verified-company.js";
import { createSignedPublicManageToken } from "./lib/public-reminder-link.js";

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const previewProject = "https://bqqzzbwqmiyxcotvqtoc.supabase.co";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function previewTestIdempotencyKey(reminderId) {
  return `preview-maintenance-test-${reminderId}-${randomUUID()}`;
}

export function previewReminderTestAllowed(environment) {
  return environment.VERCEL_ENV === "preview"
    && environment.VERCEL_GIT_COMMIT_REF === "feature/documentation-multi-docs"
    && environment.VITE_SUPABASE_URL === previewProject;
}

export function productionReminderCronAllowed(environment, authorization) {
  return environment.VERCEL_ENV === "production"
    && environment.REMINDERS_PRODUCTION_ENABLED === "true"
    && Boolean(environment.CRON_SECRET)
    && authorization === `Bearer ${environment.CRON_SECRET}`;
}

function service() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("REMINDER_DATABASE_UNAVAILABLE");
  return createClient(url, key, options);
}

export async function sendReminderEmail({ to, subject, text, idempotencyKey }) {
  if (!process.env.RESEND_API_KEY || !process.env.REMINDER_FROM_EMAIL) {
    throw new Error("EMAIL_NOT_CONFIGURED");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.REMINDER_FROM_EMAIL,
        to: [to], subject, text,
      }),
    });
    if (!response.ok) {
      const error = new Error("EMAIL_PROVIDER_FAILED");
      error.retryable = response.status === 409 || response.status === 429 || response.status >= 500;
      error.code = `RESEND_${response.status}`;
      throw error;
    }
    const data = await response.json();
    if (!data?.id) throw new Error("EMAIL_PROVIDER_RESPONSE_INVALID");
    return data.id;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendEmailWithRetry(email) {
  try {
    return await sendReminderEmail(email);
  } catch (error) {
    if (error.retryable === false || error.message === "EMAIL_NOT_CONFIGURED") throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return sendReminderEmail(email);
  }
}

async function sendPreviewTest(req, res) {
  if (!previewReminderTestAllowed(process.env)) {
    return res.status(404).json({ ok: false, error: "Test indisponible." });
  }
  const user = await requireVerifiedCompany(req, res);
  if (!user) return;
  const allowedEmail = String(process.env.REMINDER_TEST_EMAIL || "").trim().toLowerCase();
  if (!emailPattern.test(allowedEmail) || allowedEmail !== String(user.email || "").toLowerCase()) {
    return res.status(403).json({ ok: false, error: "Adresse de test non autorisée." });
  }
  const reminderId = String(req.body?.reminderId || "");
  if (!/^[0-9a-f-]{36}$/i.test(reminderId)) {
    return res.status(400).json({ ok: false, error: "Rappel invalide." });
  }
  try {
    const db = service();
    const { data: reminder, error } = await db.from("maintenance_reminders")
      .select("id,company_id,equipment_id,recipient_user_id,recipient_email,description,due_on,status,version,equipments(brand,model)")
      .eq("id", reminderId).maybeSingle();
    if (error || !reminder || reminder.company_id !== user.companyId
      || reminder.recipient_user_id !== user.userId || reminder.status !== "active"
      || reminder.recipient_email.toLowerCase() !== allowedEmail) {
      return res.status(404).json({ ok: false, error: "Rappel introuvable." });
    }
    const providerId = await sendReminderEmail({
      to: allowedEmail,
      subject: "[TEST Preview] Rappel CarnetPass",
      text: `Ceci est un test Preview, pas un rappel réel.\n\nObjet : ${reminder.description || "Entretien"}\nAppareil : ${reminder.equipments?.brand || ""} ${reminder.equipments?.model || ""}\nÉchéance enregistrée : ${reminder.due_on}.\n\nGérer ou annuler : https://${process.env.VERCEL_URL}/espace-pro`,
      idempotencyKey: previewTestIdempotencyKey(reminder.id),
    });
    return res.status(200).json({ ok: true, state: "accepted_by_provider", providerMessageId: providerId });
  } catch (error) {
    console.error("Preview reminder email test failed", { code: error.code || error.message || "UNKNOWN" });
    return res.status(503).json({ ok: false, error: "Le service d’e-mail de test n’a pas accepté le message." });
  }
}

async function runCron(req, res) {
  if (!productionReminderCronAllowed(process.env, req.headers?.authorization)) {
    return res.status(404).json({ ok: false });
  }
  try {
    const db = service();
    const { data: claimed, error } = await db.rpc("claim_due_maintenance_reminders", { p_limit: 5 });
    if (error) throw error;
    let accepted = 0;
    let failed = 0;
    for (const reminder of claimed || []) {
      let result = "failed";
      let providerId = null;
      let errorCode = null;
      try {
        // Recheck revocation, email changes and cancellation immediately before send.
        const { data: current, error: currentError } = await db.from("maintenance_reminders")
          .select("id,company_id,equipment_id,recipient_user_id,recipient_email,description,status,notification_state,claim_id,equipments(brand,model)")
          .eq("id", reminder.id).maybeSingle();
        const { data: member } = await db.from("company_members")
          .select("user_id").eq("company_id", reminder.company_id)
          .eq("user_id", reminder.recipient_user_id).maybeSingle();
        const { data: authUser } = await db.auth.admin.getUserById(reminder.recipient_user_id);
        if (currentError || !current || !member || !authUser?.user?.email_confirmed_at
          || current.claim_id !== reminder.claim_id || current.status !== "active"
          || current.notification_state !== "sending"
          || current.recipient_email.toLowerCase() !== String(authUser.user.email || "").toLowerCase()) {
          result = "cancelled";
        } else {
          providerId = await sendEmailWithRetry({
            to: reminder.recipient_email,
            subject: `Rappel CarnetPass : ${(current.description || "Entretien").slice(0, 90)}`,
            text: `Objet : ${current.description || "Entretien"}\nL’échéance enregistrée pour votre équipement est le ${reminder.due_on}. Ce rappel ne prouve pas qu’une intervention n’a pas eu lieu.\n\nConsultez, modifiez ou annulez ce rappel : https://www.carnetpass.fr/espace-pro\n\nSi vous ne souhaitez plus recevoir ce rappel, annulez-le depuis CarnetPass.`,
            idempotencyKey: `maintenance-${reminder.id}-${reminder.version}`,
          });
          result = "accepted";
          accepted++;
        }
      } catch (sendError) {
        errorCode = String(sendError.code || sendError.message || "SEND_FAILED").slice(0, 100);
        // The provider was already retried once with the same key in this run.
        // Do not retry on a later day: Resend's deduplication window is 24 h.
        result = "failed";
        failed++;
      }
      const { error: finishError } = await db.rpc("finish_maintenance_reminder_attempt", {
        p_claim_id: reminder.claim_id, p_result: result,
        p_provider_message_id: providerId, p_error_code: errorCode,
      });
      if (finishError) throw finishError;
    }
    let publicClaimed = 0;
    let publicAccepted = 0;
    if (process.env.PUBLIC_REMINDERS_ENABLED === "true") {
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
        token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
      });
      const { data: publicDue, error: publicClaimError } = await db.rpc("claim_due_public_maintenance_reminders", { p_limit: 5 });
      if (publicClaimError) throw publicClaimError;
      publicClaimed = publicDue?.length || 0;
      for (const reminder of publicDue || []) {
        let result = "failed";
        let providerId = null;
        let errorCode = null;
        try {
          const carnet = await redis.get(`carnetpass:${reminder.carnet_pass_id}`);
          const { data: current, error: currentError } = await db.from("public_maintenance_reminders")
            .select("id,status,notification_state,claim_id,management_hash,recipient_email,due_on,equipment_id,company_id")
            .eq("id", reminder.id).maybeSingle();
          if (currentError || !current || current.status !== "active"
            || current.notification_state !== "sending" || current.claim_id !== reminder.claim_id
            || carnet?.status !== "active" || carnet.equipmentRecordId !== reminder.equipment_id
            || carnet.createdByCompanyId !== reminder.company_id) {
            result = "cancelled";
          } else {
            const managementLink = `https://www.carnetpass.fr/rappel/gerer#token=${createSignedPublicManageToken(reminder.id, reminder.version, process.env.REMINDER_MANAGE_SIGNING_KEY)}`;
            providerId = await sendEmailWithRetry({
              to: reminder.recipient_email,
              subject: "Votre rappel d’entretien CarnetPass",
              text: `Vous avez choisi une échéance d’entretien au ${reminder.due_on} pour l’appareil ${reminder.carnet_pass_id}. Cette date n’est pas une preuve que l’entretien n’a pas eu lieu.\n\nGérer ou annuler ce rappel : ${managementLink}\n\nEn cas de problème technique, contactez l’entreprise qui suit cet appareil.`,
              idempotencyKey: `public-maintenance-${reminder.id}-${reminder.version}`,
            });
            result = "accepted";
            publicAccepted++;
          }
        } catch (sendError) {
          errorCode = String(sendError.code || sendError.message || "SEND_FAILED").slice(0, 100);
          failed++;
        }
        const { error: finishError } = await db.rpc("finish_public_maintenance_reminder_attempt", {
          p_claim_id: reminder.claim_id, p_result: result,
          p_provider_message_id: providerId, p_error_code: errorCode,
        });
        if (finishError) throw finishError;
      }
    }
    return res.status(200).json({ ok: true, claimed: claimed?.length || 0,
      accepted, publicClaimed, publicAccepted, failed });
  } catch {
    return res.status(503).json({ ok: false, error: "Traitement des rappels indisponible." });
  }
}

export default async function maintenanceReminderDispatch(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "POST") return sendPreviewTest(req, res);
  if (req.method === "GET") return runCron(req, res);
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false });
}
