export function reminderNotificationDate(dueOn, leadDays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn || "") || !Number.isInteger(Number(leadDays))) return "";
  const date = new Date(`${dueOn}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dueOn) return "";
  date.setUTCDate(date.getUTCDate() - Number(leadDays));
  return date.toISOString().slice(0, 10);
}
