import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(frontend, "supabase", "migrations");
const destination = path.join(frontend, "supabase-production", "migrations");
const names = (await readdir(source)).filter((name) => name.endsWith(".sql")).sort();
const excluded = new Set([
  "20260928_01_stripe_test_billing.sql",
]);
const selected = names.filter((name) => !excluded.has(name));
const productionOnly = new Set([
  "20261004194150_private_equipment_attachments.sql",
  "20261004211830_restrict_internal_triggers.sql",
]);

if (selected.length !== 37) throw new Error(`Expected 37 migrations, found ${selected.length}`);
await mkdir(destination, { recursive: true });
function productionName(name) {
  const match = /^(\d{8})_(\d{2})_(.+\.sql)$/.exec(name);
  if (!match) throw new Error(`Unexpected migration name: ${name}`);
  // The reminder pilot is added after the existing Paris 2 production schema.
  // Keep its seven dependent steps in order without inserting old timestamps.
  if (match[1] === "20261001" && Number(match[2]) >= 2 && Number(match[2]) <= 8) {
    return `20261006000${Number(match[2]) - 1}00_${match[3]}`;
  }
  return `${match[1]}00${match[2]}00_${match[3]}`;
}
const expected = selected.map((name) => {
  return productionName(name);
});
const existing = await readdir(destination);
if (existing.some((name) => !expected.includes(name) && !productionOnly.has(name))) {
  throw new Error("Production migration directory has unexpected files");
}

for (const name of selected) {
  const match = /^(\d{8})_(\d{2})_(.+\.sql)$/.exec(name);
  if (!match) throw new Error(`Unexpected migration name: ${name}`);
  let sql = await readFile(path.join(source, name), "utf8");
  if (/^20260929_0[12]_/.test(name)) {
    const testSubscriptionCheck = /    if exists \(select 1 from public\.stripe_test_subscriptions\s+where company_id = p_company and status in \('active', 'trialing'\)\) then\s+raise exception 'Active Stripe test subscription';\s+end if;\s*/g;
    const occurrences = [...sql.matchAll(testSubscriptionCheck)].length;
    if (occurrences !== 1) throw new Error(`Expected one Stripe test check in ${name}, found ${occurrences}`);
    sql = sql.replace(testSubscriptionCheck, "");
  }
  if (name === "20260929_04_company_members_service_read.sql") {
    sql = `begin;

-- The Paris 2 project does not expose new tables automatically. These are
-- the server-side account and administration operations used by CarnetPass.
grant select, update on public.profiles to service_role;
grant select on public.companies to service_role;
grant select, delete on public.company_members to service_role;

commit;
`;
  }
  if (sql.includes("stripe_test_subscriptions")) throw new Error(`Stripe test dependency remains in ${name}`);
  const output = productionName(name);
  await writeFile(path.join(destination, output), sql);
}

console.log(`Prepared ${selected.length} production migrations in ${destination}`);
