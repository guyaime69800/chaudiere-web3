import assert from "node:assert/strict";
import test from "node:test";
import { suggestedReminderDescription, suggestedReminderType } from "./reminder-description.js";

test("Shiba proposes the task without imposing a maintenance category", () => {
  assert.equal(suggestedReminderDescription("rappel dépannage le 6/10/2026"), "dépannage");
  assert.equal(suggestedReminderDescription("Rappelle-moi l’entretien dans onze mois"), "entretien");
  assert.equal(suggestedReminderDescription("rappel le 15/12/2026"), "");
  assert.equal(suggestedReminderDescription("rappel installation le 10/11/2026"), "installation");
  assert.equal(suggestedReminderDescription("rappel démontage dans 3 mois"), "démontage");
});

test("Shiba only classifies an unambiguous reminder; the user can still correct it", () => {
  assert.equal(suggestedReminderType("rappel dépannage le 6/10/2026"), "repair");
  assert.equal(suggestedReminderType("rappel installation dans trois mois"), "installation");
  assert.equal(suggestedReminderType("rappel démontage le 15/12/2026"), "removal");
  assert.equal(suggestedReminderType("rappel entretien dans onze mois"), "maintenance");
  assert.equal(suggestedReminderType("rappel le 15/12/2026"), "other");
  assert.equal(suggestedReminderType("rappel entretien et dépannage le 15/12/2026"), "other");
});
