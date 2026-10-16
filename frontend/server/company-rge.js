import { validDate } from "../shared/aid-engine.js";
import {
  devisCompany,
  rateRequest,
  readDevisBody,
  checked,
  sendDevisError,
  fail,
} from "./lib/devis-security.js";
export default async function (req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Allow", "GET, POST");
  try {
    if (!["GET", "POST"].includes(req.method))
      throw fail(405, "Méthode non autorisée.");
    const { db, user, company } = await devisCompany(req, {
      manager: req.method === "POST",
    });
    await rateRequest(req, "rge", user.id, 30);
    if (req.method === "GET") {
      const qualifications = await checked(
        db
          .from("company_rge_qualifications")
          .select("*")
          .eq("company_id", company.id)
          .order("created_at", { ascending: false })
          .limit(30),
      );
      return res
        .status(200)
        .json({ ok: true, qualifications, siret: company.siret });
    }
    const b = await readDevisBody(req);
    const text = (v) =>
      typeof v === "string" && v.trim().length > 0 && v.length <= 160;
    if (
      !/^\d{14}$/.test(company.siret || "") ||
      !text(b.organism) ||
      !text(b.reference) ||
      !Array.isArray(b.domains) ||
      !b.domains.length ||
      b.domains.length > 10 ||
      b.domains.some(
        (d) =>
          ![
            "heat_pump_air_water",
            "heat_pump_ground",
            "insulation",
            "ventilation",
            "solar",
            "audit",
          ].includes(d),
      ) ||
      !validDate(b.validFrom) ||
      !validDate(b.validUntil) ||
      b.validUntil < b.validFrom
    )
      throw fail(
        400,
        "Complétez le SIRET officiel, la qualification, les domaines et dates.",
      );
    if (b.proofAttachmentId) {
      const proof = await checked(
        db
          .from("equipment_private_attachments")
          .select("id")
          .eq("id", b.proofAttachmentId)
          .eq("company_id", company.id)
          .is("deleted_at", null)
          .maybeSingle(),
      );
      if (!proof)
        throw fail(
          403,
          "Justificatif privé inaccessible pour cette entreprise.",
        );
    }
    await checked(
      db.from("company_rge_qualifications").insert({
        company_id: company.id,
        declared_by: user.id,
        siret: company.siret,
        organism: b.organism.trim(),
        qualification_reference: b.reference.trim(),
        domains: b.domains,
        valid_from: b.validFrom,
        valid_until: b.validUntil,
        proof_attachment_id: b.proofAttachmentId || null,
      }),
    );
    return res.status(200).json({
      ok: true,
      message:
        "Déclaration enregistrée. Le justificatif ne vaut pas vérification RGE.",
    });
  } catch (error) {
    return sendDevisError(res, error);
  }
}
