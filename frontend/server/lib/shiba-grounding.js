export const UNVERIFIED_ANSWER = "Je ne peux pas confirmer cette réponse à partir des passages documentaires disponibles. Vérifiez le modèle exact et consultez directement sa notice constructeur avant toute intervention.";

export function checkDocumentGrounding({ passages, answer, codeVariants = [] }) {
  if (!Array.isArray(passages) || passages.length === 0 || !passages.some((item) => String(item?.text || "").trim())) return "NO_PASSAGES";
  const evidence = passages.map((item) => String(item?.text || "")).join("\n").toUpperCase();
  if (codeVariants.length) {
    const requested = new Set(codeVariants.map((variant) => Number(String(variant).match(/\d{1,3}/)?.[0])).filter(Number.isInteger));
    const found = [...evidence.matchAll(/\bF\s*\.?\s*0*(\d{1,3})(?!\d)/g)].some((match) => requested.has(Number(match[1])));
    if (!found) return "CODE_NOT_IN_PASSAGES";
  }
  if (!String(answer || "").trim()) return "EMPTY_ANSWER";
  const knownPages = new Set(passages.map((item) => Number(item?.page)).filter((page) => Number.isInteger(page) && page > 0));
  const claimedPages = [...String(answer).matchAll(/\b(?:page|p\.)\s*(\d{1,4})\b/gi)].map((match) => Number(match[1]));
  if (claimedPages.some((page) => !knownPages.has(page))) return "UNSUPPORTED_PAGE";
  return null;
}
