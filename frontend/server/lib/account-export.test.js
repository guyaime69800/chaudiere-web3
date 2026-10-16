import test from "node:test";
import assert from "node:assert/strict";
import { buildCompanyExport } from "./account-export.js";
const user = { id: "user", email: "user@example.invalid" };
const membership = [{ company_id: "owned", role: "admin" }];
function database({ foreign = false, failPage = false } = {}) {
  return { from(table) {
    const query = { select(columns) {
      if (table === "equipment_private_attachments") assert.ok(!columns.includes("blob_"));
      return this;
    }, eq(column, value) {
      assert.equal(value, table === "profiles" ? user.id : "owned");
      return this;
    }, order(column) { assert.ok(["id","user_id"].includes(column)); return this; },
    single: async () => ({ data: { id: "owned" } }),
    maybeSingle: async () => ({ data: { id: user.id } }),
    range: async (start, end) => {
      if (failPage && table === "equipments" && start > 0) return { error: { message: "Unavailable" } };
      const length = table === "equipments" ? 751 : 1;
      return { data: Array.from({ length: Math.max(0, Math.min(length - start, end - start + 1)) },
        (_, n) => ({ id: String(start + n), company_id: foreign ? "foreign" : "owned", maintenance_reminders:{company_id:foreign?"foreign":"owned"},public_maintenance_reminders:{company_id:foreign?"foreign":"owned"} })) };
    } };
    return query;
  } };
}
test("export paginates all company rows and omits private storage locations", async () => {
  const result = await buildCompanyExport(database(), user, membership);
  assert.equal(result.records.equipments.length, 751);
  assert.equal(result.account.email, user.email);
  assert.equal(result.records.interventions.length, 1);
});
test("export rejects non-responsible roles, ambiguous companies and cross-company results", async () => {
  for (const memberships of [[], [...membership, ...membership], [{ company_id: "owned", role: "technician" }]]) {
    await assert.rejects(buildCompanyExport(database(), user, memberships), { status: 403 });
  }
  await assert.rejects(buildCompanyExport(database({ foreign: true }), user, membership), /partielle/);
});
test("a failed later export page never returns a partial archive", async () => {
  await assert.rejects(buildCompanyExport(database({ failPage: true }), user, membership), /partielle/);
});
