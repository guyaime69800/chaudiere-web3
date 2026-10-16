export const DISCOVERY_DAYS = 5;
export const DISCOVERY_EQUIPMENT_LIMIT = 5;

export function getDiscoveryAccess({ plan, status, createdAt, trialEndsAt, verificationStatus }, now = new Date()) {
  const start = Date.parse(createdAt || "");
  const configuredEnd = trialEndsAt ? Date.parse(trialEndsAt) : NaN;
  const end = Number.isFinite(configuredEnd) ? configuredEnd : start + DISCOVERY_DAYS * 86400000;
  const active = plan === "free"
    && ["active", "trialing"].includes(status)
    && !["suspended", "rejected"].includes(verificationStatus)
    && Number.isFinite(end)
    && now.getTime() < end;
  return {
    active,
    endsAt: Number.isFinite(end) ? new Date(end).toISOString() : null,
    daysRemaining: active ? Math.ceil((end - now.getTime()) / 86400000) : 0,
  };
}
