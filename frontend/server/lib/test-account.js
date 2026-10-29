import { PRODUCTION_SUPABASE_URL } from '../../shared/test-environment.js';

export function testAccountConfiguration(env) {
  return env.VERCEL_ENV === 'production' && env.VERCEL_GIT_COMMIT_REF === 'main'
    && env.VITE_SUPABASE_URL === PRODUCTION_SUPABASE_URL;
}

// Caller must have verified the founder's identity and MFA in Production.
// Only that verified email is used; no browser-supplied email or role is accepted.
export async function openIsolatedTestAccount({ env, user, database }) {
  if (!testAccountConfiguration(env) || !user?.email_confirmed_at || !user.email) throw Error('Test environment unavailable');
  const { data, error } = await database.rpc('open_admin_test_workspace', { p_actor: user.id });
  if (error || !data?.id || data.environment !== 'test') throw Error('Test account unavailable');
  return data;
}
