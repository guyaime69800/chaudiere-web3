const previewSupabaseUrl = "https://bqqzzbwqmiyxcotvqtoc.supabase.co";

export function professionalRemindersAvailable(environment) {
  return environment.VITE_REMINDER_PREVIEW_TEST_ENABLED === "true"
    && environment.VITE_SUPABASE_URL === previewSupabaseUrl;
}
