import test from "node:test";
import assert from "node:assert/strict";
import { initialAidDrafts } from "../server/lib/aid-drafts.js";
import {
  simulateAid,
  validateAidRule,
  projectInput,
  qualifiedRge,
  officialSource,
} from "../shared/aid-engine.js";
const today = "2026-10-07",
  siret = "12345678901234";
const project = {
  work: "heating",
  housing: "house",
  occupancy: "owner",
  postalCode: "69000",
  principalResidence: "yes",
  housingAge: 20,
  plannedEquipment: "heat_pump_air_water",
  technicalCriteria: "yes",
  householdSize: 2,
  taxIncome: 20000,
  taxYear: 2025,
  budget: 15000,
  eligibleCost: 12000,
  ceeAmount: 2000,
  otherGrants: 0,
  previousMpr: 0,
  workDate: "2026-11-04",
  rgeDeclaration: "yes",
};
const rule = () => structuredClone(initialAidDrafts[0]);
const version = (overrides = {}) => ({
  id: "aid-1",
  version: 1,
  status: "published",
  validated_by: "admin-1",
  validated_at: today + "T10:00:00Z",
  rule: rule(),
  ...overrides,
});
const rge = {
  siret,
  domains: ["heat_pump_air_water"],
  valid_from: "2026-01-01",
  valid_until: "2027-12-31",
  verified_at: today + "T08:00:00Z",
  verified_by: "admin-1",
  verification_source: "https://france-renov.gouv.fr/annuaire-rge/identifier",
};
const calc = (p = {}, v = version(), options = {}) =>
  simulateAid({ ...project, ...p }, [v], { today, siret, rge, ...options });
