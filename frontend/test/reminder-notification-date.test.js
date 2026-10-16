import test from "node:test";
import assert from "node:assert/strict";
import { reminderNotificationDate } from "../src/lib/reminder-notification-date.js";

test("un préavis de 30 jours donne la date d'envoi attendue", () => {
  assert.equal(reminderNotificationDate("2026-12-24", 30), "2026-11-24");
});

test("le calcul traverse le changement d'heure sans décaler le jour", () => {
  assert.equal(reminderNotificationDate("2026-11-02", 10), "2026-10-23");
});
