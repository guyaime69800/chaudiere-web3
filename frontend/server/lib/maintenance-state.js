export const MAINTENANCE_ACCESS_PREFIX = "carnetpass:production:maintenance-access:v1:";
export const MAINTENANCE_ACCESS_COOKIE = "carnetpass_maintenance_access";
export const MAINTENANCE_KEY = "carnetpass:production:maintenance:v1";

export function maintenanceAllowedPath(pathname) {
  return pathname === "/connexion-interne"
    || pathname === '/retour-facturation'
    || pathname === "/securite-compte"
    || pathname === "/reinitialiser-mot-de-passe"
    || pathname === "/api/access-session"
    || pathname === "/api/maintenance-reminders"
    || pathname === "/api/stripe-webhook"
    || /^\/workbox-[a-f0-9]+\.js$/.test(pathname)
    || /^\/assets\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:m?js|css|png|jpe?g|svg|webp|woff2?|wasm)$/.test(pathname)
    || ["/favicon.ico", "/favicon.svg", "/icon-192.png", "/icon-512.png", "/shiba-assistant.webp", "/manifest.webmanifest", "/sw.js", "/registerSW.js"].includes(pathname);
}

export function maintenanceHtml(message) {
  const safe = String(message || "Nous effectuons une intervention. Merci de revenir dans quelques instants.")
    .slice(0, 300).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CarnetPass · Maintenance</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f3ef;color:#231c18;font:18px system-ui,sans-serif}main{max-width:650px;padding:48px 28px}h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.1}p{line-height:1.6}small{color:#744d3d}a{color:#b9360b}</style></head><body><main><small>CARNETPASS</small><h1>Le site est momentanément en maintenance.</h1><p>${safe}</p><p>Vos données restent enregistrées. Merci de votre patience.</p></main></body></html>`;
}
