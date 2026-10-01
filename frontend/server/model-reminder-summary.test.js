import assert from "node:assert/strict";
import test from "node:test";
import { summarizeModelReminders } from "./model-reminder-summary.js";

test("model reminder summary includes verified individual and professional reminders without emails", () => {
  const equipments = [
    { id: "one", serial_number: "SER-1" },
    { id: "two", serial_number: null },
  ];
  const professional = [{ equipment_id: "one", recipient_email: "private@example.com", due_on: "2026-12-15", lead_days: 30, status: "active", notification_state: "pending" }];
  const individuals = [
    { equipment_id: "two", recipient_email: "customer@example.com", due_on: "2027-01-15", lead_days: 15, status: "active", notification_state: "pending" },
    { equipment_id: "other-company", recipient_email: "other@example.com", due_on: "2027-01-16", lead_days: 15, status: "active", notification_state: "pending" },
    { equipment_id: "two", recipient_email: "cancelled@example.com", due_on: "2027-01-17", lead_days: 15, status: "cancelled", notification_state: "cancelled" },
  ];

  const result = summarizeModelReminders(equipments, professional, individuals);
  assert.equal(result.equipmentCount, 2);
  assert.equal(result.reminderCount, 2);
  assert.deepEqual(result.reminders.map((reminder) => reminder.audience), ["professional", "individual"]);
  assert.equal(JSON.stringify(result).includes("@example.com"), false);
});
