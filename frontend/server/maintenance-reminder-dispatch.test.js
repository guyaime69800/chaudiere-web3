import assert from "node:assert/strict";
import test from "node:test";
import {
  previewTestIdempotencyKey,
  previewReminderTestAllowed,
  productionReminderCronAllowed,
} from "./maintenance-reminder-dispatch.js";

test("chaque clic de test Preview a une clé d’envoi distincte", () => {
  const reminderId = "00000000-0000-4000-8000-000000000001";
  const first = previewTestIdempotencyKey(reminderId);
  const second = previewTestIdempotencyKey(reminderId);
  assert.match(first, /^preview-maintenance-test-00000000-0000-4000-8000-000000000001-/);
  assert.notEqual(first, second);
});

test("l’e-mail de test est fermé hors de la Preview isolée", () => {
  const valid = {
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feature/documentation-multi-docs",
    VITE_SUPABASE_URL: "https://bqqzzbwqmiyxcotvqtoc.supabase.co",
  };
  assert.equal(previewReminderTestAllowed(valid), true);
  assert.equal(previewReminderTestAllowed({ ...valid, VERCEL_ENV: "production" }), false);
  assert.equal(previewReminderTestAllowed({ ...valid, VERCEL_GIT_COMMIT_REF: "main" }), false);
  assert.equal(previewReminderTestAllowed({ ...valid, VITE_SUPABASE_URL: "https://other.supabase.co" }), false);
});

test("la tâche réelle exige l’activation explicite et le secret", () => {
  const valid = {
    VERCEL_ENV: "production",
    REMINDERS_PRODUCTION_ENABLED: "true",
    CRON_SECRET: "test-secret",
  };
  assert.equal(productionReminderCronAllowed(valid, "Bearer test-secret"), true);
  assert.equal(productionReminderCronAllowed({ ...valid, REMINDERS_PRODUCTION_ENABLED: "false" }, "Bearer test-secret"), false);
  assert.equal(productionReminderCronAllowed({ ...valid, VERCEL_ENV: "preview" }, "Bearer test-secret"), false);
  assert.equal(productionReminderCronAllowed(valid, "Bearer wrong"), false);
});
