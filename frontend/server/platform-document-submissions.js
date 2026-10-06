import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { del, get, put } from "@vercel/blob";
import { requireVerifiedCompany } from "./lib/require-verified-company.js";
import { platformDocumentEnvironment, platformDocumentPathname } from "./lib/platform-document-environment.js";

export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const MAX_BYTES = 10 * 1024 * 1024;
const db = () => createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const fail = (res, status, error) => res.status(status).json({ ok: false, error });

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") return fail(res, 405, "Méthode non autorisée.");
  const environment = platformDocumentEnvironment(process.env);
  if (environment.status) return fail(res, environment.status, "Proposition de document indisponible.");
  const professional = await requireVerifiedCompany(req, res);
  if (!professional) return;
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.BLOB_STORE_ID) {
    return fail(res, 503, "Proposition de document momentanément indisponible.");
  }
  const { attachmentId, rightsConfirmed } = req.body || {};
  if (typeof attachmentId !== "string" || !UUID.test(attachmentId) || rightsConfirmed !== true) {
    return fail(res, 400, "Sélectionne un PDF et confirme que tu as le droit de proposer ce document.");
  }

  const database = db();
  const pathname = `platform-documents/${attachmentId}.pdf`;
  if (!platformDocumentPathname(pathname, environment.name)) {
    return fail(res, 400, "Document invalide.");
  }

  try {
    const { data: attachment, error: attachmentError } = await database
      .from("equipment_private_attachments")
      .select("id, equipment_id, document_kind, title, original_filename, mime_type, size_bytes, sha256, blob_pathname")
      .eq("id", attachmentId).eq("company_id", professional.companyId)
      .is("deleted_at", null).maybeSingle();
    if (attachmentError) return fail(res, 503, "Vérification du document indisponible.");
    if (!attachment) return fail(res, 404, "Ce document privé est introuvable dans ton entreprise.");
    if (!["other", "photo"].includes(attachment.document_kind)
      || attachment.mime_type !== "application/pdf" || attachment.size_bytes < 1
      || attachment.size_bytes > MAX_BYTES) {
      return fail(res, 400, "Seul un document technique PDF de 10 Mo maximum peut être proposé au catalogue.");
    }

    const { data: equipment, error: equipmentError } = await database.from("equipments")
      .select("brand, model, product_reference")
      .eq("id", attachment.equipment_id).eq("company_id", professional.companyId).maybeSingle();
    if (equipmentError || !equipment) return fail(res, 503, "Vérification de l’équipement indisponible.");
    const manufacturer = String(equipment.brand || "").trim();
    const modelReference = String(equipment.product_reference || "").trim();
    if (manufacturer.length < 2 || manufacturer.length > 120
      || modelReference.length < 2 || modelReference.length > 160) {
      return fail(res, 400, "Renseigne la marque et la référence constructeur exacte de l’équipement avant de proposer ce PDF.");
    }

    const { data: existing, error: existingError } = await database.from("platform_document_intake")
      .select("id, status").eq("blob_pathname", pathname).maybeSingle();
    if (existingError) return fail(res, 503, "Vérification des propositions indisponible.");
    if (existing) return res.status(200).json({ ok: true, status: existing.status, alreadySubmitted: true });

    const { count, error: countError } = await database.from("platform_document_intake")
      .select("id", { count: "exact", head: true })
      .eq("uploaded_by", professional.userId).eq("status", "pending_review");
    if (countError) return fail(res, 503, "Vérification des propositions indisponible.");
    if (count >= 10) return fail(res, 429, "Tu as déjà 10 documents en attente de validation.");

    const stored = await get(attachment.blob_pathname, { access: "private", useCache: false });
    if (!stored?.stream || stored.blob?.pathname !== attachment.blob_pathname
      || stored.blob?.contentType !== "application/pdf"
      || stored.blob?.size !== attachment.size_bytes) {
      return fail(res, 409, "Le PDF privé n’est plus disponible ou a changé.");
    }
    const chunks = [];
    const hash = createHash("sha256");
    let size = 0;
    let header = Buffer.alloc(0);
    for await (const chunk of stored.stream) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_BYTES) return fail(res, 400, "Le PDF dépasse 10 Mo.");
      chunks.push(bytes);
      hash.update(bytes);
      if (header.length < 1024) header = Buffer.concat([header, bytes.subarray(0, 1024 - header.length)]);
    }
    const digest = hash.digest("hex");
    if (size !== attachment.size_bytes || digest !== attachment.sha256
      || !header.toString("latin1").includes("%PDF-")) {
      return fail(res, 409, "Le PDF privé ne correspond plus au document enregistré.");
    }

    await put(pathname, Buffer.concat(chunks), {
      access: "private", contentType: "application/pdf",
      addRandomSuffix: false, allowOverwrite: false,
    });
    const { error: insertError } = await database.from("platform_document_intake").insert({
      uploaded_by: professional.userId,
      manufacturer,
      model_reference: modelReference,
      title: attachment.title,
      original_filename: attachment.original_filename,
      blob_pathname: pathname,
      size_bytes: size,
      sha256: digest,
      status: "pending_review",
    });
    if (insertError) {
      await del(pathname).catch((error) => console.error("Nettoyage du PDF proposé impossible", error));
      return fail(res, 503, "Enregistrement de la proposition impossible. Réessaie.");
    }
    return res.status(201).json({ ok: true, status: "pending_review" });
  } catch (error) {
    console.error("Proposition de document impossible", error);
    return fail(res, 503, "Proposition de document momentanément indisponible.");
  }
}
