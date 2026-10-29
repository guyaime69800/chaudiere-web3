import { createClient } from '@supabase/supabase-js';
import { createLiveWebhookHandler } from './lib/stripe-live-webhook.js';
import { createLiveStripeReader, reconcileLiveReceipt, runLiveReconciliationBatch } from './lib/stripe-live-reconciliation.js';
import { sendScheduledCancellationEmails } from './lib/scheduled-cancellation-email.js';

export default createLiveWebhookHandler({
  processReceipt: async (db, receipt, now) => {
    const stripe = createLiveStripeReader();
    const result = await reconcileLiveReceipt(db, stripe, receipt, now);
    try { await sendScheduledCancellationEmails(db, stripe); } catch { console.error('Scheduled cancellation notification deferred'); }
    return result;
  },
  runBatch: async (db, now) => {
    const stripe = createLiveStripeReader();
    const result = await runLiveReconciliationBatch(db, stripe, now);
    return { ...result, notifications: await sendScheduledCancellationEmails(db, stripe) };
  },
  database: () => createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }),
});
