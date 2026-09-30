import { createClient } from "@supabase/supabase-js";
import { del, get, put } from "@vercel/blob";
import { createHash, randomUUID } from "node:crypto";
import { requireVerifiedCompany } from "./lib/require-verified-company.js";
import { buildThermodynamicPdf } from "./lib/thermodynamic-document-pdf.js";
import { THERMODYNAMIC_KINDS, normalizeThermodynamicData, normalizeDrawnSignature, validateIssue } from "./lib/thermodynamic-document-schema.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const enabled = () => process.env.VERCEL_ENV === "preview"
  && process.env.VERCEL_GIT_COMMIT_REF === "feature/documentation-multi-docs"
  && process.env.VITE_SUPABASE_URL === "https://bqqzzbwqmiyxcotvqtoc.supabase.co";
const fail = (res, status, error) => res.status(status).json({ ok: false, error });
const validId = (value) => typeof value === "string" && UUID.test(value);

function adminDb() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.VITE_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function linkedIntervention(db, interventionId, professional) {
  const { data, error } = await db.from("interventions")
    .select("id, company_id, equipment_id, technician_id, polygon_state, intervention_at, intervention_type, work_performed")
    .eq("id", interventionId).eq("company_id", professional.companyId).maybeSingle();
  if (error || !data || data.polygon_state !== "confirmed") return null;
  const equipment = await db.from("equipments")
    .select("id, company_id, equipment_type, brand, model, product_reference, serial_number")
    .eq("id", data.equipment_id).eq("company_id", professional.companyId).maybeSingle();
  if (equipment.error || !equipment.data || !["air_conditioning", "heat_pump"].includes(equipment.data.equipment_type)) return null;
  return { intervention: data, equipment: equipment.data };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!enabled()) return fail(res, 404, "Fonction indisponible.");
  if (!["GET", "POST", "PATCH"].includes(req.method)) return fail(res, 405, "Méthode non autorisée.");
  const professional = await requireVerifiedCompany(req, res);
  if (!professional) return;
  const db = adminDb();
  if (!db) return fail(res, 503, "Service documentaire indisponible.");
  let archivedPathname = "";
  try {
    const id = req.query?.id;
    if (req.method === "GET" && id) {
      if (!validId(id)) return fail(res, 400, "Document invalide.");
      const { data, error } = await db.from("thermodynamic_documents").select("*")
        .eq("id", id).eq("company_id", professional.companyId).maybeSingle();
      if (error || !data) return fail(res, 404, "Document introuvable.");
      if (req.query?.format !== "pdf") return res.status(200).json({ ok: true, document: data });
      if (data.status !== "issued") return fail(res, 409, "Émettez le document avant de télécharger le PDF.");
      const stored = await get(data.pdf_pathname, { access: "private", useCache: false });
      if (!stored?.stream || stored.blob?.pathname !== data.pdf_pathname
        || stored.blob?.contentType !== "application/pdf"
        || stored.blob?.size !== data.pdf_size_bytes) return fail(res, 409, "Archive PDF indisponible.");
      const pdf = Buffer.from(await new Response(stored.stream).arrayBuffer());
      if (createHash("sha256").update(pdf).digest("hex") !== data.pdf_sha256) return fail(res, 409, "Intégrité du PDF non confirmée.");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename=fiche-${data.id}.pdf`);
      res.setHeader("Content-Length", String(pdf.length));
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.status(200).end(pdf);
    }
    if (req.method === "GET") {
      if (!validId(req.query?.equipmentId)) return fail(res, 400, "Équipement invalide.");
      const { data, error } = await db.from("thermodynamic_documents")
        .select("id, intervention_id, equipment_id, kind, status, form_data, operator_signature, holder_signature, issued_at, created_at")
        .eq("company_id", professional.companyId).eq("equipment_id", req.query.equipmentId)
        .order("created_at", { ascending: false }).limit(100);
      if (error) return fail(res, 503, "Documents momentanément indisponibles.");
      return res.status(200).json({ ok: true, documents: data || [] });
    }

    let body;
    try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
    catch { return fail(res, 400, "JSON invalide."); }
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Buffer.byteLength(JSON.stringify(body)) > 50_000) return fail(res, 400, "Données invalides ou trop volumineuses.");
    if (!THERMODYNAMIC_KINDS.includes(body.kind) || !validId(body.interventionId)) return fail(res, 400, "Type ou intervention invalide.");
    const linked = await linkedIntervention(db, body.interventionId, professional);
    if (!linked) return fail(res, 409, "Une intervention clim/PAC confirmée est nécessaire.");
    const formData = normalizeThermodynamicData(body.kind, body.formData);
    const { data: existing, error: existingError } = await db.from("thermodynamic_documents")
      .select("id, status").eq("company_id", professional.companyId)
      .eq("intervention_id", body.interventionId).eq("kind", body.kind).maybeSingle();
    if (existingError) return fail(res, 503, "Vérification du brouillon indisponible.");
    if (existing?.status === "issued") return fail(res, 409, "Ce document est déjà émis et ne peut plus être modifié.");

    const issue = req.method === "PATCH" && body.action === "issue";
    if (req.method === "PATCH" && !issue) return fail(res, 400, "Action invalide.");
    if (issue && linked.intervention.technician_id !== professional.userId) {
      return fail(res, 403, "Seul le technicien de l'intervention peut signer et émettre cette fiche.");
    }
    let operatorSignature = null;
    let holderSignature = null;
    if (issue) {
      operatorSignature = normalizeDrawnSignature(body.operatorSignature);
      holderSignature = normalizeDrawnSignature(body.holderSignature);
      validateIssue(body.kind, formData, operatorSignature, holderSignature);
    }
    const documentId = existing?.id || randomUUID();
    const values = {
      id: documentId,
      company_id: professional.companyId, equipment_id: linked.equipment.id,
      intervention_id: linked.intervention.id, technician_id: linked.intervention.technician_id,
      kind: body.kind, form_data: formData,
      equipment_snapshot: linked.equipment,
      intervention_snapshot: linked.intervention,
      ...(issue ? { status: "issued", operator_signature: { ...operatorSignature, signedAt: new Date().toISOString(), signedByUserId: professional.userId },
        holder_signature: { ...holderSignature, signedAt: new Date().toISOString() }, issued_at: new Date().toISOString() } : {}),
    };
    if (issue) {
      const pdf = buildThermodynamicPdf(values);
      const stored = await put(`regulatory/${professional.companyId}/${linked.equipment.id}/${documentId}.pdf`, pdf, {
        access: "private", contentType: "application/pdf", addRandomSuffix: true,
      });
      archivedPathname = stored.pathname;
      values.pdf_pathname = stored.pathname;
      values.pdf_sha256 = createHash("sha256").update(pdf).digest("hex");
      values.pdf_size_bytes = pdf.length;
    }
    const query = existing ? db.from("thermodynamic_documents").update(values).eq("id", existing.id)
      .eq("company_id", professional.companyId).eq("status", "draft")
      : db.from("thermodynamic_documents").insert(values);
    const { data, error } = await query.select("id, intervention_id, equipment_id, kind, status, form_data, operator_signature, holder_signature, issued_at, created_at").single();
    if (error) {
      if (archivedPathname) await del(archivedPathname).catch(() => {});
      return fail(res, 503, "Enregistrement impossible. Vérifiez que la migration Preview est appliquée.");
    }
    return res.status(issue ? 200 : 201).json({ ok: true, document: data });
  } catch (error) {
    if (archivedPathname) await del(archivedPathname).catch(() => {});
    if (String(error?.message).startsWith("MISSING:")) return fail(res, 400, `Champs obligatoires : ${error.message.slice(8)}`);
    if (["SIGNATURE_INVALID", "SIGNATURES_REQUIRED"].includes(error?.message)) return fail(res, 400, "Les signatures du technicien et du client sont nécessaires.");
    if (error?.message === "QUANTITY_INVALID") return fail(res, 400, "Les quantités de fluide doivent être des nombres positifs.");
    if (error?.message === "QUANTITY_MISMATCH") return fail(res, 400, "Vérifiez les totaux : chargé = A+B+C et récupéré = D+E.");
    if (error?.message === "WASTE_DETAILS_REQUIRED") return fail(res, 400, "Renseignez les rubriques déchets et destination avant émission.");
    if (error?.message === "LEAK_DETAILS_REQUIRED") return fail(res, 400, "Précisez la localisation et la réparation des fuites.");
    if (error?.message === "OPERATION_DETAILS_REQUIRED") return fail(res, 400, "Précisez la nature de l'intervention « Autre ».");
    if (error?.message === "CO2_EQUIVALENT_REQUIRED") return fail(res, 400, "Renseignez les tonnes équivalent CO2 pour les fluides HFC/PFC.");
    if (error?.message === "SIRET_INVALID") return fail(res, 400, "Le SIRET de l'opérateur doit contenir 14 chiffres.");
    if (["TYPE_OR_DATA_INVALID", "FIELD_INVALID"].includes(error?.message)) return fail(res, 400, "Un champ du formulaire est invalide.");
    console.error("Erreur documentaire clim/PAC", error?.message);
    return fail(res, 503, "Service documentaire momentanément indisponible.");
  }
}
