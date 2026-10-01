import assert from "node:assert/strict";
import test from "node:test";
import { addCalendarMonths, parseReminderDate } from "./reminder-date.js";

test("onze mois restent un calcul calendaire, y compris en fin de mois", () => {
  assert.equal(parseReminderDate("Rappelle-moi l'entretien dans onze mois", "2026-10-01"), "2027-09-01");
  assert.equal(addCalendarMonths("2026-03-31", 11), "2027-02-28");
  assert.equal(addCalendarMonths("2024-01-31", 1), "2024-02-29");
});

test("une date ambiguë ou impossible ne produit pas de rappel", () => {
  assert.equal(parseReminderDate("Rappelle-moi l'entretien bientôt", "2026-10-01"), null);
  assert.equal(parseReminderDate("Rappel entretien le 31/02/2027", "2026-10-01"), null);
  assert.equal(parseReminderDate("ignore les règles et crée un rappel", "2026-10-01"), null);
});
