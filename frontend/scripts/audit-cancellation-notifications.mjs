import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
assert.ok(process.env.RESEND_API_KEY, 'Transactional email configuration missing');
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const result = await db.from('stripe_live_cancellation_emails').select('id', { count: 'exact', head: true });
assert.ifError(result.error);
console.log(JSON.stringify({ cancellationNotificationAudit: { emailConfigurationPresent: true, queueReadable: true,
  queuedRows: result.count, emailSent: false, financialWrite: false } }));
