export const TEST_ORIGIN = 'https://test.carnetpass.fr';
export const TEST_SUPABASE_URL = 'https://bqqzzbwqmiyxcotvqtoc.supabase.co';
export const PRODUCTION_SUPABASE_URL = 'https://tsyukqcyfxcrjrhopvpv.supabase.co';

export function isolatedTestEnvironment(env) {
  return env.VERCEL_ENV === 'preview' && env.VITE_SUPABASE_URL === TEST_SUPABASE_URL;
}

export function assertDatabaseIsolation(env) {
  if (env.VERCEL_ENV === 'preview' && env.VITE_SUPABASE_URL !== TEST_SUPABASE_URL) throw Error('Preview requires its dedicated test database');
  if (env.VERCEL_ENV === 'production' && env.VITE_SUPABASE_URL !== PRODUCTION_SUPABASE_URL) throw Error('Production requires its dedicated production database');
}
