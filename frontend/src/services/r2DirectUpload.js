const endpoint = "https://521d9298e733d9b187f6eb2acb2e17de.eu.r2.cloudflarestorage.com";
export async function uploadDirectR2(file, metadata, token, onProgress = () => {}, fetcher = fetch) {
  const bytes = await file.arrayBuffer();
  if (file.size < 5 || file.size > 30 * 1024 * 1024
    || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("Choisissez un PDF valide de 30 Mo maximum.");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const api = async body => {
    const response = await fetcher("/api/platform-admin-documents", { method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "Envoi R2 indisponible.");
    return result;
  };
  onProgress("Préparation de l’envoi direct R2…");
  const upload = await api({ ...metadata, filename: file.name, size: file.size, sha256, action: "r2-init" });
  const url = new URL(upload.url);
  if (url.origin !== endpoint || url.pathname !== `/carnetpass-documents-production/platform-documents/incoming/${upload.uploadId}.pdf`
    || !/^[a-f0-9-]{36}$/.test(upload.uploadId || "")) throw new Error("Destination d’envoi invalide.");
  onProgress("Envoi du PDF directement dans R2…");
  let stored;
  try {
    stored = await fetcher(url.href, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: file,
      credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(180_000) });
  } catch {
    throw new Error("Envoi R2 interrompu. Vérifiez la connexion et la politique CORS du compartiment. Aucun envoi vers Blob n’a été effectué.");
  }
  if (!stored.ok) throw new Error("R2 a refusé l’envoi. Vérifiez la clé d’écriture et la politique CORS.");
  onProgress("Vérification du PDF dans R2 et enregistrement…");
  const result = await api({ action: "r2-complete", uploadId: upload.uploadId });
  if (result.provider !== "r2" || result.verified !== true) throw new Error("Vérification R2 non confirmée.");
  return result;
}
