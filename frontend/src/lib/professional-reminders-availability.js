const previewSupabaseUrl = "https://bqqzzbwqmiyxcotvqtoc.supabase.co";
const productionSupabaseUrl = "https://tsyukqcyfxcrjrhopvpv.supabase.co";

export function professionalRemindersAvailable(environment) {
  return (
    environment.VITE_REMINDER_PREVIEW_TEST_ENABLED === "true"
    && environment.VITE_SUPABASE_URL === previewSupabaseUrl
  ) || (
    environment.VITE_REMINDERS_PRODUCTION_ENABLED === "true"
    && environment.VITE_SUPABASE_URL === productionSupabaseUrl
    && environment.PROD
  );
}
