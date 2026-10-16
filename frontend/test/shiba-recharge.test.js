import assert from "node:assert/strict";
import test from "node:test";
import { SHIBA_RECHARGE_PACKS } from "../src/lib/shiba-recharge-packs.js";
import { openShibaRecharge } from "../src/services/shibaUsageEvents.js";

test("les deux recharges Preview correspondent aux montants et crédits confirmés", () => {
  assert.deepEqual(SHIBA_RECHARGE_PACKS.map(({ euros, credits }) => [euros, credits]), [[10, 100], [20, 200]]);
});

test("un refus du quota demande l'ouverture de la modale avec sa période", () => {
  const previousWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent(event) { events.push(event); return true; } };
  try {
    const usage = { period: "month", resetAt: "2026-11-01T00:00:00.000Z", remaining: 0 };
    openShibaRecharge(usage, true);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "shiba-recharge-requested");
    assert.deepEqual(events[0].detail, { usage, force: true });
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
