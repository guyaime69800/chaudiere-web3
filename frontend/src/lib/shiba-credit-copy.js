export function shibaCreditsExhaustedMessage(period) {
  if (period === "month") {
    return "Vos crédits Shiba Bot sont épuisés. Rechargez vos crédits ou attendez leur prochaine réinitialisation.";
  }
  return "Vos crédits Shiba Bot sont épuisés. La formule Découverte ne prévoit pas de réinitialisation.";
}

export function formatShibaResetDate(resetAt) {
  if (!resetAt) return null;
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris",
  }).format(date);
}