test("published, current rules calculate deterministically with a complete snapshot", () => {
  const result = calc();
  assert.equal(result.subtotal, 5000);
  assert.equal(result.remaining, 8000);
  assert.equal(result.aids[0].rge.status, "verified");
  assert.deepEqual(result.rules[0].rule, initialAidDrafts[0]);
  assert.deepEqual(calc(), result);
});
test("future, expired, suspended, draft, stale and unvalidated rules never calculate", () => {
  for (const change of [
    { status: "draft" },
    { status: "suspended" },
    { validated_by: null },
    { validated_at: "2025-01-01" },
    { rule: { ...rule(), effectiveFrom: "2026-12-01" } },
    { rule: { ...rule(), effectiveUntil: "2026-10-01" } },
    {
      rule: {
        ...rule(),
        sources: [{ ...rule().sources[0], consultedOn: "2025-01-01" }],
      },
    },
  ]) {
    const r = calc({}, version(change));
    assert.equal(r.subtotal, null);
    assert.equal(r.remaining, null);
    assert.equal(r.aids[0].amount, null);
  }
});
test("unknown and missing values are not zero; explicit zero is a valid declaration", () => {
  for (const name of [
    "ceeAmount",
    "otherGrants",
    "previousMpr",
    "budget",
    "eligibleCost",
    "taxIncome",
    "workDate",
  ]) {
    const r = calc({ [name]: "" });
    assert.equal(r.subtotal, null, name);
    assert.equal(r.remaining, null, name);
    assert.ok(r.aids[0].missing.includes(name));
  }
  assert.equal(calc({ ceeAmount: 0 }).subtotal, 5000);
});
test("ceilings apply to eligible costs, CEE cumulation, prior aid and all grants", () => {
  assert.equal(calc({ eligibleCost: 3000, ceeAmount: 2000 }).subtotal, 700);
  assert.equal(calc({ previousMpr: 19500 }).subtotal, 500);
  assert.equal(calc({ otherGrants: 11000, ceeAmount: 2000 }).subtotal, 0);
  assert.equal(calc({ eligibleCost: 18000 }).subtotal, null);
  assert.equal(calc({ taxIncome: 30000 }).subtotal, 4000);
  assert.equal(calc({ taxIncome: 40000 }).subtotal, 3000);
  assert.equal(calc({ taxIncome: 100000 }).subtotal, null);
});
test("regional and additional household thresholds use the published version", () => {
  assert.equal(calc({ postalCode: "75001", taxIncome: 30000 }).subtotal, 5000);
  assert.equal(calc({ householdSize: 6, taxIncome: 45000 }).subtotal, 5000);
  assert.equal(calc({ postalCode: "97100" }).subtotal, null);
  assert.equal(calc({ taxYear: 2024 }).subtotal, null);
  assert.equal(calc({ workDate: "2027-01-01" }).subtotal, null);
});
test("source freshness uses configured limits; a failed fetch does not erase a still current rule", () => {
  const state = {
    url: rule().sources[0].url,
    last_success_at: "2026-10-06T10:00:00Z",
    freshness_days: 2,
    status: "unavailable",
  };
  assert.equal(calc({}, version(), { sourceStates: [state] }).subtotal, 5000);
  assert.equal(
    calc({}, version(), {
      sourceStates: [{ ...state, last_success_at: "2026-10-01" }],
    }).subtotal,
    null,
  );
  assert.equal(calc({}, version(), { sourceStates: [] }).subtotal, null);
  assert.equal(
    calc({}, version(), { sourceStates: [{ ...state, status: "changed" }] })
      .subtotal,
    5000,
  );
});
test("RGE records require matching SIRET, domain, dates and a real recent manual verification", () => {
  const opts = {
    siret,
    domain: "heat_pump_air_water",
    date: "2026-11-04",
    today,
  };
  assert.equal(qualifiedRge(rge, opts).status, "verified");
  assert.equal(
    qualifiedRge({ ...rge, verified_by: null }, opts).status,
    "declared",
  );
  assert.equal(
    qualifiedRge({ ...rge, verified_at: "2025-10-07" }, opts).status,
    "declared",
  );
  assert.equal(
    qualifiedRge({ ...rge, valid_until: "2026-11-01" }, opts).status,
    "expired",
  );
  assert.equal(
    qualifiedRge({ ...rge, valid_from: "2026-12-01" }, opts).status,
    "unsuitable",
  );
  assert.equal(
    qualifiedRge({ ...rge, domains: ["solar"] }, opts).status,
    "unsuitable",
  );
  assert.equal(
    qualifiedRge(rge, { ...opts, siret: "99999999999999" }).status,
    "unsuitable",
  );
  assert.equal(
    calc({ rgeDeclaration: "unknown" }, version(), { rge: null }).subtotal,
    null,
  );
  assert.equal(calc({}, version(), { rge: null }).subtotal, 5000);
  assert.equal(
    calc({}, version(), { rge: { ...rge, valid_until: "2026-10-01" } })
      .subtotal,
    null,
  );
});
test("orientation and variable CEE never produce a universal amount or an invented zero", () => {
  const orientation = initialAidDrafts
    .slice(1)
    .map((r, i) => version({ id: `aid-${i + 2}`, rule: r }));
  const r = simulateAid(project, orientation, { today });
  assert.ok(r.aids.every((a) => a.amount === null));
  assert.equal(r.subtotal, null);
  assert.equal(r.remaining, null);
});
test("malformed dates, income, formulas and unofficial sources are refused", () => {
  for (const p of [
    { workDate: "2026-02-30" },
    { householdSize: 0 },
    { householdSize: 1.5 },
    { taxIncome: -1 },
    { taxIncome: Infinity },
    { taxYear: 2025.5 },
  ])
    assert.throws(() => projectInput(p));
  for (const url of [
    "https://france-renov.gouv.fr.evil.test/a",
    "http://france-renov.gouv.fr/a",
    "https://user:pass@france-renov.gouv.fr/a",
    "https://127.0.0.1",
  ])
    assert.equal(officialSource(url), false);
  assert.throws(() =>
    validateAidRule({
      ...rule(),
      formula: { type: "eval", expression: "process.env" },
    }),
  );
  assert.throws(() =>
    validateAidRule({ ...rule(), effectiveFrom: "2026-02-30" }),
  );
});
