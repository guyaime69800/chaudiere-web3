export function documentTypeFromTitle(title) {
  const value = String(title || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/vue[\s_-]*eclat|pieces?[\s_-]+detach|spare[\s_-]+parts|exploded/.test(value)) return "exploded_view";
  if (/utilisation|utilisateur|user[\s_-]+manual|operating/.test(value)) return "user_manual";
  if (/installation|montage|install[\s_-]+manual/.test(value)) return "installation_manual";
  return "technical_manual";
}

export const documentGroups = [
  ["installation_manual", "Notice d’installation"],
  ["user_manual", "Notice d’utilisation"],
  ["exploded_view", "Vue éclatée de cette référence"],
  ["technical_manual", "Autres documents techniques"],
];

export function groupDocuments(documents) {
  return documentGroups.map(([type, label]) => ({ type, label,
    documents: documents.filter((document) => (document.documentType || documentTypeFromTitle(document.title)) === type),
  }));
}
