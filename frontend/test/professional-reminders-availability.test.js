import assert from "node:assert/strict";
import test from "node:test";
import { professionalRemindersAvailable } from "../src/lib/professional-reminders-availability.js";

test("professional reminders stay available in the isolated Preview", () => {
  assert.equal(professionalRemindersAvailable({
    VITE_REMINDER_PREVIEW_TEST_ENABLED: "true",
    VITE_SUPABASE_URL: "https://bqqzzbwqmiyxcotvqtoc.supabase.co",
  }), true);
});

test("professional reminders stay hidden from Paris 2 even if the Preview flag is copied", () => {
  assert.equal(professionalRemindersAvailable({
    VITE_REMINDER_PREVIEW_TEST_ENABLED: "true",
    VITE_SUPABASE_URL: "https://tsyukqcyfxcrjrhopvpv.supabase.co",
  }), false);
});

test("professional reminders can be enabled on the production project after migration", () => {
  assert.equal(professionalRemindersAvailable({
    VITE_REMINDERS_PRODUCTION_ENABLED: "true",
    VITE_SUPABASE_URL: "https://tsyukqcyfxcrjrhopvpv.supabase.co",
    PROD: true,
  }), true);
});

test("the production flag does not enable reminders in another project or a dev build", () => {
  assert.equal(professionalRemindersAvailable({
    VITE_REMINDERS_PRODUCTION_ENABLED: "true",
    VITE_SUPABASE_URL: "https://bqqzzbwqmiyxcotvqtoc.supabase.co",
    PROD: true,
  }), false);
  assert.equal(professionalRemindersAvailable({
    VITE_REMINDERS_PRODUCTION_ENABLED: "true",
    VITE_SUPABASE_URL: "https://tsyukqcyfxcrjrhopvpv.supabase.co",
    PROD: false,
  }), false);
});

test("professional reminders stay hidden without the Preview flag", () => {
  assert.equal(professionalRemindersAvailable({
    VITE_SUPABASE_URL: "https://bqqzzbwqmiyxcotvqtoc.supabase.co",
  }), false);
});
