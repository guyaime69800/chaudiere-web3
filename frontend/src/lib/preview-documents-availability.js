const previewSupabaseUrl = "https://bqqzzbwqmiyxcotvqtoc.supabase.co";

export function previewDocumentsAvailable(environment) {
  return environment.VITE_SUPABASE_URL === previewSupabaseUrl;
}
