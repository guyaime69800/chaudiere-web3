import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";

let redis;
function defaultRedis() {
  redis ||= new Redis({
    url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
  });
  return redis;
}

export const shibaQuotaEnabled = () => process.env.VERCEL_ENV === "preview";

export function shibaQuotaLimit(plan) {
  if (plan === "free") return 20;
  if (plan === "pro" || plan === "team") return 200;
  if (plan === "enterprise") return null;
  throw new Error("Unknown subscription plan");
}

function period(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    resetAt: new Date(Date.UTC(year, month + 1, 1)),
  };
}

function bonusKey(professional) {
  return `carnetpass:shiba:bonus:v1:${professional.companyId}:${professional.userId}`;
}

export async function getShibaPlan(request, professional) {
  const token = /^Bearer ([^\s]+)$/i.exec(request.headers?.authorization || "")?.[1];
  if (!token) throw new Error("Missing authenticated user");
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("company_id", professional.companyId)
    .single();
  if (error || !data?.plan) throw new Error("Subscription unavailable");
  return data.plan;
}

function quotaContext(professional, plan, now) {
  const monthly = period(now);
  const trialEnd = plan === "free" ? Date.parse(professional.discoveryEndsAt || "") : NaN;
  const trialStart = plan === "free" ? Date.parse(professional.discoveryStartsAt || "") : NaN;
  if (plan === "free" && !Number.isFinite(trialEnd)) throw new Error("Discovery end date missing");
  if (plan === "free" && !Number.isFinite(trialStart)) throw new Error("Discovery start date missing");
  const resetAt = plan === "free" ? new Date(trialEnd) : monthly.resetAt;
  return {
    key: plan === "free"
      ? `carnetpass:shiba:trial:v1:${professional.companyId}:${professional.userId}:${trialEnd}`
      : `carnetpass:shiba:monthly:v1:${professional.companyId}:${professional.userId}:${monthly.key}`,
    legacyKey: plan === "free"
      ? `carnetpass:shiba:monthly:v1:${professional.companyId}:${professional.userId}:${period(new Date(trialStart)).key}`
      : null,
    limit: shibaQuotaLimit(plan),
    resetAt: resetAt.toISOString(),
    expiresAt: Math.floor(resetAt.getTime() / 1000) + 86400,
    period: plan === "free" ? "trial" : "month",
  };
}

export async function readShibaUsage(professional, plan, options = {}) {
  const context = quotaContext(professional, plan, options.now || new Date());
  if (context.limit === null) return { enabled: false };
  const store = options.redis || defaultRedis();
  const [current, purchased] = await Promise.all([store.get(context.key), store.get(bonusKey(professional))]);
  const used = Number(current ?? (context.legacyKey ? await store.get(context.legacyKey) : 0) ?? 0);
  const bonusRemaining = Math.max(0, Number(purchased || 0));
  return { enabled: true, used, limit: context.limit, bonusRemaining,
    remaining: Math.max(0, context.limit - used) + bonusRemaining, resetAt: context.resetAt, period: context.period };
}

const RESERVE_SCRIPT = `
if KEYS[2] and KEYS[2] ~= '' and redis.call('EXISTS', KEYS[1]) == 0 then
  local previous = redis.call('GET', KEYS[2])
  if previous then
    redis.call('SET', KEYS[1], previous)
    redis.call('EXPIREAT', KEYS[1], tonumber(ARGV[2]))
  end
end
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
local limit = tonumber(ARGV[1])
local bonus = tonumber(redis.call('GET', KEYS[3]) or '0')
if used < limit then
  used = redis.call('INCR', KEYS[1])
  redis.call('EXPIREAT', KEYS[1], tonumber(ARGV[2]))
  return {1, used, bonus, 0}
end
if bonus > 0 then
  bonus = redis.call('DECR', KEYS[3])
  return {1, used, bonus, 1}
end
return {0, used, bonus, 0}
`;

export async function reserveShibaQuestion(professional, plan, options = {}) {
  const context = quotaContext(professional, plan, options.now || new Date());
  if (context.limit === null) return { allowed: true, enforced: false };
  const [allowed, used, purchased, bonusSource] = await (options.redis || defaultRedis()).eval(
    RESERVE_SCRIPT,
    [context.key, context.legacyKey || "", bonusKey(professional)],
    [context.limit, context.expiresAt],
  );
  return {
    allowed: Number(allowed) === 1,
    enforced: true,
    key: context.key,
    bonusKey: bonusKey(professional),
    bonusSource: Number(bonusSource) === 1,
    used: Number(used),
    limit: context.limit,
    bonusRemaining: Number(purchased),
    remaining: Math.max(0, context.limit - Number(used)) + Number(purchased),
    resetAt: context.resetAt,
    period: context.period,
  };
}

export async function refundShibaQuestion(reservation, options = {}) {
  if (!reservation?.allowed || !reservation?.enforced) return;
  const store = options.redis || defaultRedis();
  await store.eval(
    "if ARGV[1] == 'bonus' then return redis.call('INCR', KEYS[2]) end; local used = tonumber(redis.call('GET', KEYS[1]) or '0'); if used > 0 then return redis.call('DECR', KEYS[1]) end; return 0",
    [reservation.key, reservation.bonusKey],
    [reservation.bonusSource ? "bonus" : "base"],
  );
}

const GRANT_BONUS_SCRIPT = `
if redis.call('EXISTS', KEYS[2]) == 1 then return {0, tonumber(redis.call('GET', KEYS[1]) or '0')} end
local balance = redis.call('INCRBY', KEYS[1], tonumber(ARGV[1]))
redis.call('SET', KEYS[2], '1')
return {1, balance}
`;

export async function grantShibaRecharge(professional, credits, checkoutSessionId, options = {}) {
  if (!Number.isSafeInteger(credits) || credits <= 0 || !/^cs_test_[A-Za-z0-9]+$/.test(checkoutSessionId)) {
    throw new Error("Invalid recharge grant");
  }
  const [granted, balance] = await (options.redis || defaultRedis()).eval(
    GRANT_BONUS_SCRIPT,
    [bonusKey(professional), `carnetpass:shiba:recharge:v1:${checkoutSessionId}`],
    [credits],
  );
  return { granted: Number(granted) === 1, bonusRemaining: Number(balance) };
}

export function setShibaUsageHeaders(response, usage) {
  if (!usage.enforced) return;
  response.setHeader("X-Shiba-Limit", String(usage.limit));
  response.setHeader("X-Shiba-Remaining", String(usage.remaining));
  response.setHeader("X-Shiba-Reset", usage.resetAt);
}
