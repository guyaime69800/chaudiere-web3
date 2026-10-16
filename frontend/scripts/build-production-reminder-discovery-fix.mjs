import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = path.join(frontend, "supabase-production", "migrations");
const sources = [
  ["20261006000100_maintenance_reminders.sql", ["create_maintenance_reminder", "update_maintenance_reminder"]],
  ["20261006000200_maintenance_dispatch.sql", ["claim_due_maintenance_reminders"]],
  ["20261006000400_public_reminder_dispatch.sql", ["claim_due_public_maintenance_reminders"]],
];
const functions = [];
const oldRule = "s.trial_ends_at > now()";
const newRule = "coalesce(s.trial_ends_at, (select c.created_at from public.companies c where c.id = s.company_id) + interval '5 days') > now()";

for (const [file, names] of sources) {
  const sql = await readFile(path.join(migrations, file), "utf8");
  for (const name of names) {
    const start = sql.indexOf(`create function public.${name}(`);
    if (start < 0) throw new Error(`Missing function ${name} in ${file}`);
    const end = sql.indexOf("\n$$;", start);
    if (end < 0) throw new Error(`Missing function terminator for ${name}`);
    const original = sql.slice(start, end + "\n$$;".length);
    const count = original.split(oldRule).length - 1;
    if (count !== 1) throw new Error(`Expected one discovery predicate in ${name}, found ${count}`);
    functions.push(original.replace("create function", "create or replace function").replace(oldRule, newRule));
  }
}

const output = [
  "begin;",
  "",
  "-- Keep reminder creation and dispatch aligned with the five-day Discovery trial.",
  "-- A missing trial_ends_at uses the company creation date, as the pro workspace does.",
  ...functions.flatMap((definition) => ["", definition]),
  "",
  "commit;",
  "",
].join("\n");
await writeFile(path.join(migrations, "20261006000800_reminder_discovery_eligibility.sql"), output);
console.log("Prepared Production Discovery eligibility fix for four reminder functions.");
