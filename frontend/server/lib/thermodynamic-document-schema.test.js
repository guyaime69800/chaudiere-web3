import test from "node:test";
import assert from "node:assert/strict";
import { normalizeThermodynamicData, normalizeDrawnSignature, validateIssue } from "./thermodynamic-document-schema.js";

const signature = { name: "Technicien", accepted: true, strokes: [[[0, 0], [100, 100], [200, 80], [300, 110], [400, 90], [500, 100], [600, 90], [700, 100]]] };

test("refuses malformed or excessive mobile signatures", () => {
  assert.throws(() => normalizeDrawnSignature({ ...signature, accepted: false }));
  assert.throws(() => normalizeDrawnSignature({ ...signature, strokes: [[[1001, 0], [1, 1]]] }));
  assert.equal(normalizeDrawnSignature(signature).name, "Technicien");
});

test("prevents issuing a fluid sheet without essential CERFA fields", () => {
  const data = normalizeThermodynamicData("fluids_15497_04", { operatorName: "Entreprise" });
  assert.throws(() => validateIssue("fluids_15497_04", data, signature, signature), /MISSING/);
});

test("refuses unexpected field structures", () => {
  assert.throws(() => normalizeThermodynamicData("climate_maintenance", { holderName: { nested: true } }));
  assert.throws(() => normalizeThermodynamicData("unknown", {}));
});

test("fluid totals must match the official A+B+C and D+E fields", () => {
  const base = Object.fromEntries([
    "operatorName", "operatorAddress", "operatorSiret", "capacityNumber", "holderName", "holderAddress",
    "installationAddress", "equipmentIdentification", "refrigerant", "fluidCategory", "chargeKg",
    "operationDate", "operationNature", "permanentDetector", "leaksFound", "chargedTotalKg", "recoveredTotalKg",
  ].map((key) => [key, "x"]));
  Object.assign(base, { operatorSiret: "12345678901234", fluidCategory: "HFO", chargeKg: "2",
    chargedTotalKg: "1", virginKg: "0.5", recycledKg: "0", regeneratedKg: "0",
    recoveredTotalKg: "0", treatmentKg: "0", reuseKg: "0" });
  assert.throws(() => validateIssue("fluids_15497_04", base, signature, signature), /QUANTITY_MISMATCH/);
});
