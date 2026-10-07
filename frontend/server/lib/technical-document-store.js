const productionSupabaseUrl = "https://tsyukqcyfxcrjrhopvpv.supabase.co";
// These two source files have identical indexed pages to the shared originals.
const sharedDocuments = new Map([
  ["Notice d’aide au dépannage - HYDROMOTRIX VENT.23kW 2000 @0006000-_0806000.pdf", "Notice d’aide au dépannage - HYDROMOTRIX VENT.32kW 2000 @0014000-_0803000.pdf"],
  ["Notice d'installation - HYDROMOTRIX VENT.32kW 2000 @0014000-_0803000.pdf", "Notice d'installation - HYDROMOTRIX VENT.23kW 2000 @0006000-_0806000.pdf"],
  ["03-Notice-d-installation-technique-THEMAPLUS-CONDENS-25-A.pdf", "69937399-e30e-43cb-8d20-5629772fbf98.pdf"],
  ["04-Notice-d-utilisation-THEMAPLUS-CONDENS-25-A.pdf", "c43b1794-df85-4353-9fd5-2cecec381360.pdf"],
  ["02-Vue-clat-e-THEMAPLUS-CONDENS-25-A.pdf", "19b35687-dd47-4e84-9499-2eab2f0fc72e.pdf"],
]);

export function technicalDocumentBlobLocation(documentUrl, environment) {
  if (environment.VERCEL_ENV !== "production" || environment.VERCEL_GIT_COMMIT_REF !== "main"
    || environment.VITE_SUPABASE_URL !== productionSupabaseUrl) return documentUrl;

  const pathname = documentUrl.startsWith("https://") ? new URL(documentUrl).pathname : documentUrl;
  const basename = decodeURIComponent(pathname.split("/").at(-1));
  return `platform-documents/${sharedDocuments.get(basename) || basename}`;
}
