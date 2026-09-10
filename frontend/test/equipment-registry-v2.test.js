import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEquipmentProof,
  canonicalizeEquipmentProofData,
} from "../server/lib/equipment-registry-v2.js";

test("le JSON canonique ne dépend pas de l'ordre des propriétés", () => {
  const first = canonicalizeEquipmentProofData({
    z: 1,
    a: { y: 2, x: 3 },
  });
  const second = canonicalizeEquipmentProofData({
    a: { x: 3, y: 2 },
    z: 1,
  });

  assert.equal(first, second);
  assert.equal(first, '{"a":{"x":3,"y":2},"z":1}');
});

test("les trois preuves Polygon sont des empreintes bytes32 stables", () => {
  const proof = buildEquipmentProof({
    carnetPassId: "CP-2026-000011",
    companyId: "company-test",
    serialNumber: "SERIAL-001",
    data: { model: "Test" },
  });

  assert.deepEqual(proof, {
    equipmentKey:
      "0xbd33ace0b0af0cdf3badb7f5c1eff224a0abefcfda4eb74c8bea963dbde6f2e4",
    dataHash:
      "0x88a75ec32f9df1618c71485a33b9d9e064c65766e0a11ce5c9dc251440b47570",
    serialHash:
      "0x691c0f8fc68aeae306fc88a3d61a3149a9ceb647a69cba784795dd7dd971dcff",
  });
});

test("une preuve sans numéro de série est refusée", () => {
  assert.throws(
    () => buildEquipmentProof({
      carnetPassId: "CP-2026-000011",
      companyId: "company-test",
      serialNumber: "",
      data: { model: "Test" },
    }),
    (error) => error?.code === "SERIAL_NUMBER_INVALID"
  );
});