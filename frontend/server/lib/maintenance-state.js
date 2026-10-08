export const MAINTENANCE_KEY = "carnetpass:production:maintenance:v1";
export const MAINTENANCE_ACCESS_PREFIX = "carnetpass:production:maintenance-access:v1:";
export const MAINTENANCE_ACCESS_COOKIE = "carnetpass_maintenance_access";

export function maintenanceAllowedPath(pathname) {
  return pathname === "/administration-maintenance"
    || pathname === '/administration-aides'
    || pathname === '/api/aid-admin'
    || pathname === "/connexion"
    || pathname === "/securite-compte"
    || pathname === "/api/platform-admin"
    // Admin/MFA authorization and signed Blob callbacks are checked by this API.
    // Blob completion callbacks cannot carry the founder's browser cookie.
    || pathname === "/api/platform-admin-documents"
    || pathname === "/api/maintenance-control"
    || pathname === "/api/maintenance-reminders"
    || pathname.startsWith("/assets/")
    || pathname === "/favicon.ico"
    || pathname === "/manifest.webmanifest"
    || pathname === "/sw.js"
    || pathname === "/registerSW.js";
}

export function maintenanceHtml(message) {
  const safe = String(message || "Nous effectuons une intervention. Merci de revenir dans quelques instants.")
    .slice(0, 300).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CarnetPass · Maintenance</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f3ef;color:#231c18;font:18px system-ui,sans-serif}main{max-width:650px;padding:48px 28px}h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.1}p{line-height:1.6}small{color:#744d3d}a{color:#b9360b}</style></head><body><main><small>CARNETPASS</small><h1>Le site est momentanément en maintenance.</h1><p>${safe}</p><p>Vos données restent enregistrées. Merci de votre patience.</p><small>Équipe CarnetPass · <a href="/administration-maintenance">Accès équipe</a></small></main></body></html>`;
}
