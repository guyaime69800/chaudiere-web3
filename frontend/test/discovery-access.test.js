import assert from "node:assert/strict";
import test from "node:test";
import { getDiscoveryAccess } from "../shared/discovery-access.js";

const account = {
  plan: "free",
  status: "active",
  createdAt: "2026-09-27T12:00:00Z",
  verificationStatus: "pending",
};

test("Découverte est accessible sans SIRET pendant cinq jours", () => {
  const access = getDiscoveryAccess(account, new Date("2026-09-28T12:00:00Z"));
  assert.equal(access.active, true);
  assert.equal(access.endsAt, "2026-10-02T12:00:00.000Z");
  assert.equal(access.daysRemaining, 4);
  assert.equal(getDiscoveryAccess(account, new Date("2026-10-02T12:00:00Z")).active, false);
});

test("une suspension et une résiliation ferment l’essai", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  assert.equal(getDiscoveryAccess({ ...account, verificationStatus: "suspended" }, now).active, false);
  assert.equal(getDiscoveryAccess({ ...account, status: "canceled" }, now).active, false);
});
