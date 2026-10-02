const relativeDate = /\bdans\s+(?:\d{1,3}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)\s+(?:jours?|mois)\b/gi;
const explicitDate = /\ble\s+\d{1,2}[./-]\d{1,2}[./-]\d{4}\b/gi;

export const REMINDER_TYPE_LABELS = {
  maintenance: "Entretien",
  repair: "Dépannage",
  removal: "Démontage",
  installation: "Installation",
  other: "Autre",
};

export function suggestedReminderType(request) {
  const text = String(request || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const matches = [
    ["repair", /\b(depan\w*|repar\w*|panne\w*)\b/],
    ["removal", /\b(demont\w*|depos\w*)\b/],
    ["installation", /\b(install\w*|pose\w*)\b/],
    ["maintenance", /\b(entretien\w*|maintenance|revision\w*)\b/],
  ].filter(([, pattern]) => pattern.test(text));
  return matches.length === 1 ? matches[0][0] : "other";
}

export function suggestedReminderDescription(request) {
  return String(request || "")
    .replace(explicitDate, " ")
    .replace(relativeDate, " ")
    .replace(/^\s*(?:rappelle[- ]moi|rappel|préviens[- ]moi|previens[- ]moi|prévenir|prevenir)\b[\s:,-]*/i, "")
    .replace(/^\s*(?:de\s+|d[’']|du\s+|des\s+|l[’']|la\s+|le\s+)/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:,-]+|[\s:,-]+$/g, "")
    .slice(0, 240);
}
