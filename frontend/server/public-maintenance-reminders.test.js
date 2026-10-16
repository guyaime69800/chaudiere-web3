import assert from "node:assert/strict";
import test from "node:test";
import { publicReminderEnabled } from "./public-maintenance-reminders.js";

test("l’opt-in public n’est ouvert qu’en Preview isolée ou sur activation explicite", () => {
  const preview = {
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feature/documentation-multi-docs",
    VITE_SUPABASE_URL: "https://bqqzzbwqmiyxcotvqtoc.supabase.co",
  };
  assert.equal(publicReminderEnabled(preview), true);
  assert.equal(publicReminderEnabled({ ...preview, VERCEL_GIT_COMMIT_REF: "main" }), false);
  assert.equal(publicReminderEnabled({ ...preview, VITE_SUPABASE_URL: "https://other.supabase.co" }), false);
  assert.equal(publicReminderEnabled({ ...preview, VERCEL_ENV: "production" }), false);
  assert.equal(publicReminderEnabled({ VERCEL_ENV: "production", PUBLIC_REMINDERS_ENABLED: "true" }), true);
});
