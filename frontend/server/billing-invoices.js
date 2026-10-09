import { createClient } from "@supabase/supabase-js";
import { accountMfaAccessError } from "./lib/mfa-access.js";

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const reply = (res, status, body) => res.status(status).json(body);
function invoiceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["invoice.stripe.com", "pay.stripe.com"].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}

export default async function invoicesHandler(req, res, { clientFactory = createClient, request = fetch } = {}) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") return reply(res, 405, { message: "Méthode non autorisée." });
  const token = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "")?.[1];
  if (!token || token.length > 16384) return reply(res, 401, { message: "Reconnectez-vous." });
  const after = req.query?.after;
  if (after !== undefined && (typeof after !== "string" || !/^in_[a-zA-Z0-9]{1,128}$/.test(after))) return reply(res, 400, { message: "Page de factures invalide." });
  const env = process.env;
  const testMode = env.VERCEL_ENV === "preview";
  if (!["preview", "production"].includes(env.VERCEL_ENV)
    || !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SECRET_KEY) {
    return reply(res, 503, { message: "Accès aux factures momentanément indisponible." });
  }
  try {
    const auth = clientFactory(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
    const db = clientFactory(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
    const { data: { user }, error } = await auth.auth.getUser(token);
    if (error || !user?.email_confirmed_at) return reply(res, 401, { message: "Reconnectez-vous." });
    const mfaError = await accountMfaAccessError(user, token, db);
    if (mfaError) return reply(res, mfaError.status, mfaError);
    const members = await db.from("company_members").select("company_id, role").eq("user_id", user.id).limit(2);
    if (members.error) throw members.error;
    if (members.data?.length !== 1) return reply(res, 409, { message: "Aucune entreprise unique associée à ce compte." });
    const member = members.data[0];
    if (!["owner", "admin"].includes(member.role)) return reply(res, 403, { message: "Les factures sont réservées au responsable de l’entreprise." });
    const billing = await db.from(testMode ? "stripe_test_subscriptions" : "subscriptions")
      .select("stripe_customer_id").eq("company_id", member.company_id).maybeSingle();
    if (billing.error) throw billing.error;
    const customer = billing.data?.stripe_customer_id;
    if (!customer) return reply(res, 200, { invoices: [], hasMore: false, nextCursor: null, testMode });
    if (!/^cus_[a-zA-Z0-9]+$/.test(customer)) throw Error("Invalid stored billing customer");
    const key = testMode ? env.STRIPE_TEST_SECRET_KEY || env.STRIPE_SECRET_KEY : env.STRIPE_SECRET_KEY;
    if (!key?.startsWith(testMode ? "sk_test_" : "sk_live_")) return reply(res, 503, { message: "La consultation des factures n’est pas encore configurée. Contactez contact@carnetpass.fr." });
    const params = new URLSearchParams({ customer, limit: "20", ...(after ? { starting_after: after } : {}) });
    const response = await request(`https://api.stripe.com/v1/invoices?${params}`, {
      headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error(`Stripe invoice list ${response.status}`);
    const result = await response.json();
    if (!Array.isArray(result.data) || result.data.some((item) => item.customer !== customer || item.livemode !== !testMode)) throw Error("Invoice scope mismatch");
    const invoices = result.data.filter((item) => item.status !== "draft").map((item) => ({
      id: item.id, number: item.number || item.id, created: item.created,
      status: item.status, total: item.total, currency: item.currency,
      pdfUrl: invoiceUrl(item.invoice_pdf), viewUrl: invoiceUrl(item.hosted_invoice_url),
    }));
    const nextCursor = result.has_more ? result.data.at(-1)?.id : null;
    return reply(res, 200, { invoices, hasMore: Boolean(nextCursor), nextCursor: nextCursor || null, testMode });
  } catch (error) {
    console.error("Invoice access failed", { message: error.message });
    return reply(res, 503, { message: "Impossible de charger les factures. Réessayez dans quelques instants." });
  }
}
