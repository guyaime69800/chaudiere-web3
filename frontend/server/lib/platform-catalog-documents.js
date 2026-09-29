import { createClient } from "@supabase/supabase-js";
import { get } from "@vercel/blob";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { requireVerifiedCompany } from "./require-verified-company.js";

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const enabled = () => process.env.VERCEL_ENV === "preview"
  && process.env.VERCEL_GIT_COMMIT_REF === "feature/documentation-multi-docs"
  && process.env.VITE_SUPABASE_URL === "https://bqqzzbwqmiyxcotvqtoc.supabase.co";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée." });
  if (!enabled()) return res.status(404).json({ error: "Catalogue indisponible." });
  const professional = await requireVerifiedCompany(req, res);
  if (!professional) return;
  if (!process.env.SUPABASE_SECRET_KEY) return res.status(503).json({ error: "Catalogue indisponible." });
  const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, options);
  const id = req.query?.id;
  if (id !== undefined && (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) {
    return res.status(400).json({ error: "Document invalide." });
  }
  try {
    if (id) {
      const { data: entry, error } = await db.from("platform_document_intake")
        .select("blob_pathname, size_bytes").eq("id", id).eq("status", "approved")
        .not("distribution_confirmed_at", "is", null).maybeSingle();
      if (error || !entry) return res.status(404).json({ error: "Document introuvable." });
      const stored = await get(entry.blob_pathname, { access: "private", useCache: false });
      if (!stored?.stream || stored.blob?.pathname !== entry.blob_pathname
        || stored.blob?.contentType !== "application/pdf" || stored.blob?.size !== entry.size_bytes) {
        return res.status(409).json({ error: "PDF indisponible." });
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=notice-carnetpass.pdf");
      res.setHeader("Content-Length", String(entry.size_bytes));
      res.setHeader("X-Content-Type-Options", "nosniff");
      await pipeline(Readable.fromWeb(stored.stream), res);
      return;
    }
    const { data, error } = await db.from("platform_document_intake")
      .select("id, manufacturer, model_reference, title, catalog_category, hotline_phone, model_aliases")
      .eq("status", "approved").not("distribution_confirmed_at", "is", null)
      .order("created_at", { ascending: false }).limit(500);
    if (!error) return res.status(200).json({ ok: true, documents: data });
    const fallback = await db.from("platform_document_intake")
      .select("id, manufacturer, model_reference, title, catalog_category")
      .eq("status", "approved").not("distribution_confirmed_at", "is", null)
      .order("created_at", { ascending: false }).limit(500);
    return fallback.error ? res.status(503).json({ error: "Catalogue indisponible." })
      : res.status(200).json({ ok: true, documents: fallback.data });
  } catch {
    if (!res.headersSent) return res.status(503).json({ error: "Catalogue indisponible." });
  }
}
