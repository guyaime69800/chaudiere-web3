import { createClient } from '@supabase/supabase-js';
import { accountMfaAccessError } from './lib/mfa-access.js';
import { liveCheckoutEnabled } from './billing-live.js';

const returnUrl = 'https://www.carnetpass.fr/parametres-compte';
const options = { auth: { persistSession: false, autoRefreshToken: false } };
export function livePortalEnabled(env) {
  return env.CARNETPASS_STRIPE_LIVE_PORTAL_ENABLED === 'true'
    && liveCheckoutEnabled({ ...env, CARNETPASS_LIVE_BILLING_ENABLED: 'true' });
}
export function validatePortalConfiguration(config) {
  const features = config?.features;
  if (!/^bpc_[A-Za-z0-9]+$/.test(config?.id || '') || !config.active || !config.is_default || !config.livemode
    || config.default_return_url !== returnUrl || config.login_page?.enabled !== false
    || features?.invoice_history?.enabled !== true || features?.payment_method_update?.enabled !== true
    || features?.subscription_cancel?.enabled !== true || features.subscription_cancel.mode !== 'at_period_end'
    || features?.subscription_update?.enabled !== false) throw Error('Invalid portal configuration');
  return config.id;
}
export function createLivePortalHandler({ env = process.env, clientFactory = createClient, request = fetch } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const send = (status, body) => res.status(status).json(body);
    const statusOnly = req.query?.action === 'portal-status';
    if (req.method !== (statusOnly ? 'GET' : 'POST')) return send(405, { message: 'Méthode non autorisée.' });
    if (!livePortalEnabled(env)) return statusOnly ? send(200, { available: false })
      : send(503, { message: 'Portail momentanément indisponible.' });
    const token = /^Bearer ([^\s]{1,16384})$/i.exec(req.headers?.authorization || '')?.[1];
    if (!token) return send(401, { message: 'Reconnectez-vous.' });
    try {
      const auth = clientFactory(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
      const db = clientFactory(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
      const { data: { user }, error } = await auth.auth.getUser(token);
      if (error || !user?.email_confirmed_at || user.is_anonymous) return send(401, { message: 'Reconnectez-vous.' });
      const mfa = await accountMfaAccessError(user, token, db);
      if (mfa) return send(mfa.status, mfa);
      const members = await db.from('company_members').select('company_id, role').eq('user_id', user.id).limit(2);
      if (members.error) throw Error('Storage unavailable');
      if (members.data?.length !== 1) return send(409, { message: 'Entreprise associée non disponible.' });
      const member = members.data[0];
      if (!['owner', 'admin'].includes(member.role)) return send(403, { message: 'Accès réservé au responsable de votre entreprise.' });
      const binding = await db.from('stripe_live_customers').select('account_id, customer_id')
        .eq('company_id', member.company_id).maybeSingle();
      if (binding.error) throw Error('Storage unavailable');
      const customer = binding.data?.customer_id;
      if (!customer) return statusOnly ? send(200, { available: false }) : send(409, { message: 'Aucun compte de facturation associé.' });
      if (binding.data.account_id !== env.STRIPE_EXPECTED_ACCOUNT_ID || !/^cus_[A-Za-z0-9]+$/.test(customer)) throw Error('Invalid binding');
      if (statusOnly) return send(200, { available: true });
      async function stripe(path, params) {
        const response = await request(`https://api.stripe.com/v1/${path}`, {
          method: params ? 'POST' : 'GET', signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': '2026-08-26.dahlia',
            ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
          body: params ? new URLSearchParams(params) : undefined,
        });
        if (!response.ok) throw Error('Stripe unavailable');
        return response.json();
      }
      const account = await stripe('account');
      if (account.id !== env.STRIPE_EXPECTED_ACCOUNT_ID) throw Error('Account mismatch');
      const storedCustomer = await stripe(`customers/${customer}`);
      if (storedCustomer.id !== customer || storedCustomer.deleted || storedCustomer.livemode !== true) throw Error('Customer mismatch');
      const configurations = await stripe('billing_portal/configurations?active=true&is_default=true&limit=2');
      if (configurations.data?.length !== 1 || configurations.has_more) throw Error('Ambiguous configuration');
      const configuration = validatePortalConfiguration(configurations.data[0]);
      const session = await stripe('billing_portal/sessions', { customer, configuration, return_url: returnUrl, locale: 'fr' });
      const url = new URL(session.url);
      if (session.customer !== customer || session.livemode !== true || session.configuration !== configuration
        || url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com' || url.username || url.password || url.port) throw Error('Session mismatch');
      return send(200, { url: url.href });
    } catch {
      return send(503, { message: 'Impossible d’ouvrir le portail. Contactez contact@carnetpass.fr.' });
    }
  };
}
export default createLivePortalHandler();
