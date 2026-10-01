const words = new Map([
  ["un", 1], ["une", 1], ["deux", 2], ["trois", 3], ["quatre", 4],
  ["cinq", 5], ["six", 6], ["sept", 7], ["huit", 8], ["neuf", 9],
  ["dix", 10], ["onze", 11], ["douze", 12],
]);

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isoDay(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function addCalendarMonths(iso, months) {
  const [year, month, day] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 12, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  return isoDay(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(day, lastDay));
}

export function parseReminderDate(text, todayIso) {
  const input = normalize(text);
  if (!/rappel|rappelle|entretien|prevenir|previens/.test(input)) return null;
  const explicit = input.match(/\ble\s+(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
  if (explicit) return isoDay(Number(explicit[3]), Number(explicit[2]), Number(explicit[1]));
  const relative = input.match(/\bdans\s+(\d{1,3}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)\s+(mois|jours?)\b/);
  if (!relative) return null;
  const amount = words.get(relative[1]) ?? Number(relative[1]);
  if (!Number.isInteger(amount) || amount < 1 || amount > 120) return null;
  if (relative[2] === "mois") return addCalendarMonths(todayIso, amount);
  const [year, month, day] = todayIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return date.toISOString().slice(0, 10);
}
