import OpenAI from "openai";

import { getEquipmentConfig } from "./lib/equipment-registry.js";

import { searchRagContext } from "./lib/rag.js";

import { aiRateLimit } from "./lib/rate-limit.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------------------------------------------------
// NORMALISATION DES CODES DEFAUT
// ---------------------------------------------------------
// Transforme F28, f28, F.28 ou "défaut F28" en "F.28".

function normalizeErrorCode(input) {
  const text = String(input ?? "").trim().toUpperCase();

  const match = text.match(/F\s*\.?\s*(\d{1,3})/);

  if (!match) {
    return null;
  }

  return `F.${match[1]}`;
}

// ---------------------------------------------------------
// API IA CARNETPASS
// ---------------------------------------------------------

export default async function handler(request, response) {
  try {
    // -----------------------------------------------------
    // 1. VERIFICATION DE LA METHODE HTTP
    // -----------------------------------------------------

    if (request.method !== "POST") {
      return response.status(405).json({
        error: "Méthode non autorisée",
      });
    }

    // -----------------------------------------------------
    // 2. RECUPERATION DES DONNEES
    // -----------------------------------------------------

    const body = request.body ?? {};

    const equipmentId = String(body?.equipmentId ?? "").trim();

    const question = String(body?.question ?? "").trim();

    if (!equipmentId || !question) {
      return response.status(400).json({
        error: "Équipement ou question manquant",
      });
    }

    // -----------------------------------------------------
    // 3. RECHERCHE DE L'EQUIPEMENT
    // -----------------------------------------------------

    // Recherche automatiquement l'équipement
    // correspondant à l'identifiant reçu par CarnetPass.

    const equipmentConfig = getEquipmentConfig(equipmentId);

    if (!equipmentConfig) {
      return response.status(404).json({
        error: "Équipement documentaire introuvable",
      });
    }

    // Récupère les données techniques et les embeddings
    // correspondant uniquement à cet équipement.

    const {
      equipmentData,
      ragEmbeddingData,
    } = equipmentConfig;

    // -----------------------------------------------------
    // 4. ANALYSE DE LA QUESTION
    // -----------------------------------------------------

    const normalizedQuestion = String(question ?? "").toLowerCase();

    const wantsErrorCodeList =
      normalizedQuestion.includes("liste des codes") ||
      normalizedQuestion.includes("codes défaut") ||
      normalizedQuestion.includes("codes de défaut") ||
      normalizedQuestion.includes("codes erreur") ||
      normalizedQuestion.includes("codes d'erreur") ||
      normalizedQuestion.includes("quels sont les codes");

    // Cherche un code défaut précis seulement si nécessaire.

    const normalizedCode = normalizeErrorCode(question);

    // Si un code F.xx est présent dans la question,
    // on continue d'utiliser la recherche directe existante.

    const errorCode = normalizedCode
      ? equipmentData.errorCodes?.find(
          (error) => error.code.toUpperCase() === normalizedCode
        ) ?? null
      : null;

    // -----------------------------------------------------
    // 5. VERIFICATIONS DES CODES DEFAUT
    // -----------------------------------------------------

    // On renvoie une erreur uniquement si le technicien
    // a réellement demandé un code précis qui n'existe pas.

    if (!wantsErrorCodeList && normalizedCode && !errorCode) {
      return response.status(404).json({
        error: `Code défaut ${normalizedCode} introuvable pour cet équipement`,
      });
    }

    if (wantsErrorCodeList && !equipmentData.errorCodeIndex) {
      return response.status(404).json({
        error: "Liste des codes défaut introuvable pour cet équipement",
      });
    }

    // Une question libre est une question qui ne demande ni
    // la liste des codes, ni un code F.xx précis.

    const isFreeQuestion =
      !wantsErrorCodeList && !normalizedCode;

    // -----------------------------------------------------
    // 6. PROTECTION IA - RATE LIMITING
    // -----------------------------------------------------
    //
    // Objectif :
    // maximum 10 requêtes IA par minute et par adresse IP.
    //
    // Cette vérification est faite AVANT :
    // - la génération d'embedding RAG
    // - l'appel au modèle OpenAI
    //
    // Donc une requête bloquée ne déclenche pas de coût IA.
    // -----------------------------------------------------

    const forwardedFor = request.headers["x-forwarded-for"];

    const clientIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : String(
          forwardedFor ??
            request.headers["x-real-ip"] ??
            request.socket?.remoteAddress ??
            "unknown"
        )
          .split(",")[0]
          .trim();

    try {
      const {
        success,
        limit,
        remaining,
        reset,
        pending,
      } = await aiRateLimit.limit(`ip:${clientIp}`);

      // Attend l'enregistrement des statistiques Upstash.

      if (pending) {
        await pending;
      }

      // Informations utiles pour le navigateur
      // et pour nos futurs tests.

      response.setHeader(
        "X-RateLimit-Limit",
        String(limit)
      );

      response.setHeader(
        "X-RateLimit-Remaining",
        String(remaining)
      );

      response.setHeader(
        "X-RateLimit-Reset",
        String(reset)
      );

      // Si la limite est dépassée,
      // aucun appel OpenAI n'est effectué.

      if (!success) {
        const retryAfter = Math.max(
          1,
          Math.ceil((reset - Date.now()) / 1000)
        );

        response.setHeader(
          "Retry-After",
          String(retryAfter)
        );

        return response.status(429).json({
          error: "Limite temporaire de questions IA atteinte",
          message: `Merci de réessayer dans environ ${retryAfter} seconde(s).`,
        });
      }
    } catch (rateLimitError) {
      console.error(
        "Erreur protection rate limiting CarnetPass :",
        rateLimitError
      );

      // Sécurité :
      // si Redis ne répond plus, on bloque temporairement
      // l'Assistant plutôt que de permettre des appels
      // OpenAI sans aucune limitation.

      return response.status(503).json({
        error: "Assistant IA temporairement indisponible",
        message:
          "La protection de l'Assistant CarnetPass est momentanément indisponible.",
      });
    }

    // -----------------------------------------------------
    // 7. RECHERCHE RAG
    // -----------------------------------------------------

    // Pour une question libre, on lance le moteur RAG.
    // Il recherche les 3 passages les plus proches
    // par leur sens.

    const ragResult = isFreeQuestion
      ? await searchRagContext(
          openai,
          ragEmbeddingData,
          question,
          3
        )
      : null;

    // -----------------------------------------------------
    // 8. CONSTRUCTION DU CONTEXTE
    // -----------------------------------------------------

    // Choisit le bon contexte selon la question
    // du technicien.

    const context = wantsErrorCodeList
      ? {
          requestType: "error_code_list",

          codes:
            equipmentData.errorCodeIndex.codes ?? [],

          meanings:
            equipmentData.errorCodeIndex.meanings ?? {},

          note:
            equipmentData.errorCodeIndex.note ?? null,

          source:
            equipmentData.errorCodeIndex.source ?? null,
        }
      : errorCode
        ? {
            requestType: "error_code_detail",

            code: errorCode.code,

            title: errorCode.title,

            meaning:
              errorCode.manufacturerData?.meaning ?? null,

            possibleCauses:
              errorCode.manufacturerData?.possibleCauses ?? [],

            professionalChecks:
              errorCode.manufacturerData?.professionalChecks ?? [],

            userGuidance:
              errorCode.userGuidance ?? null,

            source:
              errorCode.source ?? null,
          }
        : {
            requestType: "semantic_rag",

            passages:
              ragResult.topResults,

            contextText:
              ragResult.contextText,

            embeddingTokens:
              ragResult.tokensUsed,
          };

    // -----------------------------------------------------
    // 9. APPEL DE L'ASSISTANT IA
    // -----------------------------------------------------

    const aiResponse = await openai.responses.create({
      model: "gpt-5.6-luna",

      instructions: wantsErrorCodeList
        ? `
Tu es l'assistant technique de CarnetPass.

Tu réponds uniquement à partir du contexte documentaire fourni.

Tu n'inventes jamais une information absente du contexte.

La demande concerne la liste des codes défaut documentés pour cet équipement.

Présente :

1. Un titre clair : "Codes défaut documentés"

2. La liste complète des codes présents dans le contexte, avec pour chaque code sa signification présente dans "meanings"

3. La remarque constructeur présente dans le contexte

4. La source documentaire

N'invente pas la signification des codes si elle n'est pas fournie.

Ne prétends pas que tous les codes sont forcément applicables à cet équipement.

Réponds en français simple et structuré.
`
        : errorCode
          ? `
Tu es l'assistant technique de CarnetPass.

Tu réponds uniquement à partir du contexte documentaire fourni.

Tu n'inventes jamais une information absente du contexte.

Si une opération nécessite un professionnel, tu le précises clairement.

Tu respectes les consignes de sécurité présentes dans le contexte.

Réponds en français simple et structuré.

Distingue :

1. Signification du défaut

2. Causes possibles

3. Vérifications à effectuer

4. Consignes de sécurité

5. Source documentaire
`
          : `
Tu es l'assistant technique documentaire de CarnetPass.

La question du technicien peut décrire un symptôme sans donner de code défaut.

Tu réponds uniquement à partir des passages documentaires récupérés par le RAG.

Tu n'inventes jamais une information absente de ces passages.

IMPORTANT :

Une proximité sémantique n'est pas un diagnostic certain.

Ne prétends jamais qu'un code défaut est confirmé s'il n'est pas réellement affiché sur l'appareil.

Si un ou plusieurs passages semblent correspondre au symptôme :

- présente-les comme des pistes documentaires ;

- indique le ou les codes concernés ;

- explique pourquoi ils peuvent être pertinents ;

- indique les vérifications documentées disponibles ;

- mentionne la page du document lorsque celle-ci est fournie.

Si plusieurs pistes sont possibles, dis-le clairement.

Réponds en français simple, technique et structuré.
`,

      input: `
Équipement :

Marque : ${equipmentData.identity?.brand}

Modèle : ${equipmentData.identity?.model}

Référence constructeur : ${equipmentData.identity?.manufacturerReference}

Question du technicien :

${question}

Contexte documentaire CarnetPass :

${JSON.stringify(context, null, 2)}
`,
    });

    // -----------------------------------------------------
    // 10. REPONSE ENVOYEE A CARNETPASS
    // -----------------------------------------------------

    const answer = aiResponse.output_text;

    return response.status(200).json({
      ok: true,

      answer,

      message:
        "Contexte documentaire CarnetPass retrouvé",

      equipment: {
        carnetPassId: equipmentId,

        brand:
          equipmentData.identity?.brand,

        model:
          equipmentData.identity?.model,

        manufacturerReference:
          equipmentData.identity?.manufacturerReference,
      },

      question,

      context,
    });
  } catch (error) {
    console.error(
      "Erreur API IA CarnetPass :",
      error
    );

    return response.status(500).json({
      error: "Erreur serveur",
    });
  }
}