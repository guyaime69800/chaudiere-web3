const previewBranch = "feature/documentation-multi-docs";
const previewProject = "bqqzzbwqmiyxcotvqtoc";
const previewUrl = `https://${previewProject}.supabase.co`;

export function platformAdminEnvironment(environment) {
  if (environment.VERCEL_ENV === "preview" && environment.VERCEL_GIT_COMMIT_REF === previewBranch) {
    return environment.VITE_SUPABASE_URL === previewUrl
      ? { name: "preview" }
      : { status: 503, message: "Administration en attente d'une base Preview séparée." };
  }
  if (environment.VERCEL_ENV === "production" && environment.VERCEL_GIT_COMMIT_REF === "main"
    && environment.CARNETPASS_PRODUCTION_ADMIN_ENABLED === "true") {
    const project = environment.CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF;
    if (!/^[a-z0-9]{20}$/.test(project || "") || project === previewProject
      || environment.VITE_SUPABASE_URL !== `https://${project}.supabase.co`) {
      return { status: 503, message: "Administration en attente d'une base Production distincte." };
    }
    return { name: "production" };
  }
  return { status: 404, message: "Fonction indisponible." };
}
