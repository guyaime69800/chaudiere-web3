import { createHash } from "node:crypto";
import { mfaAccessError } from "./mfa-access.js";
import { MAINTENANCE_KEY } from "./maintenance-state.js";

export const INTERNAL_COOKIE = "__Host-carnetpass-internal";
export const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Vary: "Cookie, Authorization",
};

// A cookie carries a credential, never a trusted role. Every use is verified remotely.
export function accessToken(headers, allowCookie = true) {
  const authorization = headers.get("authorization");
  if (authorization) return /^Bearer ([A-Za-z0-9._-]{1,16384})$/i.exec(authorization)?.[1] || null;
  if (!allowCookie) return null;
  const values = (headers.get("cookie") || "").split(";")
    .map((entry) => entry.trim()).filter((entry) => entry.startsWith(`${INTERNAL_COOKIE}=`));
  if (values.length !== 1) return null;
  const value = values[0].slice(INTERNAL_COOKIE.length + 1);
  return /^[A-Za-z0-9._-]{1,16384}$/.test(value) ? value : null;
}

export async function verifiedIdentity(token, env = process.env) {
  if (!token) return { user: null, role: null };
  const url = env.VITE_SUPABASE_URL;
  const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const secret = env.SUPABASE_SECRET_KEY;
  if (!url || !publicKey || !secret) throw new Error("Access unavailable");
  const options = { cache: "no-store", signal: AbortSignal.timeout(4000) };
  const response = await fetch(`${url}/auth/v1/user`, {
    ...options, headers: { apikey: publicKey, Authorization: `Bearer ${token}` },
  });
  if ([401, 403].includes(response.status)) return { user: null, role: null };
  if (!response.ok) throw new Error("Auth unavailable");
  const user = await response.json();
  if (!user?.id || !user.email_confirmed_at) return { user: null, role: null };
  const roles = await fetch(`${url}/rest/v1/platform_admins?select=role&user_id=eq.${encodeURIComponent(user.id)}`, {
    ...options, signal: AbortSignal.timeout(4000),
    headers: { apikey: secret, Authorization: `Bearer ${secret}` },
  });
  if (!roles.ok) throw new Error("Roles unavailable");
  const rows = await roles.json();
  if (!Array.isArray(rows)) throw new Error("Roles invalid");
  const role = rows.length === 1 && ["founder", "operator"].includes(rows[0].role) ? rows[0].role : null;
  const mfaRequired = Boolean(role && mfaAccessError(user, token, { required: true }));
  return { user, role: mfaRequired ? null : role, mfaRequired };
}

export async function readMaintenance(env = process.env) {
  if (env.VERCEL_ENV !== "production") return { enabled: false };
  const url = env.UPSTASH_REDIS_REST_KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Maintenance unavailable");
  const response = await fetch(`${url}/get/${encodeURIComponent(MAINTENANCE_KEY)}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error("Maintenance unavailable");
  const payload = await response.json();
  const state = typeof payload.result === "string" ? JSON.parse(payload.result) : payload.result;
  if (state == null) return { enabled: false };
  if (typeof state.enabled !== "boolean") throw new Error("Maintenance invalid");
  return state;
}

export function internalPathRole(pathname) {
  pathname = pathname.toLowerCase();
  if (pathname === "/administration-maintenance" || pathname === "/api/maintenance-control") return "founder";
  if (pathname.startsWith("/administration-") || pathname === "/api/platform-admin") return "operator";
  return null;
}

export function permits(role, required) {
  return role === "founder" || (required === "operator" && role === "operator");
}

export async function verifiedRequestIdentity(headers, env = process.env) {
  const token = accessToken(headers);
  if (token || headers.has("authorization")) return verifiedIdentity(token, env);
  const pass = /(?:^|;\s*)carnetpass_maintenance_access=([a-f0-9]{64})(?:;|$)/.exec(headers.get("cookie") || "")?.[1];
  if (!pass || env.VERCEL_ENV !== "production") return {user:null,role:null};
  const url = env.UPSTASH_REDIS_REST_KV_REST_API_URL, key = env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
  if (!url || !key || !env.VITE_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error("Access unavailable");
  const hash = createHash("sha256").update(pass).digest("hex");
  const response = await fetch(`${url}/get/${encodeURIComponent(`carnetpass:production:maintenance-access:v1:${hash}`)}`, {headers:{Authorization:`Bearer ${key}`},cache:"no-store",signal:AbortSignal.timeout(2000)});
  if (!response.ok) throw new Error("Access unavailable");
  const payload = await response.json();
  const access = typeof payload.result === "string" ? JSON.parse(payload.result) : payload.result;
  if (!access?.durable || !/^[a-f0-9-]{36}$/i.test(access.founderId || "") || !(Date.parse(access.expiresAt) > Date.now())) return {user:null,role:null};
  const found = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/platform_admins?user_id=eq.${encodeURIComponent(access.founderId)}&select=role`, {headers:{apikey:env.SUPABASE_SECRET_KEY,Authorization:`Bearer ${env.SUPABASE_SECRET_KEY}`},cache:"no-store",signal:AbortSignal.timeout(2000)});
  if (!found.ok) throw new Error("Roles unavailable");
  const roles = await found.json();
  return roles.length === 1 && roles[0].role === "founder" ? {user:{id:access.founderId},role:"founder",legacyPass:true} : {user:null,role:null};
}
