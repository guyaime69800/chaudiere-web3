import { Redis } from '@upstash/redis';
import { checkEquipmentRegistryV2 } from './equipment-registry-v2.js';

const key = () => `carnetpass:openai-health:${process.env.VERCEL_ENV || 'local'}`;
function store() {
  return new Redis({ url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN });
}
export function openAIProblem(error) {
  const code = error?.code || error?.error?.code;
  if (['insufficient_quota', 'credit_balance_exhausted', 'billing_hard_limit_reached'].includes(code)) return 'billing';
  if (['invalid_api_key', 'permission_denied'].includes(code) || [401, 403].includes(error?.status)) return 'authentication';
  if (error?.status === 429) return 'rate_limit';
  if (error?.status >= 500 && (error?.request_id || error?.headers)) return 'unavailable';
  return null;
}
// Store only a fixed classification and time, never prompts, provider errors or keys.
export async function recordOpenAIHealth(error, redis) {
  const problem = error ? openAIProblem(error) : null;
  if (error && !problem) return;
  try { await (redis || store()).set(key(), { state: problem || 'success', at: new Date().toISOString() }, { ex: 604800 }); }
  catch { /* Monitoring must not interrupt Shiba. */ }
}
export async function adminServiceHealth({ polygonCheck = checkEquipmentRegistryV2, redis, env = process.env } = {}) {
  const checkedAt = new Date().toISOString();
  const [polygon, openai] = await Promise.all([
    (async () => {
      try {
        const result = await Promise.race([polygonCheck(), new Promise((_, reject) => {
          const timer = setTimeout(() => reject(Error('timeout')), 10000); timer.unref?.();
        })]);
        return { state: result.chainId !== 137 || result.paused || !result.serverAuthorized ? 'critical' : result.balanceStatus,
          balancePol: result.balancePol, thresholds: result.balanceThresholds, checkedAt };
      } catch { return { state: 'unavailable', checkedAt }; }
    })(),
    (async () => {
      if (!env.OPENAI_API_KEY) return { state: 'missing', balanceAvailable: false };
      try {
        const recent = await (redis || store()).get(key());
        const valid = ['success', 'billing', 'authentication', 'rate_limit', 'unavailable'].includes(recent?.state)
          && Number.isFinite(Date.parse(recent.at)) && Date.now() - Date.parse(recent.at) < 604800000;
        return { state: valid ? recent.state : 'unknown', at: valid ? recent.at : null, balanceAvailable: false };
      } catch { return { state: 'monitor_unavailable', balanceAvailable: false }; }
    })(),
  ]);
  return { polygon, openai, checkedAt };
}
