import test from "node:test";
import assert from "node:assert/strict";
import { AID_SOURCES, cleanProject, readProject, saveProject, forgetProject, prepareProject, projectText } from "../src/lib/shiba-devis.js";
import { PUBLIC_USER_MANUAL_MODELS, getPublicUserManual } from "../src/lib/public-user-manuals.js";

const today = "2026-10-07";
test("The selectable public model resolves to its existing manual only", () => {
  assert.ok(getPublicUserManual(PUBLIC_USER_MANUAL_MODELS[0]));
  assert.equal(getPublicUserManual({ ...PUBLIC_USER_MANUAL_MODELS[0], model: "HDLA-022N-12M25", manufacturerReference: "HDLA-022N-12M25" }), null);
  assert.equal(getPublicUserManual({ ...PUBLIC_USER_MANUAL_MODELS[0], brand: "Other" }), null);
});
test("No aid amount or eligibility is invented even with a complete project", () => {
  const result = prepareProject({ housing: "house", occupancy: "owner", work: "heating", currentEquipment: "boiler", postalCode: "69000" }, { today });
  assert.equal(result.amount, null);
  assert.equal(result.eligibility, "not_assessed");
  assert.equal(result.missing.length, 0);
  assert.match(projectText(result, true), /Trame de préparation/);
});
test("Absent, outdated, future and unofficial sources cannot support orientation", () => {
  for (const sources of [[], [{ ...AID_SOURCES[0], referencedOn: "2025-01-01" }], [{ ...AID_SOURCES[0], referencedOn: "2027-01-01" }], [{ ...AID_SOURCES[0], url: "https://france-renov.gouv.fr.evil.example/aides" }]]) {
    const result = prepareProject({ work: "heating" }, { sources, today });
    assert.equal(result.sources.length, 0);
    assert.equal(result.amount, null);
  }
});
test("One draft survives navigation between entries and can be erased", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  assert.equal(saveProject(storage, { work: "heating", housing: "house" }), true);
  assert.equal(readProject(storage).work, "heating");
  assert.equal(readProject(storage).housing, "house");
  assert.equal(values.size, 1);
  assert.equal(forgetProject(storage), true);
  assert.equal(readProject(storage).work, "");
});
test("Private identifiers and invalid fields are never retained in the project", () => {
  const project = cleanProject({ housing: "invalid", postalCode: "address", income: 45000, email: "private@example.com", equipmentId: "../private" });
  assert.equal(project.housing, "");
  assert.equal(project.postalCode, "");
  assert.equal(project.equipmentId, "");
  assert.equal(Object.hasOwn(project, "income"), false);
  assert.equal(Object.hasOwn(project, "email"), false);
});
test("Unavailable or corrupt storage does not prevent preparing a dossier", () => {
  assert.equal(saveProject(null, {}), false);
  assert.equal(readProject({ getItem: () => "broken json" }).work, "");
  assert.ok(prepareProject(readProject(null), { today }).missing.length > 0);
});
