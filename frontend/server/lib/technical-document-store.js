const productionSupabaseUrl = "https://tsyukqcyfxcrjrhopvpv.supabase.co";

export function technicalDocumentBlobLocation(documentUrl, environment) {
  if (environment.VERCEL_ENV !== "production" || environment.VERCEL_GIT_COMMIT_REF !== "main"
    || environment.VITE_SUPABASE_URL !== productionSupabaseUrl) return documentUrl;

  const pathname = documentUrl.startsWith("https://") ? new URL(documentUrl).pathname : documentUrl;
  const basename = decodeURIComponent(pathname.split("/").at(-1));
  return `platform-documents/${basename}`;
}
