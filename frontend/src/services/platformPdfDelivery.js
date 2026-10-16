function apiUrl(endpoint, delivery) {
  const url = new URL(endpoint, window.location.origin);
  if (url.origin !== window.location.origin || !["/api/platform-admin-documents", "/api/platform-catalog-documents"].includes(url.pathname)) {
    throw new Error("Adresse documentaire invalide.");
  }
  url.searchParams.set("delivery", delivery);
  return url.pathname + url.search;
}

async function pdfResponse(response) {
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(details?.error || "PDF indisponible.");
  }
  if (!response.headers.get("content-type")?.includes("application/pdf")) throw new Error("Réponse PDF invalide.");
  const blob = await response.blob();
  if (!blob.size || blob.size > 30 * 1024 * 1024) throw new Error("Taille du PDF invalide.");
  return blob;
}

export async function loadPlatformPdf(endpoint, token, fetcher = fetch) {
  const opening = new URL(endpoint, window.location.origin);
  opening.searchParams.set("consultation", crypto.randomUUID());
  endpoint = opening.pathname + opening.search;
  const api = (delivery) => fetcher(apiUrl(endpoint, delivery), {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(45_000),
  });
  const response = await api("url");
  // Do not turn a refused account, publication or quota check into another request.
  if (!response.ok || response.headers.get("content-type")?.includes("application/pdf")) return pdfResponse(response);
  const delivery = await response.json();
  try {
    const url = new URL(delivery.url);
    if (delivery.provider !== "r2" || !/^[a-f0-9]{64}$/.test(delivery.sha256 || "")
      || url.origin !== "https://521d9298e733d9b187f6eb2acb2e17de.eu.r2.cloudflarestorage.com"
      || url.pathname !== `/carnetpass-documents-production/platform-documents/sha256/${delivery.sha256}.pdf`) {
      throw new Error("Destination PDF invalide.");
    }
    const blob = await pdfResponse(await fetcher(url.href, {
      credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(45_000),
    }));
    if (blob.size !== delivery.sizeBytes) throw new Error("Copie PDF différente.");
    const bytes = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    if (sha256 !== delivery.sha256) throw new Error("Copie PDF différente.");
    return blob;
  } catch {
    // One authenticated fallback, with all server controls run again. No retries.
    return pdfResponse(await api("blob"));
  }
}
