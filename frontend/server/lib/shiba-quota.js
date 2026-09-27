import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

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
  const store = options.redis || redis;
  const current = await store.get(context.key);
  const used = Number(current ?? (context.legacyKey ? await store.get(context.legacyKey) : 0) ?? 0);
  return { enabled: true, used, limit: context.limit, remaining: Math.max(0, context.limit - used), resetAt: context.resetAt, period: context.period };
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
if used >= limit then return {0, used} end
used = redis.call('INCR', KEYS[1])
redis.call('EXPIREAT', KEYS[1], tonumber(ARGV[2]))
return {1, used}
`;

export async function reserveShibaQuestion(professional, plan, options = {}) {
  const context = quotaContext(professional, plan, options.now || new Date());
  if (context.limit === null) return { allowed: true, enforced: false };
  const [allowed, used] = await (options.redis || redis).eval(
    RESERVE_SCRIPT,
    [context.key, context.legacyKey || ""],
    [context.limit, context.expiresAt],
  );
  return {
    allowed: Number(allowed) === 1,
    enforced: true,
    key: context.key,
    used: Number(used),
    limit: context.limit,
    remaining: Math.max(0, context.limit - Number(used)),
    resetAt: context.resetAt,
    period: context.period,
  };
}

export async function refundShibaQuestion(reservation, options = {}) {
  if (!reservation?.allowed || !reservation?.enforced) return;
  const store = options.redis || redis;
  await store.eval(
    "local used = tonumber(redis.call('GET', KEYS[1]) or '0'); if used > 0 then return redis.call('DECR', KEYS[1]) end; return 0",
    [reservation.key],
    [],
  );
}

export function setShibaUsageHeaders(response, usage) {
  if (!usage.enforced) return;
  response.setHeader("X-Shiba-Limit", String(usage.limit));
  response.setHeader("X-Shiba-Remaining", String(usage.remaining));
  response.setHeader("X-Shiba-Reset", usage.resetAt);
}
