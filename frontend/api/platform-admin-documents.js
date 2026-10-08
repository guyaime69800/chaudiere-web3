import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient } from "@supabase/supabase-js";
import { del, get, list, issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned } from "@vercel/blob/client";
import platformCatalogDocuments from "../server/lib/platform-catalog-documents.js";
import platformDocumentSubmissions from "../server/platform-document-submissions.js";
import { platformDocumentEnvironment, platformDocumentPathname } from "../server/lib/platform-document-environment.js";
import { indexPlatformDocument } from "../server/lib/platform-document-rag.js";
import { loadPlatformPdf } from "../server/lib/verify-platform-pdf.js";
import { mfaAccessError } from "../server/lib/mfa-access.js";

export const maxDuration = 300;

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const maximumSizeInBytes = 30 * 1024 * 1024;
const catalogCategories = new Set(["boiler", "heat_pump_indoor", "heat_pump_outdoor", "air_conditioning_indoor", "air_conditioning_outdoor", "burner", "water_heater", "regulation", "heat_pump_water_heater", "vmc"]);
const fail = (res, status, error) => res.status(status).json({ ok: false, error });
const service = () => createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, options);

async function loadVerifiedPdf(entry, environment) {
  try {
    return await loadPlatformPdf(entry, environment,
      (pathname) => get(pathname, { access: "private", useCache: false }));
  } catch (error) {
    console.error("Private document Blob read failed", { pathname: entry.blob_pathname, error });
    return { ok: false, reason: "storage" };
  }
}

function pdfFailure(res, reason) {
  if (reason === "missing") return fail(res, 409, "PDF absent du Blob Store configuré pour ce site.");
  if (reason === "storage") return fail(res, 503, "Lecture du Blob Store indisponible.");
  return fail(res, 409, "Le PDF stocké ne correspond pas à la fiche enregistrée.");
}

function* byteChunks(bytes) {
  for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
    yield bytes.subarray(offset, offset + 64 * 1024);
  }
}

async function authorize(token) {
  if (!token || token.length > 16384) return null;
  const auth = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error || !user?.email_confirmed_at) return null;
  const { data: role } = await service().from("platform_admins").select("role").eq("user_id", user.id).maybeSingle();
  if (role && mfaAccessError(user, token, { required: true })) return null;
  return role ? { ...user, platformRole: role.role } : null;
}

function clean(value, max) {
  const result = String(value || "").trim();
  return result.length >= 2 && result.length <= max ? result : null;
}

async function completeUpload({ blob, tokenPayload }) {
  const metadata = JSON.parse(tokenPayload || "{}");
  const pathname = blob?.pathname;
  const environment = platformDocumentEnvironment(process.env);
  if (environment.status || pathname !== metadata.pathname
    || !platformDocumentPathname(pathname, environment.name)) return;
  const found = await get(pathname, { access: "private", useCache: false });
  if (!found?.stream || found.blob?.size < 1 || found.blob.size > maximumSizeInBytes
    || found.blob.contentType !== "application/pdf") {
    await del(pathname);
    return;
  }
  const hash = createHash("sha256");
  let header = Buffer.alloc(0);
  let size = 0;
  for await (const chunk of found.stream) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maximumSizeInBytes) { await del(pathname); return; }
    hash.update(bytes);
    if (header.length < 1024) header = Buffer.concat([header, bytes.subarray(0, 1024 - header.length)]);
  }
  if (size !== found.blob.size || !header.toString("latin1").includes("%PDF-")) {
    await del(pathname);
    return;
  }
  const { error } = await service().from("platform_document_intake").upsert({
    uploaded_by: metadata.userId,
    manufacturer: metadata.manufacturer,
    model_reference: metadata.modelReference,
    title: metadata.title,
    hotline_phone: metadata.hotlinePhone || null,
    original_filename: metadata.filename,
    blob_pathname: pathname,
    size_bytes: size,
    sha256: hash.digest("hex"),
  }, { onConflict: "blob_pathname", ignoreDuplicates: true });
  if (error) throw error;
}

