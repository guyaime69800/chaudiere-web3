const TYPE_LABELS = {
  maintenance: "Entretien",
  repair: "Dépannage",
  installation: "Installation",
  commissioning: "Mise en service",
  inspection: "Contrôle",
  other: "Autre",
};

const RESULT_LABELS = {
  resolved: "Résolu",
  partially_resolved: "Partiellement résolu",
  not_resolved: "Non résolu",
  not_applicable: "Sans objet",
};

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date non renseignée";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

function formatPart(part) {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";

  return [
    part.name,
    part.reference && `réf. ${part.reference}`,
    Number.isInteger(part.quantity) &&
      `quantité ${part.quantity}`,
  ]
    .filter(Boolean)
    .join(" - ");
}

export async function downloadInterventionPdf({
  intervention,
  equipment,
  company,
}) {
  if (!intervention) {
    throw new Error("L’intervention est introuvable.");
  }

  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const left = 18;
  const width = 174;
  let y = 32;

  function addHeader() {
    doc.setFillColor(201, 54, 8);
    doc.rect(0, 0, 210, 23, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("CarnetPass", left, 14.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      "Rapport d'intervention",
      192,
      14.5,
      { align: "right" }
    );
  }

  function ensureSpace(height = 8) {
    if (y + height <= 279) return;

    doc.addPage();
    addHeader();
    y = 32;
  }

  function addSection(title) {
    ensureSpace(14);

    doc.setFillColor(250, 242, 238);
    doc.roundedRect(
      left,
      y,
      width,
      9,
      1.5,
      1.5,
      "F"
    );

    doc.setTextColor(201, 54, 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(title, left + 4, y + 6);

    y += 11;
  }

  function addField(label, value) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return;
    }

    ensureSpace(10);

    doc.setTextColor(112, 93, 84);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(label.toUpperCase(), left, y);

    y += 4;

    doc.setTextColor(37, 28, 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const lines = doc.splitTextToSize(
      String(value),
      width
    );

    for (const line of lines) {
      ensureSpace(6);
      doc.text(line, left, y);
      y += 4;
    }

    y += 1.5;
  }

  addHeader();

  doc.setTextColor(37, 28, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(
    "Rapport d'intervention technique",
    left,
    y
  );

  y += 7;

  doc.setTextColor(22, 101, 52);
  doc.setFontSize(9.5);
  doc.text("Preuve Polygon confirmée", left, y);

  y += 8;

  addSection("Entreprise intervenante");
  addField(
    "Raison sociale",
    company?.name || "Non renseignée"
  );
  addField(
    "SIRET",
    company?.siret || "Non renseigné"
  );

  addSection("Équipement");
  addField(
    "CarnetPass",
    intervention.carnetPassId
  );
  addField("Marque", equipment?.brand);
  addField("Modèle", equipment?.model);
  addField(
    "Référence produit",
    equipment?.product_reference
  );
  addField(
    "Numéro de série",
    equipment?.serial_number
  );

  addSection("Intervention");
  addField(
    "Date",
    formatDate(intervention.interventionAt)
  );
  addField(
    "Type",
    TYPE_LABELS[intervention.interventionType] ||
      "Intervention"
  );
  addField(
    "Résultat",
    RESULT_LABELS[intervention.resultStatus] ||
      "Non renseigné"
  );
  addField(
    "Symptômes",
    intervention.symptoms
  );
  addField(
    "Code défaut",
    intervention.faultCode
  );
  addField(
    "Diagnostic",
    intervention.diagnosis
  );
  addField(
    "Travail effectué",
    intervention.workPerformed
  );

  const parts = Array.isArray(
    intervention.partsReplaced
  )
    ? intervention.partsReplaced
        .map(formatPart)
        .filter(Boolean)
    : [];

  addField(
    "Pièces remplacées",
    parts.join("\n")
  );

  const measurements =
    intervention.measurements &&
    typeof intervention.measurements === "object" &&
    !Array.isArray(intervention.measurements)
      ? Object.entries(intervention.measurements)
          .map(
            ([name, value]) =>
              `${name} : ${String(value)}`
          )
          .join("\n")
      : "";

  addField(
    "Mesures relevées",
    measurements
  );

  addSection("Traçabilité Polygon");
  addField(
    "Identifiant de l'intervention",
    intervention.id
  );
  addField(
    "Réseau",
    "Polygon PoS - Chain ID 137"
  );
  addField(
    "Transaction",
    intervention.polygonTransactionHash
  );
  addField(
    "Bloc",
    intervention.polygonBlockNumber
  );
  addField(
    "Confirmation",
    intervention.polygonConfirmedAt
      ? formatDate(
          intervention.polygonConfirmedAt
        )
      : ""
  );

  ensureSpace(28);

  doc.setFillColor(255, 249, 229);
  doc.setDrawColor(229, 163, 0);
  doc.roundedRect(
    left,
    y,
    width,
    24,
    2,
    2,
    "FD"
  );

  doc.setTextColor(120, 76, 0);
  doc.setFontSize(8.5);

  const legalNotice = doc.splitTextToSize(
    "Ce rapport CarnetPass ne remplace pas une attestation réglementaire ou un formulaire CERFA lorsqu'un tel document est obligatoire. Polygon conserve l'empreinte cryptographique de l'intervention, pas son contenu lisible.",
    width - 8
  );

  doc.text(
    legalNotice,
    left + 4,
    y + 6
  );

  const pageCount = doc.getNumberOfPages();

  for (
    let page = 1;
    page <= pageCount;
    page += 1
  ) {
    doc.setPage(page);

    doc.setDrawColor(224, 213, 207);
    doc.line(left, 284, 192, 284);

    doc.setTextColor(112, 93, 84);
    doc.setFontSize(7.5);

    doc.text(
      `Généré par CarnetPass le ${formatDate(
        new Date()
      )}`,
      left,
      290
    );

    doc.text(
      `Page ${page}/${pageCount}`,
      192,
      290,
      { align: "right" }
    );
  }

  const safeCarnet = String(
    intervention.carnetPassId ||
      equipment?.serial_number ||
      "intervention"
  ).replace(/[^a-zA-Z0-9_-]+/g, "-");

  const date =
    String(
      intervention.interventionAt || ""
    ).slice(0, 10) || "date";

  doc.save(
    `CarnetPass-intervention-${safeCarnet}-${date}.pdf`
  );
}