const MAX_PHOTOS = 8;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function loadPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Photo illisible.");
    return image;
  } finally {
    // L'image décodée reste disponible après la libération de l'URL temporaire.
    URL.revokeObjectURL(url);
  }
}

export async function photosToPdf(files, filename = "document-chantier.pdf") {
  const photos = Array.from(files || []);
  if (!photos.length || photos.length > MAX_PHOTOS) {
    throw new Error(`Choisis entre 1 et ${MAX_PHOTOS} photos pour créer un PDF.`);
  }
  if (photos.some((file) => !IMAGE_TYPES.has(file.type) || file.size < 1 || file.size > MAX_SOURCE_BYTES)) {
    throw new Error("Chaque photo doit être un JPEG, PNG ou WebP de 20 Mo maximum.");
  }

  const { jsPDF } = await import("jspdf");
  let pdf;
  for (const [index, file] of photos.entries()) {
    let image;
    try {
      image = await loadPhoto(file);
    } catch {
      throw new Error(`La photo ${index + 1} ne peut pas être lue. Choisis un JPEG, PNG ou WebP.`);
    }
    const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("La création du PDF n’est pas disponible sur cet appareil.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.78);
    const orientation = canvas.width > canvas.height ? "landscape" : "portrait";
    if (!pdf) pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
    else pdf.addPage("a4", orientation);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const ratio = Math.min((pageWidth - 16) / canvas.width, (pageHeight - 16) / canvas.height);
    const width = canvas.width * ratio;
    const height = canvas.height * ratio;
    pdf.addImage(data, "JPEG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
    canvas.width = 0;
    canvas.height = 0;
  }

  const content = pdf.output("arraybuffer");
  if (content.byteLength > MAX_PDF_BYTES) {
    throw new Error("Le PDF dépasse 10 Mo. Utilise moins de photos ou des photos plus légères.");
  }
  return new File([content], filename, { type: "application/pdf" });
}