export default async function handler(req, res) {
  if (req.query?.catalog_route === "1") return platformCatalogDocuments(req, res);
  if (req.query?.submission_route === "1") return platformDocumentSubmissions(req, res);
  res.setHeader("Cache-Control", "no-store");
  const environment = platformDocumentEnvironment(process.env);
  if (environment.status) return fail(res, environment.status, "Fonction indisponible.");
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || !process.env.SUPABASE_SECRET_KEY || !process.env.BLOB_WEBHOOK_PUBLIC_KEY) {
    return fail(res, 503, "Configuration de l'import indisponible.");
  }
  if (req.method === "PATCH") {
    const token = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "")?.[1];
    const user = await authorize(token);
    if (!user) return fail(res, 403, "Accès refusé.");
    const { id, action, category, distributionConfirmed } = req.body || {};
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)
      || !["approve", "publish-imported", "reject", "set-hotline", "set-aliases", "index", "unpublish", "delete"].includes(action)
      || (["approve", "publish-imported"].includes(action)
        && (!catalogCategories.has(category) || distributionConfirmed !== true))) {
      return fail(res, 400, "Validation incomplète.");
    }
    const db = service();
    if (action === "set-hotline") {
      const phone = String(req.body?.phone || "").trim();
      if (phone && (phone.length < 6 || phone.length > 32 || !/^[+0-9(). -]+$/.test(phone)
        || (phone.match(/\d/g) || []).length < 6)) return fail(res, 400, "Numéro de hotline invalide.");
      const { data: updated, error } = await db.from("platform_document_intake")
        .update({ hotline_phone: phone || null }).eq("id", id).eq("status", "approved")
        .select("id").maybeSingle();
      if (error || !updated) return fail(res, 503, "Enregistrement de la hotline impossible.");
      return res.status(200).json({ ok: true });
    }
    if (action === "set-aliases") {
      const aliases = String(req.body?.aliases || "").split(",").map((value) => value.trim()).filter(Boolean);
      if (aliases.length > 10 || aliases.some((value) => value.length < 2 || value.length > 160)) {
        return fail(res, 400, "Références associées invalides.");
      }
      const { data: updated, error } = await db.from("platform_document_intake")
        .update({ model_aliases: [...new Set(aliases)] }).eq("id", id).eq("status", "approved")
        .select("id").maybeSingle();
      if (error || !updated) return fail(res, 503, "Enregistrement des références impossible.");
      return res.status(200).json({ ok: true });
    }
    let { data: entry, error: lookupError } = await db.from("platform_document_intake")
      .select("id, blob_pathname, size_bytes, sha256, status, title, rag_status, rag_error, rag_started_at, distribution_confirmed_at")
      .eq("id", id).maybeSingle();
    if (lookupError) {
      const fallback = await db.from("platform_document_intake")
        .select("id, blob_pathname, size_bytes, sha256, status, title").eq("id", id).maybeSingle();
      entry = fallback.data; lookupError = fallback.error;
    }
    if (lookupError || !entry) return fail(res, 404, "Document introuvable.");
    if (action === "unpublish") {
      if (environment.name !== "production" || entry.status !== "approved"
        || !entry.distribution_confirmed_at) return fail(res, 409, "Document non diffusé.");
      const { data: withdrawn, error } = await db.from("platform_document_intake")
        .update({ distribution_confirmed_at: null, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("id", id).eq("status", "approved").not("distribution_confirmed_at", "is", null)
        .select("id").maybeSingle();
      if (error) return fail(res, 503, "Retrait de la diffusion impossible.");
      if (!withdrawn) return fail(res, 409, "Document déjà retiré ou modifié.");
      return res.status(200).json({ ok: true });
    }
    if (action === "delete") {
      if (environment.name !== "production" || user.platformRole !== "founder") return fail(res, 403, "Suppression réservée au fondateur.");
      if (entry.rag_error === "deleted_by_admin") return fail(res, 404, "Document déjà supprimé.");
      if (entry.rag_status === "indexing") return fail(res, 409, "Attendez la fin de l'indexation avant de supprimer ce document.");
      const { data: withdrawn, error: withdrawError } = await db.from("platform_document_intake")
        .update({ status: "rejected", distribution_confirmed_at: null, rag_data: null,
          reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("id", id).select("id").maybeSingle();
      if (withdrawError || !withdrawn) return fail(res, 503, "Retrait du catalogue impossible.");
      try {
        const verified = await loadVerifiedPdf(entry, environment.name);
        if (!verified.ok && verified.reason !== "missing") return pdfFailure(res, verified.reason);
        if (verified.ok) await del(verified.pathname);
      } catch (error) {
        console.error("Private document Blob deletion failed", { pathname: entry.blob_pathname, error });
        return fail(res, 503, "Suppression du PDF indisponible. Réessayez depuis les archives.");
      }
      const { error: deletedError } = await db.from("platform_document_intake")
        .update({ rag_status: "pending", rag_error: "deleted_by_admin" }).eq("id", id).eq("status", "rejected");
      if (deletedError) return fail(res, 503, "PDF retiré, mais archivage de la suppression indisponible. Réessayez.");
      return res.status(200).json({ ok: true });
    }
    if (action === "index") {
      if (entry.rag_status === undefined) return fail(res, 503, "Indexation indisponible dans cette base Supabase.");
      if (entry.status !== "approved") return fail(res, 409, "Publiez le document avant son indexation.");
      if (entry.rag_status === "ready") return res.status(200).json({ ok: true, indexStatus: "ready" });
      const result = await indexPlatformDocument(db, entry);
      return res.status(200).json({ ok: true, indexStatus: result.status, indexError: result.error || null });
    }
    if (action === "publish-imported" && (environment.name !== "production"
      || entry.status !== "approved" || entry.distribution_confirmed_at !== null
      || entry.rag_status !== "ready")) {
      return fail(res, 409, "Ce document n'est pas en attente de publication.");
    }
    if (action !== "publish-imported" && entry.status !== "pending_review") {
      return fail(res, 409, "Document déjà traité.");
    }
    let verified;
    if (action === "approve" || action === "publish-imported") {
      verified = await loadVerifiedPdf(entry, environment.name);
      if (!verified.ok) return pdfFailure(res, verified.reason);
    }
    const now = new Date().toISOString();
    if (action === "publish-imported") {
      const { data: published, error: publishError } = await db.from("platform_document_intake")
        .update({ catalog_category: category, distribution_confirmed_at: now,
          blob_pathname: verified.pathname,
          reviewed_by: user.id, reviewed_at: now })
        .eq("id", id).eq("status", "approved").is("distribution_confirmed_at", null)
        .eq("rag_status", "ready").select("id").maybeSingle();
      if (publishError) return fail(res, 503, "Publication indisponible.");
      if (!published) return fail(res, 409, "Document déjà publié ou modifié.");
      return res.status(200).json({ ok: true, indexStatus: "ready" });
    }
    const { data: updated, error } = await db.from("platform_document_intake")
      .update({ status: action === "approve" ? "approved" : "rejected",
        catalog_category: action === "approve" ? category : null,
        distribution_confirmed_at: action === "approve" ? now : null,
        ...(verified?.ok ? { blob_pathname: verified.pathname } : {}),
        reviewed_by: user.id, reviewed_at: now })
      .eq("id", id).eq("status", "pending_review").select("id").maybeSingle();
    if (error) return fail(res, 503, "Validation indisponible.");
    if (!updated) return fail(res, 409, "Document déjà traité.");
    if (action === "approve") {
      if (entry.rag_status === undefined) return res.status(200).json({ ok: true, indexStatus: "pending" });
      const result = await indexPlatformDocument(db, { ...entry, blob_pathname: verified.pathname, status: "approved" });
      return res.status(200).json({ ok: true, indexStatus: result.status, indexError: result.error || null });
    }
    return res.status(200).json({ ok: true });
  }
  if (req.method === "GET") {
    const token = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "")?.[1];
    const user = await authorize(token);
    if (!user) return fail(res, 403, "Accès refusé.");
    if (req.query?.inventory === "1") {
      if (user.platformRole !== "founder") return fail(res, 403, "Accès réservé au fondateur.");
      const cursor = req.query?.cursor;
      if (cursor !== undefined && (typeof cursor !== "string" || cursor.length > 2048)) return fail(res, 400, "Curseur invalide.");
      try {
        const inventory = await list({ prefix: "platform-documents/", limit: 1000, ...(cursor ? { cursor } : {}) });
        return res.status(200).json({ ok: true, documents: inventory.blobs.map(blob => ({ pathname: blob.pathname, size: blob.size })), cursor: inventory.cursor, hasMore: inventory.hasMore });
      } catch { return fail(res, 503, "Inventaire documentaire indisponible."); }
    }
    if (req.query?.id) {
      if (typeof req.query.id !== "string" || !/^[0-9a-f-]{36}$/i.test(req.query.id)) return fail(res, 400, "Document invalide.");
      const { data: entry, error: lookupError } = await service().from("platform_document_intake")
        .select("blob_pathname, size_bytes, sha256").eq("id", req.query.id).maybeSingle();
      if (lookupError || !entry) return fail(res, 404, "Document introuvable.");
      const verified = await loadVerifiedPdf(entry, environment.name);
      if (!verified.ok) return pdfFailure(res, verified.reason);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=notice-carnetpass.pdf");
      res.setHeader("Content-Length", String(entry.size_bytes));
      res.setHeader("X-Content-Type-Options", "nosniff");
      await pipeline(Readable.from(byteChunks(verified.bytes)), res);
      return;
    }
    const { data, error } = await service().from("platform_document_intake")
      .select("id, blob_pathname, manufacturer, model_reference, title, original_filename, size_bytes, status, catalog_category, distribution_confirmed_at, hotline_phone, model_aliases, rag_status, rag_error, rag_started_at, rag_indexed_at, created_at")
      .order("created_at", { ascending: false }).limit(50);
    if (!error) return res.status(200).json({ ok: true, documents: data.filter((entry) => entry.rag_error !== "deleted_by_admin"), publicationReady: true, hotlineReady: true });
    const fallback = await service().from("platform_document_intake")
      .select("id, blob_pathname, manufacturer, model_reference, title, original_filename, size_bytes, status, catalog_category, hotline_phone, model_aliases, created_at")
      .order("created_at", { ascending: false }).limit(50);
    return fallback.error ? fail(res, 503, "Documents indisponibles.")
      : res.status(200).json({ ok: true, documents: fallback.data, publicationReady: true, hotlineReady: true });
  }
  if (req.method !== "POST") return fail(res, 405, "Méthode non autorisée.");
  const body = req.body;
  if (!body || !["blob.generate-presigned-url", "blob.upload-completed"].includes(body.type)) {
    return fail(res, 400, "Demande invalide.");
  }
  let authorization;
  if (body.type === "blob.generate-presigned-url") {
    let payload;
    try { payload = JSON.parse(body.payload?.clientPayload || "{}"); } catch { return fail(res, 400, "Données invalides."); }
    const user = await authorize(payload.accessToken);
    const manufacturer = clean(payload.manufacturer, 120);
    const modelReference = clean(payload.modelReference, 160);
    const title = clean(payload.title, 200);
    const hotlinePhone = String(payload.hotlinePhone || "").trim();
    const filename = String(payload.filename || "").trim();
    if (!user || !manufacturer || !modelReference || !title || !filename.toLowerCase().endsWith(".pdf")
      || (hotlinePhone && (!/^[+0-9(). -]{6,32}$/.test(hotlinePhone) || (hotlinePhone.match(/\d/g) || []).length < 6))
      || filename.length > 255 || body.payload?.multipart === true
      || !platformDocumentPathname(body.payload?.pathname, environment.name)) {
      return fail(res, 403, "Envoi refusé.");
    }
    authorization = { userId: user.id, manufacturer, modelReference, title, hotlinePhone, filename, pathname: body.payload.pathname };
  }
  try {
    const result = await handleUploadPresigned({
      request: req,
      body,
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY,
      getSignedToken: async (pathname) => {
        if (!authorization || pathname !== authorization.pathname) throw new Error("Upload forbidden");
        const validUntil = Date.now() + 10 * 60 * 1000;
        const token = await issueSignedToken({ pathname, operations: ["put"], validUntil,
          allowedContentTypes: ["application/pdf"], maximumSizeInBytes });
        return { token, urlOptions: { validUntil, allowedContentTypes: ["application/pdf"], maximumSizeInBytes,
          addRandomSuffix: false, allowOverwrite: false, tokenPayload: JSON.stringify(authorization) } };
      },
      onUploadCompleted: completeUpload,
    });
    return res.status(200).json(result);
  } catch {
    return fail(res, 400, "Import impossible. Vérifiez le PDF et réessayez.");
  }
}
