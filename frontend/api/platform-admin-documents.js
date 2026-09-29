import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient } from "@supabase/supabase-js";
import { del, get, issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned } from "@vercel/blob/client";

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const maximumSizeInBytes = 10 * 1024 * 1024;
const fail = (res, status, error) => res.status(status).json({ ok: false, error });
const enabled = () => process.env.VERCEL_ENV === "preview"
  && process.env.VERCEL_GIT_COMMIT_REF === "feature/documentation-multi-docs"
  && process.env.VITE_SUPABASE_URL === "https://bqqzzbwqmiyxcotvqtoc.supabase.co";
const service = () => createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, options);

async function authorize(token) {
  if (!token || token.length > 16384) return null;
  const auth = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error || !user?.email_confirmed_at) return null;
  const { data: role } = await service().from("platform_admins").select("role").eq("user_id", user.id).maybeSingle();
  return role ? user : null;
}

function clean(value, max) {
  const result = String(value || "").trim();
  return result.length >= 2 && result.length <= max ? result : null;
}

async function completeUpload({ blob, tokenPayload }) {
  const metadata = JSON.parse(tokenPayload || "{}");
  const pathname = blob?.pathname;
  if (!pathname || pathname !== metadata.pathname || !/^platform-documents\/[0-9a-f-]{36}\.pdf$/i.test(pathname)) return;
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
    original_filename: metadata.filename,
    blob_pathname: pathname,
    size_bytes: size,
    sha256: hash.digest("hex"),
  }, { onConflict: "blob_pathname", ignoreDuplicates: true });
  if (error) throw error;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!enabled()) return fail(res, 404, "Fonction indisponible.");
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || !process.env.SUPABASE_SECRET_KEY || !process.env.BLOB_WEBHOOK_PUBLIC_KEY) {
    return fail(res, 503, "Configuration de l'import indisponible.");
  }
  if (req.method === "GET") {
    const token = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "")?.[1];
    const user = await authorize(token);
    if (!user) return fail(res, 403, "Accès refusé.");
    if (req.query?.id) {
      if (typeof req.query.id !== "string" || !/^[0-9a-f-]{36}$/i.test(req.query.id)) return fail(res, 400, "Document invalide.");
      const { data: entry, error: lookupError } = await service().from("platform_document_intake")
        .select("blob_pathname, size_bytes").eq("id", req.query.id).maybeSingle();
      if (lookupError || !entry) return fail(res, 404, "Document introuvable.");
      const stored = await get(entry.blob_pathname, { access: "private", useCache: false });
      if (!stored?.stream || stored.blob?.pathname !== entry.blob_pathname
        || stored.blob?.contentType !== "application/pdf" || stored.blob?.size !== entry.size_bytes) {
        return fail(res, 409, "Fichier indisponible ou altéré.");
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=notice-carnetpass.pdf");
      res.setHeader("Content-Length", String(entry.size_bytes));
      res.setHeader("X-Content-Type-Options", "nosniff");
      await pipeline(Readable.fromWeb(stored.stream), res);
      return;
    }
    const { data, error } = await service().from("platform_document_intake")
      .select("id, manufacturer, model_reference, title, original_filename, size_bytes, status, created_at")
      .order("created_at", { ascending: false }).limit(50);
    return error ? fail(res, 503, "Documents indisponibles.") : res.status(200).json({ ok: true, documents: data });
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
    const filename = String(payload.filename || "").trim();
    if (!user || !manufacturer || !modelReference || !title || !filename.toLowerCase().endsWith(".pdf")
      || filename.length > 255 || body.payload?.multipart === true
      || !/^platform-documents\/[0-9a-f-]{36}\.pdf$/i.test(body.payload?.pathname || "")) {
      return fail(res, 403, "Envoi refusé.");
    }
    authorization = { userId: user.id, manufacturer, modelReference, title, filename, pathname: body.payload.pathname };
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
