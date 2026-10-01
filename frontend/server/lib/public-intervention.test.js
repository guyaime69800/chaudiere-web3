import test from "node:test";
import assert from "node:assert/strict";
import { serializePublicIntervention } from "./public-intervention.js";

test("a public QR never returns notes or private identities", () => {
  assert.deepEqual(serializePublicIntervention({
    id: "event-1", intervention_at: "2026-10-01T10:00:00Z", intervention_type: "repair",
    result_status: "resolved", polygon_confirmed_at: "2026-10-01T10:05:00Z",
    work_performed: "Private client details", diagnosis: "Private diagnosis",
    technician_id: "private-user", equipment_id: "private-equipment",
  }), {
    id: "event-1", interventionAt: "2026-10-01T10:00:00Z", interventionType: "repair",
    resultStatus: "resolved", polygonConfirmedAt: "2026-10-01T10:05:00Z",
  });
});
