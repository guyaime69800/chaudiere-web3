import fs from "fs";
import path from "path";

const inputPath = path.resolve(
  "frontend/src/data/equipment/saunier-duval-0010017388.json"
);

const equipmentData = JSON.parse(
  fs.readFileSync(inputPath, "utf8")
);

const codes = equipmentData.errorCodeIndex?.codes ?? [];
const meanings = equipmentData.errorCodeIndex?.meanings ?? {};
const indexSource = equipmentData.errorCodeIndex?.source ?? {};

console.log("Codes défaut trouvés :", codes.length);

const chunks = codes.map((code) => {
  const detailedError = equipmentData.errorCodes?.find(
    (error) => error.code === code
  );

  const title = detailedError?.title ?? "";

  const meaning =
    detailedError?.manufacturerData?.meaning ??
    meanings[code] ??
    "Signification non documentée";

  const possibleCauses =
    detailedError?.manufacturerData?.possibleCauses ?? [];

  const professionalChecks =
    detailedError?.manufacturerData?.professionalChecks ?? [];

  const documentId =
    detailedError?.source?.documentId ??
    indexSource.documentId ??
    "sd-themaplus-condens-installation-maintenance-0020238207-08";

  const page =
    detailedError?.source?.page ??
    indexSource.pages?.[0] ??
    null;

  const section =
    detailedError?.source?.section ??
    indexSource.section ??
    "Codes de défaut";

  let text = `${code}`;

  if (title) {
    text += ` ${title}.`;
  }

  text += ` Signification : ${meaning}.`;

  if (possibleCauses.length > 0) {
    text += ` Causes possibles : ${possibleCauses.join(", ")}.`;
  }

  if (professionalChecks.length > 0) {
    text += ` Contrôles professionnels : ${professionalChecks.join(", ")}.`;
  }

  return {
    chunkId: `sd-0020238207-08-${code
      .toLowerCase()
      .replace(".", "")}`,
    documentId,
    page,
    section,
    topic: code,
    text,
  };
});

console.log(
  "Chunks générés en mémoire :",
  chunks.length
);

console.log(
  "Exemple F.00 :",
  chunks.find((chunk) => chunk.topic === "F.00")
);

console.log(
  "Exemple F.32 :",
  chunks.find((chunk) => chunk.topic === "F.32")
);
console.log(
  "Exemple F.49 :",
  chunks.find((chunk) => chunk.topic === "F.49")
);
const outputPath = path.resolve(
  "frontend/src/data/rag/saunier-duval-0020238207-08.chunks.json"
);

fs.writeFileSync(
  outputPath,
  JSON.stringify(chunks, null, 2),
  "utf8"
);

console.log(
  "Fichier RAG généré :",
  outputPath
);

console.log(
  "Nombre de chunks écrits :",
  chunks.length
);