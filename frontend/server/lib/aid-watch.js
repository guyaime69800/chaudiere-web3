import { createHash } from "node:crypto";
import { officialSource } from "../../shared/aid-engine.js";
import { checked, devisDatabase, devisRedis, fail } from "./devis-security.js";
export function sourceText(html) {
  return String(html)
    .replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120000);
}
export async function fetchOfficialSource(url, fetcher = fetch) {
  if (!officialSource(url))
    throw fail(400, "Source hors liste officielle autorisée.");
  // Every redirect target is checked again before any network call (no private hosts).
  let target = url,
    response;
  const signal = AbortSignal.timeout(10000);
  for (let hop = 0; hop < 4; hop++) {
    response = await fetcher(target, {
      redirect: "manual",
      headers: { "User-Agent": "CarnetPass-AidWatch/1.0", Accept: "text/html" },
      signal,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const next = new URL(response.headers.get("location") || "", target).href;
    await response.body?.cancel();
    if (!officialSource(next) || hop === 3)
      throw new Error("Redirection non autorisée.");
    target = next;
  }
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("text/html")
  )
    throw new Error("Source indisponible ou format non HTML.");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 1000000) throw new Error("Source trop volumineuse.");
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1000000) throw new Error("Source trop volumineuse.");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const text = sourceText(Buffer.concat(chunks).toString("utf8"));
  if (text.length < 200) throw new Error("Source vide ou inaccessible.");
  return { text, hash: createHash("sha256").update(text).digest("hex") };
}
export function watchOutcome(previous, result, error = null) {
  if (error)
    return {
      outcome: "unavailable",
      lastSuccessAt: previous.last_success_at || null,
    };
  return {
    outcome: !previous.content_hash
      ? "initial"
      : previous.content_hash === result.hash
        ? "unchanged"
        : "changed",
    lastSuccessAt: new Date().toISOString(),
  };
}
export async function watchAidSources({
  force = false,
  db = devisDatabase(),
  redis = devisRedis(),
} = {}) {
  const lock = `carnetpass:devis:watch-lock:${process.env.VERCEL_ENV || "local"}`;
  if ((await redis.set(lock, "1", { nx: true, ex: 600 })) !== "OK")
    throw fail(409, "Une vérification est déjà en cours.");
  const outcomes = [];
  try {
    const sources = await checked(
      db
        .from("shiba_aid_sources")
        .select("*")
        .order("last_attempt_at", { ascending: true, nullsFirst: true })
        .limit(8),
    );
    for (const source of sources) {
      if (
        !force &&
        source.last_attempt_at &&
        Date.now() - Date.parse(source.last_attempt_at) <
          source.check_interval_days * 86400000
      )
        continue;
      let result, error;
      try {
        result = await fetchOfficialSource(source.url);
      } catch {
        error = true;
      }
      const state = watchOutcome(source, result, error);
      const now = new Date().toISOString();
      await checked(
        db
          .from("shiba_aid_observations")
          .insert({
            source_url: source.url,
            outcome: state.outcome,
            previous_hash: source.content_hash,
            new_hash: result?.hash || null,
            previous_text: source.content_text,
            proposed_text: result?.text || null,
            detail: error
              ? "Source non consultable ; date de succès conservée."
              : null,
          }),
      );
      // Never move last_success_at after a failed fetch; never edit published rules.
      await checked(
        db
          .from("shiba_aid_sources")
          .update({
            last_attempt_at: now,
            status: state.outcome === "initial" ? "unchanged" : state.outcome,
            ...(!error
              ? {
                  last_success_at: now,
                  content_hash: result.hash,
                  content_text: result.text,
                }
              : {}),
          })
          .eq("url", source.url),
      );
      outcomes.push({ url: source.url, outcome: state.outcome });
    }
  } finally {
    await redis.del(lock);
  }
  return outcomes;
}
export async function scheduledAidWatch(req) {
  if (
    process.env.VERCEL_ENV !== "production" ||
    process.env.SHIBA_DEVIS_WATCH_ENABLED !== "true" ||
    !process.env.CRON_SECRET ||
    req.method !== "GET" ||
    req.headers?.authorization !== `Bearer ${process.env.CRON_SECRET}`
  )
    return;
  try {
    await watchAidSources();
  } catch {
    console.warn("Shiba Devis: veille indisponible.");
  }
}
