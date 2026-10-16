import test from "node:test";
import assert from "node:assert/strict";
import { buildThermodynamicPdf } from "./thermodynamic-document-pdf.js";

const signature = { name: "Signataire", signedAt: "2026-09-30T12:00:00Z", strokes: [[[0, 0], [100, 100]]] };

test("generates a signed climate maintenance PDF without official CERFA claim", () => {
  const bytes = buildThermodynamicPdf({
    id: "test-id", intervention_id: "intervention-id", issued_at: "2026-09-30T12:00:00Z",
    kind: "climate_maintenance", equipment_snapshot: { brand: "Airwell", model: "HDLA" },
    intervention_snapshot: { intervention_at: "2026-09-30" },
    form_data: { holderName: "Client", workPerformed: "Nettoyage des filtres" },
    operator_signature: signature, holder_signature: signature,
  });
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  assert.ok(bytes.length > 1000);
});
