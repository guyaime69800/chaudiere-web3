import { next } from "@vercel/functions";
import { MAINTENANCE_KEY, MAINTENANCE_ACCESS_PREFIX, MAINTENANCE_ACCESS_COOKIE, maintenanceAllowedPath, maintenanceHtml } from "./server/lib/maintenance-state.js";
import { createHash } from "node:crypto";

export const config = { runtime: "nodejs" };

export default async function middleware(request) {
  if (process.env.VERCEL_ENV !== "production") return next();
  const pathname = new URL(request.url).pathname;
  if (maintenanceAllowedPath(pathname)) return next();
  const url = process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
  if (!url || !token) return next();
  let state;
  try {
    const response = await fetch(`${url}/get/${encodeURIComponent(MAINTENANCE_KEY)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return next();
    const payload = await response.json();
    state = typeof payload.result === "string" ? JSON.parse(payload.result) : payload.result;
  } catch {
    return next();
  }
  if (!state?.enabled) return next();
  const accessToken = new RegExp(`(?:^|;\\s*)${MAINTENANCE_ACCESS_COOKIE}=([a-f0-9]{64})(?:;|$)`).exec(request.headers.get("cookie") || "")?.[1];
  if (accessToken) {
    try {
      const key = `${MAINTENANCE_ACCESS_PREFIX}${createHash("sha256").update(accessToken).digest("hex")}`;
      const response = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        const payload = await response.json();
        const access = typeof payload.result === "string" ? JSON.parse(payload.result) : payload.result;
        if (access?.founderId && Date.parse(access.expiresAt) > Date.now()) {
          if (!access.durable) return next();
          // Durable founder passes are revoked when the server role is removed.
          if (/^[a-f0-9-]{36}$/i.test(access.founderId) && process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
            const roleResponse = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/platform_admins?user_id=eq.${encodeURIComponent(access.founderId)}&select=role`, {
              headers: { apikey: process.env.SUPABASE_SECRET_KEY }, signal: AbortSignal.timeout(2000),
            });
            if (roleResponse.ok) {
              const roles = await roleResponse.json();
              if (roles.length === 1 && roles[0].role === "founder") return next();
            }
          }
        }
      }
    } catch { /* An invalid access pass never bypasses maintenance. */ }
  }
  const headers = { "Cache-Control": "no-store", "Retry-After": "300" };
  if (pathname.startsWith("/api/")) {
    return Response.json({ ok: false, error: "CarnetPass est momentanément en maintenance." }, { status: 503, headers });
  }
  return new Response(maintenanceHtml(state.message), {
    status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}
