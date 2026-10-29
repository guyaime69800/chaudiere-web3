import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export function liveCreditStoreEnabled(env = process.env) {
  return env.VERCEL_ENV === 'production' && env.VERCEL_GIT_COMMIT_REF === 'main'
    && env.VITE_SUPABASE_URL === 'https://tsyukqcyfxcrjrhopvpv.supabase.co'
    && env.CARNETPASS_STRIPE_LIVE_PROCESSING_ENABLED === 'true';
}
function database() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function liveCreditBalance(professional, db = database()) {
  const { data, error } = await db.from('stripe_live_credit_balances').select('balance')
    .eq('company_id', professional.companyId).eq('user_id', professional.userId).maybeSingle();
  if (error) throw new Error('Credits unavailable');
  return Math.max(0, data?.balance || 0);
}
export async function reserveLiveCredit(professional, db = database()) {
  const reservationId = randomUUID();
  const { data, error } = await db.rpc('reserve_stripe_live_credit', {
    p_company: professional.companyId, p_user: professional.userId, p_id: reservationId,
  });
  if (error || typeof data?.allowed !== 'boolean') throw new Error('Credits unavailable');
  return { reservationId, ...data };
}
export async function refundLiveCredit(reservationId, db = database()) {
  const { error } = await db.rpc('refund_stripe_live_credit', { p_id: reservationId });
  if (error) throw new Error('Credit refund unavailable');
}
