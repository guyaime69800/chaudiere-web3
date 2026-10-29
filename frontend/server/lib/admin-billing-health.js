export async function adminBillingHealth(db, now = Date.now()) {
  const stale = new Date(now - 15 * 60000).toISOString();
  try {
    const queries = {
      overdueSubscriptions: db.from('subscriptions').select('company_id', { count: 'exact', head: true }).eq('stripe_live_managed', true).eq('status', 'past_due'),
      pendingEvents: db.from('stripe_live_event_inbox').select('event_id', { count: 'exact', head: true }).eq('processing_status', 'pending').lt('received_at', stale),
      reviewEvents: db.from('stripe_live_event_inbox').select('event_id', { count: 'exact', head: true }).eq('processing_status', 'review'),
      reviewEmails: db.from('stripe_live_cancellation_emails').select('id', { count: 'exact', head: true }).eq('status', 'review'),
      delayedEmails: db.from('stripe_live_cancellation_emails').select('id', { count: 'exact', head: true }).in('status', ['pending', 'sending']).lt('created_at', stale),
    };
    const results = await Promise.all(Object.entries(queries).map(async ([name, query]) => {
      const result = await query;
      if (result.error || !Number.isSafeInteger(result.count) || result.count < 0) throw Error('Billing monitoring unavailable');
      return [name, result.count];
    }));
    const counts = Object.fromEntries(results);
    return { state: Object.values(counts).some(value => value > 0) ? 'warning' : 'healthy', ...counts };
  } catch { return { state: 'unavailable' }; }
}
