import assert from "assert";
import test from "node:test";

import {
  buildEquipmentProof,
  canonicalizeEquipmentProofData,
} from "../server/lib/equipment-registry-v2.js";

import {
  calculatePolygonTransactionBudget,
  getPolygonBalanceStatus,
} from "../server/lib/polygon-wallet-health.js";

test("le JSON canonique ne dépend pas de l'ordre des propriétés", () => {
  const first = canonicalizeEquipmentProofData({
    brand: "Saunier Duval",
    model: "ThemaPlus",
  });

  const second = canonicalizeEquipmentProofData({
    model: "ThemaPlus",
    brand: "Saunier Duval",
  });

  assert.equal(first, second);
});

test("les trois preuves Polygon sont des empreintes bytes32 stables", () => {
  const proof = buildEquipmentProof({
    carnetPassId: "CP-2026-000011",
    companyId: "company-test",
    serialNumber: "DEMO-SERIAL-001",
    data: {
      brand: "Saunier Duval",
      model: "ThemaPlus Condens 30-A",
    },
  });

  assert.match(proof.equipmentKey, /^0x[a-f0-9]{64}$/);
  assert.match(proof.dataHash, /^0x[a-f0-9]{64}$/);
  assert.match(proof.serialHash, /^0x[a-f0-9]{64}$/);
});

test("une preuve sans numéro de série est refusée", () => {
  assert.throws(
    () =>
      buildEquipmentProof({
        carnetPassId: "CP-2026-000011",
        companyId: "company-test",
        serialNumber: "",
        data: {
          model: "Test",
        },
      }),
    (error) => error?.code === "SERIAL_NUMBER_INVALID"
  );
});

test("les seuils du solde POL distinguent normal, faible et critique", () => {
  assert.equal(
    getPolygonBalanceStatus("300000000000000001"),
    "healthy"
  );

  assert.equal(
    getPolygonBalanceStatus("300000000000000000"),
    "warning"
  );

  assert.equal(
    getPolygonBalanceStatus("100000000000000001"),
    "warning"
  );

  assert.equal(
    getPolygonBalanceStatus("100000000000000000"),
    "critical"
  );

  assert.equal(
    getPolygonBalanceStatus(0n),
    "critical"
  );
});

test("le budget Polygon ajoute une marge de gaz et une réserve", () => {
  const budget = calculatePolygonTransactionBudget({
    estimatedGas: 100000n,
    feePerGas: 200n,
  });

  assert.deepEqual(budget, {
    gasLimit: 120000n,
    estimatedMaximumFeeWei: 24000000n,
    minimumReserveWei: 50000000000000000n,
    requiredBalanceWei: 50000000024000000n,
  });
});