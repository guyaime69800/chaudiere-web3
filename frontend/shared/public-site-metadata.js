export const PUBLIC_ORIGIN = "https://www.carnetpass.fr";
export const publicMetadata = {
  "/": { title: "CarnetPass — Carnet d’entretien numérique chaudière, PAC et climatisation", description: "Centralisez l’historique d’entretien et les documents de vos chaudières, PAC, climatisations et VMC avec CarnetPass et son assistant documentaire Shiba Bot." },
  "/faq": { title: "Questions fréquentes — CarnetPass", description: "Comprendre le carnet d’entretien CarnetPass, ses documents techniques, le QR code et l’assistant Shiba Bot." },
  "/mentions-legales": { title: "Mentions légales — CarnetPass", description: "Informations sur l’éditeur et l’hébergement de CarnetPass, et préparation de l’ouverture commerciale." },
  "/confidentialite": { title: "Confidentialité — CarnetPass", description: "Traitement des données dans CarnetPass, droits des personnes et contacts pour les demandes de confidentialité." },
  "/cookies": { title: "Cookies et stockage local — CarnetPass", description: "Informations sur les cookies et le stockage local utilisés par CarnetPass." },
  "/conditions-utilisation": { title: "Conditions d’utilisation — CarnetPass", description: "Conditions d’accès et d’utilisation de CarnetPass et de ses services documentaires." },
  "/conditions-commerciales": { title: "Conditions générales de vente B2B — CarnetPass", description: "Conditions commerciales CarnetPass pour les entreprises : abonnement, comptes supplémentaires et services associés." },
};
export function isPublicPresentation(pathname) {
  return Object.hasOwn(publicMetadata, pathname);
}
