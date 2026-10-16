const visibleStatuses = new Set(["active", "review_required"]);

export function summarizeModelReminders(equipments, professionalReminders, publicReminders) {
  const equipmentById = new Map(equipments.map((equipment) => [equipment.id, equipment]));
  const toEntry = (reminder, audience) => {
    const equipment = equipmentById.get(reminder.equipment_id);
    if (!equipment || !visibleStatuses.has(reminder.status)) return null;
    return {
      id: reminder.id,
      equipmentId: equipment.id,
      serialNumber: equipment.serial_number || null,
      audience,
      description: audience === "professional" ? reminder.description || "Entretien" : "Entretien",
      reminderType: audience === "professional" ? reminder.reminder_type || "maintenance" : "maintenance",
      dueOn: reminder.due_on,
      leadDays: reminder.lead_days,
      status: reminder.status,
      notificationState: reminder.notification_state,
    };
  };

  const reminders = [
    ...professionalReminders.map((reminder) => toEntry(reminder, "professional")),
    ...publicReminders.map((reminder) => toEntry(reminder, "individual")),
  ].filter(Boolean).sort((left, right) => left.dueOn.localeCompare(right.dueOn));

  return { equipmentCount: equipments.length, reminderCount: reminders.length, reminders };
}
