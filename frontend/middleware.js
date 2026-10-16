import { next } from "@vercel/functions";
import { maintenanceAllowedPath, maintenanceHtml } from "./server/lib/maintenance-state.js";
import { internalPathRole, permits, privateHeaders, readMaintenance, verifiedRequestIdentity } from "./server/lib/internal-access.js";

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

export default async function middleware(request) {
  const url = new URL(request.url);
  // Public rewrite aliases must not let caller-supplied dispatcher flags select another handler.
  const routingFlags = [...url.searchParams.keys()].some(key => key.endsWith("_route") || key === "webhook");
  let pathname;
  try { pathname = decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/"; }
  catch { return new Response("Requête invalide.", { status: 400, headers: privateHeaders }); }
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
      const identity = await verifiedRequestIdentity(request.headers);
      if (required && !permits(identity.role, required)) {
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
