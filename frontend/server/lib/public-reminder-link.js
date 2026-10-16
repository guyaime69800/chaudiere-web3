import { createHmac, timingSafeEqual } from "node:crypto";

const signedPattern = /^pr_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([1-9][0-9]{0,8})_([A-Za-z0-9_-]{43})$/i;

export function createSignedPublicManageToken(id, version, secret) {
  if (!secret || secret.length < 32 || !signedPattern.test(`pr_${id}_${version}_${"a".repeat(43)}`)) {
    throw new Error("MANAGEMENT_LINK_UNAVAILABLE");
  }
  const signature = createHmac("sha256", secret).update(`carnetpass-public-reminder:${id}:${version}`).digest("base64url");
  return `pr_${id}_${version}_${signature}`;
}

export function verifySignedPublicManageToken(token, secret) {
  if (!secret || secret.length < 32) return null;
  const match = signedPattern.exec(token);
  if (!match) return null;
  const expected = createHmac("sha256", secret).update(`carnetpass-public-reminder:${match[1]}:${match[2]}`).digest("base64url");
  const actualBytes = Buffer.from(match[3]);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
  return { id: match[1], version: Number(match[2]) };
}
