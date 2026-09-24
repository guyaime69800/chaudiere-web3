import OpenAI from "openai";
import { aiRateLimit } from "../server/lib/rate-limit.js";
import { requireVerifiedCompany } from "../server/lib/require-verified-company.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function safeSource(url, title) {
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) return null;
    return { url: parsed.href, title: String(title || parsed.hostname).slice(0, 180) };
  } catch {
    return null;
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Méthode non autorisée." });

  // La recherche Web est facturée : accès professionnel et limite IA existante.
  const professional = await requireVerifiedCompany(request, response);
  if (!professional) return;

  const question = String(request.body?.question || "").trim().slice(0, 1200);
  const brand = String(request.body?.brand || "").trim().slice(0, 100);
  const model = String(request.body?.model || "").trim().slice(0, 160);
  const reference = String(request.body?.reference || "").trim().slice(0, 100);
  const category = String(request.body?.category || "").trim().slice(0, 100);
  if (!question || !brand || !model) {
    return response.status(400).json({ error: "Indiquez la marque, le modèle et votre question." });
  }

  try {
    const forwarded = request.headers["x-forwarded-for"];
    const ip = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || request.headers["x-real-ip"] || request.socket?.remoteAddress || "unknown").split(",")[0].trim();
    const { success, limit, remaining, reset, pending } = await aiRateLimit.limit(`ip:${ip}`);
    if (pending) await pending;
    response.setHeader("X-RateLimit-Limit", String(limit));
    response.setHeader("X-RateLimit-Remaining", String(remaining));
    response.setHeader("X-RateLimit-Reset", String(reset));
    if (!success) {
      response.setHeader("Retry-After", String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))));
      return response.status(429).json({ error: "Limite temporaire de questions IA atteinte." });
    }
  } catch (error) {
    console.error("Limite IA indisponible :", error);
    return response.status(503).json({ error: "Recherche temporairement indisponible." });
  }

  try {
    const result = await client.responses.create({
      model: "gpt-5.6-luna",
      store: false,
      tools: [{ type: "web_search", search_context_size: "low" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      max_tool_calls: 2,
      max_output_tokens: 1000,
      instructions: [
        "Tu es Shiba Bot, assistant technique CarnetPass. Réponds en français de façon concise.",
        "Recherche des sources sur le Web, en privilégiant les notices officielles du constructeur.",
        "N'invente jamais une vue éclatée, une référence de pièce, un code défaut ni une page de notice.",
        "Si la marque ou la variante ne peut être vérifiée, dis-le explicitement.",
        "Les résultats Web ne constituent pas une documentation constructeur validée par CarnetPass.",
        "N'inclus aucune procédure dangereuse à réaliser sans professionnel qualifié.",
        "Cite tes sources utilisées et signale toute incertitude.",
      ].join(" "),
      input: `Équipement : ${category || "non précisé"} ; marque : ${brand} ; modèle : ${model} ; référence : ${reference || "non renseignée"}. Question : ${question}`,
    });

    const message = result.output?.find((entry) => entry.type === "message");
    const content = message?.content?.find((entry) => entry.type === "output_text");
    const answer = content?.text || result.output_text || "";
    const citations = (content?.annotations || []).filter((item) => item.type === "url_citation")
      .map((item) => ({ ...safeSource(item.url, item.title), start: item.start_index, end: item.end_index }))
      .filter((item) => item.url && Number.isInteger(item.start) && Number.isInteger(item.end));
    const sources = [];
    for (const item of citations) if (!sources.some((source) => source.url === item.url)) sources.push({ title: item.title, url: item.url });
    for (const call of result.output || []) {
      if (call.type !== "web_search_call") continue;
      for (const item of call.action?.sources || []) {
        const source = safeSource(item.url, item.title);
        if (source && !sources.some((known) => known.url === source.url)) sources.push(source);
      }
    }

    // Aucune conclusion technique sans URL consultable.
    if (!answer || !sources.length) {
      return response.status(200).json({ ok: true, source: "web", answer: "Aucune source exploitable trouvée pour ce modèle. Vérifiez sa référence ou recherchez une notice officielle.", sources: [], citations: [] });
    }
    return response.status(200).json({ ok: true, source: "web", answer, citations, sources: sources.slice(0, 8) });
  } catch (error) {
    console.error("Recherche Web Shiba indisponible :", error);
    return response.status(503).json({ error: "La recherche Web de Shiba est momentanément indisponible." });
  }
}
