const id = value => typeof value === 'string' ? value : value?.id;
const one = async query => { const result = await query.maybeSingle(); if (result.error) throw Error('Notification storage unavailable'); return result.data; };

export function cancellationEmail(row, subscription, customer) {
  if (subscription.status !== 'active' || subscription.livemode !== true || customer.deleted
    || customer.id !== id(subscription.customer) || customer.livemode !== true) return null;
  const cancel = subscription.cancel_at || (subscription.cancel_at_period_end
    ? subscription.items?.data?.[0]?.current_period_end || subscription.current_period_end : null);
  if (!cancel || cancel * 1000 !== Date.parse(row.cancel_at) || cancel * 1000 <= Date.now()) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email || '')) throw Error('Customer email unavailable');
  const date = new Date(row.cancel_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' });
  return { to: [customer.email], subject: 'CarnetPass — votre résiliation est programmée',
    text: `Bonjour,\n\nVotre demande de résiliation de CarnetPass Pro est enregistrée.\nVotre accès reste disponible jusqu’au ${date} (heure de Paris), dans la limite de la période payée.\nVotre abonnement ne sera pas renouvelé à cette échéance : aucun nouveau prélèvement de renouvellement ne sera effectué. Les éventuelles factures déjà dues restent distinctes.\n\nVous pouvez consulter votre abonnement dans les paramètres de votre compte : https://www.carnetpass.fr/parametres-compte\n\nPour toute question : contact@carnetpass.fr\nCarnetPass` };
}

export async function sendScheduledCancellationEmails(db, stripe, { env = process.env, request = fetch } = {}) {
  if (!env.RESEND_API_KEY) return { unavailable: true };
  const claimed = await db.rpc('claim_scheduled_cancellation_emails');
  if (claimed.error) throw Error('Notification queue unavailable');
  const counts = { sent: 0, skipped: 0, deferred: 0 };
  for (const row of claimed.data || []) {
    let status, sentAt = null;
    try {
      // Do not resend beyond the provider's 24-hour idempotency window.
      if (Date.now() - Date.parse(row.created_at) > 23 * 3600000) { status = 'review'; }
      else {
        const state = await one(db.from('stripe_live_company_state').select('subscription_id').eq('company_id', row.company_id));
        const binding = await one(db.from('stripe_live_customers').select('customer_id,account_id').eq('company_id', row.company_id));
        if (!state?.subscription_id || binding?.account_id !== env.STRIPE_EXPECTED_ACCOUNT_ID) throw Error('Notification binding unavailable');
        const subscription = await stripe(`subscriptions/${encodeURIComponent(state.subscription_id)}`);
        if (id(subscription.customer) !== binding.customer_id) throw Error('Notification scope mismatch');
        const customer = await stripe(`customers/${encodeURIComponent(binding.customer_id)}`);
        const message = cancellationEmail(row, subscription, customer);
        if (!message) status = 'skipped';
        else {
          const response = await request('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(10000),
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `scheduled-cancellation-${row.id}` },
            body: JSON.stringify({ from: env.ENTERPRISE_QUOTE_FROM_EMAIL || 'CarnetPass <contact@carnetpass.fr>', ...message }) });
          if (!response.ok) throw Error('Notification delivery unavailable');
          status = 'sent'; sentAt = new Date().toISOString();
        }
      }
    } catch { status = row.attempts >= 8 ? 'review' : 'pending'; }
    const updated = await db.from('stripe_live_cancellation_emails').update({ status, sent_at: sentAt })
      .eq('id', row.id).eq('lease_token', row.lease_token).eq('status', 'sending');
    if (updated.error) throw Error('Notification result unavailable');
    if (status === 'sent') counts.sent++; else if (status === 'skipped') counts.skipped++; else counts.deferred++;
  }
  return counts;
}
