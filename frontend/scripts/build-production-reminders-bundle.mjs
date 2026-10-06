import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = path.join(frontend, "supabase-production", "migrations");
const steps = [
  "maintenance_reminders",
  "maintenance_dispatch",
  "public_reminder_opt_in",
  "public_reminder_dispatch",
  "maintenance_reminder_audit",
  "maintenance_after_validation",
  "reminder_description",
];

const sections = [];
for (const [index, step] of steps.entries()) {
  const name = `20261006000${index + 1}00_${step}.sql`;
  const content = await readFile(path.join(migrations, name), "utf8");
  if (!/^begin;\s*/i.test(content) || !/\scommit;\s*$/i.test(content)) {
    throw new Error(`Migration must be transaction-wrapped: ${name}`);
  }
  const statements = content.replace(/^begin;\s*/i, "").replace(/\scommit;\s*$/i, "");
  sections.push(`-- ${name}\n${statements.trim()}`);
}

const bundle = [
  "-- CarnetPass Paris 2 production reminders: apply once in the Supabase SQL Editor.",
  "-- All seven steps run in one transaction. Do not re-run after success.",
  "begin;",
  ...sections,
  "commit;",
].join("\n\n") + "\n";

await writeFile(path.join(frontend, "supabase-production", "maintenance-reminders-rollout.sql"), bundle);
console.log("Prepared atomic production reminder rollout SQL.");
