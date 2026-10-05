const previewBranches = new Set(["feature/documentation-multi-docs", "release/paris2-admin-documents"]);
const previewProject = "bqqzzbwqmiyxcotvqtoc";
const previewUrl = `https://${previewProject}.supabase.co`;
const nonProductionProjects = new Set([previewProject, "rpwzzvreuenstsjtbzto"]);

export function platformAdminEnvironment(environment) {
  if (environment.VERCEL_ENV === "preview" && previewBranches.has(environment.VERCEL_GIT_COMMIT_REF)) {
    return environment.VITE_SUPABASE_URL === previewUrl
      ? { name: "preview" }
      : { status: 503, message: "Administration en attente d'une base Preview séparée." };
  }
  if (environment.VERCEL_ENV === "production" && environment.VERCEL_GIT_COMMIT_REF === "main"
    && environment.CARNETPASS_PRODUCTION_ADMIN_ENABLED === "true") {
    const project = environment.CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF;
    if (!/^[a-z0-9]{20}$/.test(project || "") || nonProductionProjects.has(project)
      || environment.VITE_SUPABASE_URL !== `https://${project}.supabase.co`) {
      return { status: 503, message: "Administration en attente d'une base Production distincte." };
    }
    return { name: "production" };
  }
  return { status: 404, message: "Fonction indisponible." };
}
