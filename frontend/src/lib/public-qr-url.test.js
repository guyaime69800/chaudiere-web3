import test from "node:test";
import assert from "node:assert/strict";
import { isTrustedCarnetPassQrOrigin, publicQrUrl } from "./public-qr-url.js";

test("Preview QR links use the stable test domain", () => {
  assert.equal(publicQrUrl("https://chaudiere-web3-jhh2upq2e-chaudiere-web3.vercel.app", "cp_qr_abc"), "https://test.carnetpass.fr/appareil/cp_qr_abc");
  assert.equal(publicQrUrl("https://test.carnetpass.fr", "CP-2026-000020"), "https://test.carnetpass.fr/appareil/CP-2026-000020");
  assert.equal(publicQrUrl("https://www.carnetpass.fr", "CP-2026-000020"), "https://www.carnetpass.fr/appareil/CP-2026-000020");
  assert.equal(publicQrUrl("http://localhost:5173", "CP-2026-000020"), "http://localhost:5173/appareil/CP-2026-000020");
});

test("scanner can read earlier immutable Preview links but rejects other hosts", () => {
  assert.equal(isTrustedCarnetPassQrOrigin("https://chaudiere-web3-9kdn9ibf3-chaudiere-web3.vercel.app", "https://test.carnetpass.fr"), true);
  assert.equal(isTrustedCarnetPassQrOrigin("https://chaudiere-web3-evil.example.com", "https://test.carnetpass.fr"), false);
  assert.equal(isTrustedCarnetPassQrOrigin("http://test.carnetpass.fr", "https://test.carnetpass.fr"), false);
});
