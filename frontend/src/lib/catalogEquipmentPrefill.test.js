import test from "node:test";
import assert from "node:assert/strict";
import { catalogEquipmentPrefill } from "./catalogEquipmentPrefill.js";

test("prefills a catalog boiler without inventing an appliance serial number", () => {
  assert.deepEqual(catalogEquipmentPrefill({ type: "boiler", brand: "Atlantic", model: "Naia 2 Micro 25", manufacturerReference: "021272" }), {
    equipmentType: "boiler", brand: "Atlantic", model: "Naia 2 Micro 25", productReference: "021272", serialNumber: "",
  });
});

test("maps a published indoor air-conditioning document to the equipment form", () => {
  const form = catalogEquipmentPrefill({ type: "air_conditioning_indoor", brand: "Airwell", model: "AW-CBV007-N11", manufacturerReference: "7SP04H038" });
  assert.equal(form.equipmentType, "air_conditioning");
  assert.equal(form.productReference, "7SP04H038");
});
