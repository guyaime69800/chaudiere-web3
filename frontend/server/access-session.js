import { accessToken, INTERNAL_COOKIE, privateHeaders, readMaintenance, verifiedIdentity } from "./lib/internal-access.js";

// Rewritten through verify-company: no additional Vercel function.
export default async function accessSession(req, res) {
  for (const [key, value] of Object.entries(privateHeaders)) res.setHeader(key, value);
  if (!["GET", "POST", "DELETE"].includes(req.method)) return res.status(405).json({ ok: false });
  const clear = () => res.setHeader("Set-Cookie", `${INTERNAL_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  if (req.method !== "GET") {
    if (!req.headers.host || req.headers.origin !== `https://${req.headers.host}`) return res.status(403).json({ ok: false });
  }
  if (req.method === "DELETE") { clear(); return res.status(200).json({ ok: true }); }
  try {
    // No cookie-only or client-supplied role can mint internal access.
    const token = accessToken(new Headers(req.headers), false);
    const { user, role, mfaRequired } = await verifiedIdentity(token);
    if (mfaRequired) { clear(); return res.status(req.method === "GET" ? 200 : 403).json({ ok: true, role: null, authenticated: true, mfaRequired: true }); }
    const state = await readMaintenance();
    if (req.method === "POST") {
      if (!role || token.length > 3500) { clear(); return res.status(user ? 403 : 401).json({ ok: false }); }
      res.setHeader("Set-Cookie", `${INTERNAL_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=300`);
    }
    if (state.enabled && !role) return res.status(503).json({ ok: false, maintenance: true, message: state.message });
    return res.status(200).json({ ok: true, role, authenticated: Boolean(user) });
  } catch {
    clear();
    return res.status(503).json({ ok: false, error: "Vérification indisponible." });
  }
}
