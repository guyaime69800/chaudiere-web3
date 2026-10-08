import { createClient } from "@supabase/supabase-js";
import { get } from "@vercel/blob";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { requireVerifiedCompany } from "./require-verified-company.js";
import { platformDocumentCatalogAllowed, platformDocumentEnvironment } from "./platform-document-environment.js";
import { discoveryDocumentsQuotaAvailable } from "./shiba-quota.js";

const options = { auth: { persistSession: false, autoRefreshToken: false } };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée." });
  const environment = platformDocumentEnvironment(process.env);
  if (environment.status) return res.status(environment.status).json({ error: "Catalogue indisponible." });
  const professional = await requireVerifiedCompany(req, res);
  if (!professional) return;
  if (!platformDocumentCatalogAllowed(environment.name, professional.accessKind)) {
    return res.status(403).json({ error: "Catalogue indisponible pour ce compte." });
  }
  try {
    if (!await discoveryDocumentsQuotaAvailable(professional)) {
      return res.status(403).json({ code: "DISCOVERY_QUOTA_REACHED", error: "Les 20 questions de votre essai Découverte ont été utilisées. L’accès aux documents est terminé." });
    }
  } catch {
    return res.status(503).json({ error: "Vérification de l’accès au catalogue momentanément indisponible." });
  }
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
    const managed = await db.from("platform_document_intake")
      .select("id, manufacturer, model_reference, catalog_category, model_aliases")
      .order("created_at", { ascending: false }).limit(500);
    if (managed.error) return res.status(503).json({ error: "Catalogue indisponible." });
    const { data, error } = await db.from("platform_document_intake")
      .select("id, manufacturer, model_reference, title, catalog_category, hotline_phone, model_aliases, rag_status")
      .eq("status", "approved").not("distribution_confirmed_at", "is", null)
      .order("created_at", { ascending: false }).limit(500);
    if (!error) return res.status(200).json({ ok: true, documents: data, managedModels: managed.data });
    const fallback = await db.from("platform_document_intake")
      .select("id, manufacturer, model_reference, title, catalog_category, hotline_phone, model_aliases")
      .eq("status", "approved").not("distribution_confirmed_at", "is", null)
      .order("created_at", { ascending: false }).limit(500);
    return fallback.error ? res.status(503).json({ error: "Catalogue indisponible." })
      : res.status(200).json({ ok: true, documents: fallback.data, managedModels: managed.data });
  } catch {
    if (!res.headersSent) return res.status(503).json({ error: "Catalogue indisponible." });
  }
}
