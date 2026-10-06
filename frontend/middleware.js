import { next } from "@vercel/functions";
import { MAINTENANCE_KEY, maintenanceAllowedPath, maintenanceHtml } from "./server/lib/maintenance-state.js";

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
  const headers = { "Cache-Control": "no-store", "Retry-After": "300" };
  if (pathname.startsWith("/api/")) {
    return Response.json({ ok: false, error: "CarnetPass est momentanément en maintenance." }, { status: 503, headers });
  }
  return new Response(maintenanceHtml(state.message), {
    status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}
