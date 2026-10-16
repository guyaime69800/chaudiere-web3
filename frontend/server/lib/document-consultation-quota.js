import { Redis } from "@upstash/redis";

let redis;
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
export function consultationDay(now) {
  return dayFormatter.format(now);
}
export function consultationLimit(plan, additionalAccount = false) {
  if (plan === "free") return 5;
  if (["pro", "team", "enterprise"].includes(plan)) return additionalAccount ? 15 : 20;
  throw new Error("Unknown document plan");
}
const SCRIPT = `
if redis.call('EXISTS', KEYS[2]) == 1 then return {1, tonumber(redis.call('GET', KEYS[1]) or '0')} end
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
if used >= tonumber(ARGV[1]) then return {0, used} end
used = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], 172800)
redis.call('SET', KEYS[2], '1', 'EX', 900)
return {1, used}
`;

// Authentication and publication checks must precede this reservation.
// One opening and its authenticated delivery fallback share a 15-minute receipt.
export async function reserveDocumentConsultation(professional, documentId, receipt, options = {}) {
  if (professional.accessKind === "founder_test") return { allowed: true, enforced: false };
  const limit = consultationLimit(professional.plan, professional.additionalAccount === true);
  const day = consultationDay(options.now || new Date());
  const key = `carnetpass:documents:daily:v1:${professional.companyId}:${professional.userId}:${day}`;
  const store = options.redis || (redis ||= new Redis({
    url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
  }));
  const [allowed, used] = await store.eval(SCRIPT,
    [key, `${key}:opening:${documentId}:${receipt}`], [limit]);
  return { allowed: Number(allowed) === 1, enforced: true, limit,
    remaining: Math.max(0, limit - Number(used)), day };
}
