import assert from "node:assert/strict";
import test from "node:test";
import { createSignedPublicManageToken, verifySignedPublicManageToken } from "./public-reminder-link.js";

test("le lien de gestion signé ne donne accès qu’au rappel exact", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const other = "550e8400-e29b-41d4-a716-446655440001";
  const secret = "a-long-test-only-secret-with-at-least-32-chars";
  const token = createSignedPublicManageToken(id, 2, secret);
  assert.deepEqual(verifySignedPublicManageToken(token, secret), { id, version: 2 });
  assert.equal(verifySignedPublicManageToken(token.replace(id, other), secret), null);
  assert.equal(verifySignedPublicManageToken(token.replace("_2_", "_3_"), secret), null);
  assert.equal(verifySignedPublicManageToken(token, "another-secret-with-at-least-32-chars"), null);
  assert.equal(verifySignedPublicManageToken(token, ""), null);
});
