import { jsPDF } from "jspdf";
import { fieldsForKind } from "./thermodynamic-document-schema.js";

const OFFICIAL_FORM = "https://entreprendre.service-public.gouv.fr/vosdroits/R43122";

export function buildThermodynamicPdf(record) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const margin = 16;
  const width = 178;
  let y = 19;
  const kind = record.kind;

  function ensure(space = 12) {
    if (y + space > 277) {
      pdf.addPage();
      y = 20;
    }
  }
  function row(label, value) {
    ensure(18);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
    pdf.text(String(label), margin, y);
    y += 5;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
    const lines = pdf.splitTextToSize(String(value || "Non renseigné"), width);
    for (const line of lines) { ensure(6); pdf.text(line, margin, y); y += 5; }
    y += 3;
  }
  function signature(label, value) {
    ensure(42);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
    pdf.text(label, margin, y); y += 6;
    pdf.setFont("helvetica", "normal"); pdf.text(value.name, margin, y); y += 3;
    if (value.signedAt) { pdf.setFontSize(8); pdf.text(`Signé le ${new Date(value.signedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}`, margin + 83, y - 3); pdf.setFontSize(10); }
    const top = y;
    pdf.setDrawColor(55, 55, 55); pdf.setLineWidth(0.35);
    for (const stroke of value.strokes) {
      for (let i = 1; i < stroke.length; i += 1) {
        pdf.line(margin + stroke[i - 1][0] * 0.065, top + stroke[i - 1][1] * 0.023,
          margin + stroke[i][0] * 0.065, top + stroke[i][1] * 0.023);
      }
    }
    y += 28;
  }

  pdf.setFont("helvetica", "bold"); pdf.setFontSize(17);
  pdf.text(kind === "fluids_15497_04" ? "Fiche d'intervention - fluides frigorigènes" : "Fiche d'entretien climatisation / PAC", margin, y);
  y += 8;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
  pdf.text(kind === "fluids_15497_04"
    ? "Saisie numérique structurée selon les rubriques du CERFA 15497*04 - à vérifier avant transmission."
    : "Compte rendu de maintenance CarnetPass - ne remplace pas la fiche fluides si le circuit est manipulé.", margin, y);
  y += 9;
  row("Document", record.id);
  row("Émis le", new Date(record.issued_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }));
  row("Équipement", `${record.equipment_snapshot.brand || ""} ${record.equipment_snapshot.model || ""} - ${record.equipment_snapshot.product_reference || ""}`);
  row("N° de série", record.equipment_snapshot.serial_number || "Non lisible / non renseigné");
  row("Intervention CarnetPass", `${record.intervention_id} - ${record.intervention_snapshot.intervention_at || ""}`);
  for (const [key, label] of fieldsForKind(kind)) row(label, record.form_data[key]);
  signature("Signature de l'opérateur / technicien", record.operator_signature);
  signature("Signature du détenteur / client", record.holder_signature);
  if (kind === "fluids_15497_04") {
    ensure(18);
    pdf.setFontSize(8);
    pdf.text("Référence du formulaire officiel CERFA 15497*04 :", margin, y); y += 4;
    pdf.setTextColor(0, 80, 160); pdf.textWithLink(OFFICIAL_FORM, margin, y, { url: OFFICIAL_FORM });
    pdf.setTextColor(0, 0, 0); y += 6;
    pdf.text("Cette fiche numérique n'est pas le PDF XFA officiel et ne remplace pas le BSFF Trackdéchets.", margin, y);
  }
  return Buffer.from(pdf.output("arraybuffer"));
}
