import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const liveWebhookTypes = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'checkout.session.expired',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required', 'invoice.voided',
  'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed',
]);

export function verifyLiveStripeEvent(raw, signature, secret, expectedAccount, now = Date.now()) {
  if (!Buffer.isBuffer(raw) || raw.length > 262144 || typeof signature !== 'string'
    || signature.length > 4096 || !/^whsec_[A-Za-z0-9]+$/.test(secret || '')
    || !/^acct_[A-Za-z0-9]+$/.test(expectedAccount || '')) throw new Error('Invalid webhook');
  const parts = signature.split(',').map((part) => part.trim());
  const timestamps = parts.filter((part) => part.startsWith('t='));
  if (timestamps.length !== 1 || !/^t=\d{1,12}$/.test(timestamps[0])) throw new Error('Invalid timestamp');
  const timestamp = Number(timestamps[0].slice(2));
  if (Math.abs(now / 1000 - timestamp) > 300) throw new Error('Expired signature');
  const digest = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest();
  const valid = parts.filter((part) => /^v1=[a-f0-9]{64}$/.test(part))
    .some((part) => timingSafeEqual(digest, Buffer.from(part.slice(3), 'hex')));
  if (!valid) throw new Error('Invalid signature');
  const event = JSON.parse(raw.toString('utf8'));
  if (event.object !== 'event' || event.livemode !== true || !/^evt_[A-Za-z0-9]+$/.test(event.id || '')
    || !Number.isSafeInteger(event.created) || event.created <= 0 || typeof event.type !== 'string'
    || (event.account && event.account !== expectedAccount) || event.context
    || !event.data?.object || typeof event.data.object.id !== 'string') throw new Error('Invalid event');
  return event;
}

export function liveEventReceipt(event, expectedAccount) {
  const objectId = event.data.object.id;
  if (!/^[A-Za-z0-9_]{1,255}$/.test(objectId) || event.type.length > 100) throw new Error('Invalid object');
  // Only identifiers are retained. Billing addresses, emails and card data stay in Stripe.
  const receipt = { account_id: expectedAccount, event_id: event.id, event_type: event.type,
    object_id: objectId, event_created: event.created, api_version: event.api_version || null };
  receipt.identity_hash = createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
  return receipt;
}

export async function readWebhookBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 262144) throw new Error('Body too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function liveWebhookConfigured(env) {
  return env.VERCEL_ENV === 'production' && env.VERCEL_GIT_COMMIT_REF === 'main'
    && env.VITE_SUPABASE_URL === 'https://tsyukqcyfxcrjrhopvpv.supabase.co'
    && env.CARNETPASS_STRIPE_LIVE_WEBHOOK_ENABLED === 'true'
    && /^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_LIVE_WEBHOOK_SECRET || '')
    && /^acct_[A-Za-z0-9]+$/.test(env.STRIPE_EXPECTED_ACCOUNT_ID || '')
    && Boolean(env.SUPABASE_SECRET_KEY);
}

export function createLiveWebhookHandler({ env = process.env, database, processReceipt, runBatch, now = Date.now } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const send = (status, code) => res.status(status).json({ ok: status < 400, code });
    if (req.query?.reconcile === '1') {
      const expected = env.CRON_SECRET;
      const authorization = req.headers?.authorization;
      const token = typeof authorization === 'string' ? /^Bearer (.+)$/.exec(authorization)?.[1] : null;
      if (!expected || !token || Buffer.byteLength(expected) !== Buffer.byteLength(token)
        || !timingSafeEqual(Buffer.from(expected), Buffer.from(token))) return send(401, 'UNAUTHORIZED');
      if (req.method !== 'GET') return send(405, 'METHOD_NOT_ALLOWED');
      if (!liveWebhookConfigured(env) || env.CARNETPASS_STRIPE_LIVE_PROCESSING_ENABLED !== 'true' || !runBatch) {
        return send(503, 'LIVE_PROCESSING_UNAVAILABLE');
      }
      try { return res.status(200).json({ ok: true, ...await runBatch(await database(), now()) }); }
      catch { return send(503, 'LIVE_PROCESSING_UNAVAILABLE'); }
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(405, 'METHOD_NOT_ALLOWED'); }
    if (!liveWebhookConfigured(env)) return send(503, 'LIVE_WEBHOOK_UNAVAILABLE');
    let event;
    let receipt;
    try {
      event = verifyLiveStripeEvent(await readWebhookBody(req), req.headers?.['stripe-signature'],
        env.STRIPE_LIVE_WEBHOOK_SECRET, env.STRIPE_EXPECTED_ACCOUNT_ID, now());
      receipt = liveEventReceipt(event, env.STRIPE_EXPECTED_ACCOUNT_ID);
    } catch { return send(400, 'INVALID_STRIPE_EVENT'); }
    if (!liveWebhookTypes.has(event.type)) return send(200, 'EVENT_IGNORED');
    try {
      const db = await database();
      const { data, error } = await db.rpc('record_stripe_live_event', { receipt });
      if (error || !['recorded', 'duplicate'].includes(data)) return send(503, 'EVENT_STORAGE_UNAVAILABLE');
      if (env.CARNETPASS_STRIPE_LIVE_PROCESSING_ENABLED === 'true') {
        if (!processReceipt) return send(503, 'LIVE_PROCESSING_UNAVAILABLE');
        const result = await processReceipt(db, receipt, now());
        if (!['processed', 'duplicate', 'pending', 'review'].includes(result)) return send(503, 'LIVE_PROCESSING_UNAVAILABLE');
      }
      return send(200, data === 'duplicate' ? 'EVENT_ALREADY_RECORDED' : 'EVENT_RECORDED');
    } catch { return send(503, 'EVENT_STORAGE_UNAVAILABLE'); }
  };
}
