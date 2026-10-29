import { next } from "@vercel/functions";
import { maintenanceAllowedPath, maintenanceHtml } from "./server/lib/maintenance-state.js";
import { accessToken, internalPathRole, permits, privateHeaders, readMaintenance, verifiedIdentity, verifiedRequestIdentity } from "./server/lib/internal-access.js";
import { publicHtml, publicResource } from "./server/lib/public-site.js";
import { isPublicPresentation } from "./shared/public-site-metadata.js";

export const config = { runtime: "nodejs" };

async function uploadCompletion(request) {
  if (!request.body || Number(request.headers.get("content-length")) > 65536) return false;
  const reader = request.clone().body.getReader();
  let text = "", size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) { reader.cancel().catch(() => {}); return false; }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text)?.type === "blob.upload-completed";
  } catch { return false; }
  finally { reader.releaseLock(); }
}

async function routeRequest(request) {
  const url = new URL(request.url);
  // Public rewrite aliases must not let caller-supplied dispatcher flags select another handler.
  const routingFlags = [...url.searchParams.keys()].some(key => key.endsWith("_route") || key === "webhook");
  let pathname;
  try { pathname = decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/"; }
  catch { return new Response("Requête invalide.", { status: 400, headers: privateHeaders }); }
  const production = process.env.VERCEL_ENV === "production" && ["www.carnetpass.fr", "carnetpass.fr"].includes(url.hostname);
  const resource = publicResource(pathname, production);
  if ((resource || isPublicPresentation(pathname)) && !routingFlags && ["GET", "HEAD"].includes(request.method)) {
    if (url.pathname !== pathname) return new Response(null, { status: 308, headers: { ...privateHeaders, Location: `${url.origin}${pathname}${url.search}` } });
    if (resource) return new Response(request.method === "HEAD" ? null : resource.body, { headers: { ...privateHeaders, "Content-Type": resource.type } });
    let maintenance = true;
    try { maintenance = (await readMaintenance()).enabled; } catch { /* Presentation remains available; application gates still fail closed. */ }
    return new Response(request.method === "HEAD" ? null : publicHtml(pathname, { maintenance, production }), { headers: { ...privateHeaders, "Content-Type": "text/html; charset=utf-8" } });
  }
  // Blob upload completion is signed and verified by handleUploadPresigned in the handler.
  // A forged signature can only reach that callback branch, never a document mutation.
  if (pathname === "/api/platform-admin-documents" && request.method === "POST"
    && !routingFlags && request.headers.has("x-vercel-signature") && await uploadCompletion(request)) {
    return next({ headers: privateHeaders });
  }
  // Exact transport exceptions only; each handler still authenticates its requests.
  if (maintenanceAllowedPath(pathname) && !routingFlags) return next({ headers: pathname.startsWith("/assets/") ? {} : privateHeaders });
  if (pathname === "/api/platform-admin" && request.method === "GET" && url.searchParams.size === 1 && url.searchParams.get("security") === "1") return next({ headers: privateHeaders });
  const required = internalPathRole(pathname);
  try {
    const state = await readMaintenance();
    if (required || state.enabled) {
      const identity = required ? await verifiedIdentity(accessToken(request.headers)) : await verifiedRequestIdentity(request.headers);
      if (required && !permits(identity.role, required)) {
        // Existing Stripe sessions may still return to this exact admin URL.
        // Redirect to a public session-restoration shell, never expose admin HTML.
        if (request.method === 'GET' && !routingFlags && pathname === '/administration-interne'
          && url.searchParams.size === 1 && url.searchParams.get('test') === '1') {
          return new Response(null, { status: 303, headers: { ...privateHeaders, Location: '/retour-facturation?test=1' } });
        }
        return new Response("Accès refusé.", { status: identity.user ? 403 : 401, headers: privateHeaders });
      }
      if (state.enabled && !identity.role) {
        const headers = { ...privateHeaders, "Retry-After": "300" };
        if (pathname.startsWith("/api/")) return Response.json({ ok: false, error: "Maintenance en cours." }, { status: 503, headers });
        return new Response(maintenanceHtml(state.message), { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
      }
    }
    return next({ headers: privateHeaders });
  } catch {
    return new Response("Service momentanément indisponible.", { status: 503, headers: privateHeaders });
  }
}

export default async function middleware(request) {
  const response = await routeRequest(request);
  response.headers.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com");
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  // Non-public pages, callbacks, QR tokens and all Preview responses stay out of search.
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  if (process.env.VERCEL_ENV !== "production" || !["www.carnetpass.fr", "carnetpass.fr"].includes(new URL(request.url).hostname) || !isPublicPresentation(path) || response.status >= 400) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}
