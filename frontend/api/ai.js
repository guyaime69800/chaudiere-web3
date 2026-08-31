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
//
// Transforme notamment :
//
// F28
// f28
// F.28
// F028
// F.028
// "défaut F28"
//
// en une forme canonique :
//
// F.28
//
// Cela permet à CarnetPass de comparer différentes écritures
// d'un même code constructeur.
// ---------------------------------------------------------

function normalizeErrorCode(input) {
  const text = String(input ?? "")
    .trim()
    .toUpperCase();

  const match = text.match(
    /F\s*\.?\s*(\d{1,3})/
  );

  if (!match) {
    return null;
  }

  const numericCode = Number(match[1]);

  if (!Number.isFinite(numericCode)) {
    return null;
  }

  return `F.${numericCode}`;
}

// ---------------------------------------------------------
// VARIANTES D'UN CODE DEFAUT
// ---------------------------------------------------------
//
// Exemple pour F.28 :
//
// F.28
// F.028
// F28
// F028
//
// Certaines documentations utilisent 2 chiffres,
// d'autres 3 chiffres.
// ---------------------------------------------------------

function buildErrorCodeVariants(
  normalizedCode
) {
  if (!normalizedCode) {
    return [];
  }

  const digits = normalizedCode.replace(
    /^F\./,
    ""
  );

  const numericCode = Number(digits);

  if (!Number.isFinite(numericCode)) {
    return [normalizedCode];
  }

  const shortCode = String(numericCode);

  const paddedCode =
    shortCode.padStart(3, "0");

  return [
    ...new Set([
      `F.${shortCode}`,
      `F.${paddedCode}`,
      `F${shortCode}`,
      `F${paddedCode}`,
    ]),
  ];
}

// ---------------------------------------------------------
// API IA CARNETPASS
// ---------------------------------------------------------

export default async function handler(
  request,
  response
) {
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

    const equipmentId = String(
      body?.equipmentId ?? ""
    ).trim();

    const question = String(
      body?.question ?? ""
    ).trim();

    if (!equipmentId || !question) {
      return response.status(400).json({
        error:
          "Équipement ou question manquant",
      });
    }

    // -----------------------------------------------------
    // 3. RECHERCHE DE L'EQUIPEMENT
    // -----------------------------------------------------

    // Recherche automatiquement l'équipement
    // correspondant à l'identifiant reçu
    // par CarnetPass.

    const equipmentConfig =
      getEquipmentConfig(equipmentId);

    if (!equipmentConfig) {
      return response.status(404).json({
        error:
          "Équipement documentaire introuvable",
      });
    }

    // Récupère les données techniques
    // et les embeddings correspondant
    // uniquement à cet équipement.

    const {
      equipmentData,
      ragEmbeddingData,
    } = equipmentConfig;

    // -----------------------------------------------------
    // 4. ANALYSE DE LA QUESTION
    // -----------------------------------------------------

    const normalizedQuestion =
      String(question ?? "").toLowerCase();

    const wantsErrorCodeList =
      normalizedQuestion.includes(
        "liste des codes"
      ) ||
      normalizedQuestion.includes(
        "codes défaut"
      ) ||
      normalizedQuestion.includes(
        "codes de défaut"
      ) ||
      normalizedQuestion.includes(
        "codes erreur"
      ) ||
      normalizedQuestion.includes(
        "codes d'erreur"
      ) ||
      normalizedQuestion.includes(
        "quels sont les codes"
      );

    // Cherche un éventuel code défaut
    // dans la question.

    const normalizedCode =
      normalizeErrorCode(question);

    const errorCodeVariants =
      buildErrorCodeVariants(
        normalizedCode
      );

    // -----------------------------------------------------
    // 5. RECHERCHE DIRECTE DANS LES DONNEES STRUCTUREES
    // -----------------------------------------------------
    //
    // Si CarnetPass possède déjà une fiche structurée
    // pour ce code, on continue de l'utiliser.
    //
    // Cela préserve le fonctionnement existant
    // de Saunier Duval.
    //
    // La normalisation permet également de considérer
    // F.28 et F.028 comme le même code.
    // -----------------------------------------------------

    const errorCode = normalizedCode
      ? equipmentData.errorCodes?.find(
          (error) =>
            normalizeErrorCode(
              error.code
            ) === normalizedCode
        ) ?? null
      : null;

    // -----------------------------------------------------
    // 6. VERIFICATION DE LA LISTE DES CODES
    // -----------------------------------------------------

    // Pour le moment, la demande d'une liste complète
    // utilise encore l'index structuré existant.

    if (
      wantsErrorCodeList &&
      !equipmentData.errorCodeIndex
    ) {
      return response.status(404).json({
        error:
          "Liste des codes défaut introuvable pour cet équipement",
      });
    }

    // -----------------------------------------------------
    // 7. DECISION DU MODE DE RECHERCHE
    // -----------------------------------------------------
    //
    // On utilise le RAG lorsque :
    //
    // - la question est une question libre ;
    //
    // OU
    //
    // - un code défaut est demandé mais qu'il n'existe
    //   pas encore dans les données structurées.
    //
    // Exemple :
    //
    // Vaillant F28
    //      ↓
    // aucune fiche errorCodes[]
    //      ↓
    // recherche automatique dans la notice constructeur
    // -----------------------------------------------------

    const shouldUseRag =
      !wantsErrorCodeList &&
      !errorCode;

    // -----------------------------------------------------
    // 8. PROTECTION IA - RATE LIMITING
    // -----------------------------------------------------
    //
    // Objectif :
    // maximum 10 requêtes IA par minute
    // et par adresse IP.
    //
    // Cette vérification est faite AVANT :
    //
    // - la génération d'embedding RAG
    // - l'appel au modèle OpenAI
    //
    // Donc une requête bloquée
    // ne déclenche pas de coût IA.
    // -----------------------------------------------------

    const forwardedFor =
      request.headers["x-forwarded-for"];

    const clientIp =
      Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : String(
            forwardedFor ??
              request.headers[
                "x-real-ip"
              ] ??
              request.socket
                ?.remoteAddress ??
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
      } = await aiRateLimit.limit(
        `ip:${clientIp}`
      );

      // Attend l'enregistrement
      // des statistiques Upstash.

      if (pending) {
        await pending;
      }

      // Informations utiles
      // pour le navigateur
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
          Math.ceil(
            (reset - Date.now()) /
              1000
          )
        );

        response.setHeader(
          "Retry-After",
          String(retryAfter)
        );

        return response
          .status(429)
          .json({
            error:
              "Limite temporaire de questions IA atteinte",

            message:
              `Merci de réessayer dans environ ${retryAfter} seconde(s).`,
          });
      }
    } catch (rateLimitError) {
      console.error(
        "Erreur protection rate limiting CarnetPass :",
        rateLimitError
      );

      // Sécurité :
      //
      // si Redis ne répond plus,
      // on bloque temporairement
      // l'Assistant plutôt que
      // de permettre des appels OpenAI
      // sans aucune limitation.

      return response
        .status(503)
        .json({
          error:
            "Assistant IA temporairement indisponible",

          message:
            "La protection de l'Assistant CarnetPass est momentanément indisponible.",
        });
    }

    // -----------------------------------------------------
    // 9. PREPARATION DE LA QUESTION RAG
    // -----------------------------------------------------
    //
    // Lorsqu'un code défaut est détecté,
    // on ajoute automatiquement ses différentes variantes
    // dans la requête sémantique.
    //
    // Exemple :
    //
    // Question utilisateur :
    //
    // f28
    //
    // Recherche documentaire :
    //
    // F.28
    // F.028
    // F28
    // F028
    //
    // Cela permet d'utiliser les documentations
    // de constructeurs qui n'emploient pas
    // tous le même format.
    // -----------------------------------------------------

    const ragQuestion =
      normalizedCode
        ? `${question}

Code défaut recherché :
${normalizedCode}

Variantes possibles dans la documentation constructeur :
${errorCodeVariants.join("\n")}

Recherche uniquement les passages qui concernent réellement ce code ou l'une de ses variantes.`
        : question;

    // -----------------------------------------------------
    // 10. RECHERCHE RAG
    // -----------------------------------------------------

    const ragResult =
      shouldUseRag
        ? await searchRagContext(
            openai,
            ragEmbeddingData,
            ragQuestion,

            // Pour un code défaut,
            // on récupère davantage de passages
            // afin d'avoir :
            //
            // - signification
            // - cause
            // - vérification
            // - page constructeur

            normalizedCode ? 5 : 3
          )
        : null;

    // -----------------------------------------------------
    // 11. CONSTRUCTION DU CONTEXTE
    // -----------------------------------------------------

    const context =
      wantsErrorCodeList
        ? {
            requestType:
              "error_code_list",

            codes:
              equipmentData
                .errorCodeIndex
                .codes ?? [],

            meanings:
              equipmentData
                .errorCodeIndex
                .meanings ?? {},

            note:
              equipmentData
                .errorCodeIndex
                .note ?? null,

            source:
              equipmentData
                .errorCodeIndex
                .source ?? null,
          }
        : errorCode
          ? {
              requestType:
                "error_code_detail",

              code:
                errorCode.code,

              title:
                errorCode.title,

              meaning:
                errorCode
                  .manufacturerData
                  ?.meaning ?? null,

              possibleCauses:
                errorCode
                  .manufacturerData
                  ?.possibleCauses ??
                [],

              professionalChecks:
                errorCode
                  .manufacturerData
                  ?.professionalChecks ??
                [],

              userGuidance:
                errorCode
                  .userGuidance ??
                null,

              source:
                errorCode.source ??
                null,
            }
          : normalizedCode
            ? {
                requestType:
                  "error_code_rag",

                requestedErrorCode:
                  normalizedCode,

                requestedErrorCodeVariants:
                  errorCodeVariants,

                passages:
                  ragResult
                    .topResults,

                contextText:
                  ragResult
                    .contextText,

                queryIntent:
                  ragResult
                    .queryIntent ??
                  "error_code",

                embeddingTokens:
                  ragResult
                    .tokensUsed,
              }
            : {
                requestType:
                  "semantic_rag",

                passages:
                  ragResult
                    .topResults,

                contextText:
                  ragResult
                    .contextText,

                queryIntent:
                  ragResult
                    .queryIntent ??
                  "general",

                embeddingTokens:
                  ragResult
                    .tokensUsed,
              };

    // -----------------------------------------------------
    // 12. INSTRUCTIONS DE L'ASSISTANT
    // -----------------------------------------------------

    let aiInstructions;

    // -----------------------------------------------------
    // LISTE DES CODES
    // -----------------------------------------------------

    if (wantsErrorCodeList) {
      aiInstructions = `
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
`;
    }

    // -----------------------------------------------------
    // CODE DEFAUT DEJA STRUCTURE
    // -----------------------------------------------------

    else if (errorCode) {
      aiInstructions = `
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
`;
    }

    // -----------------------------------------------------
    // CODE DEFAUT RECHERCHE AUTOMATIQUEMENT DANS LE RAG
    // -----------------------------------------------------

    else if (normalizedCode) {
      aiInstructions = `
Tu es l'assistant technique documentaire de CarnetPass.

Le technicien demande des informations sur un code défaut précis.

Ce code n'existe pas encore dans les données structurées de CarnetPass.

Tu dois donc utiliser uniquement les passages de la documentation constructeur récupérés par le RAG.

Le code demandé peut être écrit sous plusieurs formes équivalentes.

Exemple :

F.28
F.028
F28
F028

IMPORTANT :

Ne conclus jamais qu'un passage concerne le code demandé uniquement parce qu'il est sémantiquement proche.

Pour attribuer une signification au code demandé, le passage documentaire doit mentionner explicitement le code ou l'une de ses variantes.

Ne confonds jamais deux codes différents.

Si les passages récupérés ne contiennent pas explicitement le code recherché, réponds clairement :

"Le code demandé n'a pas été retrouvé avec suffisamment de certitude dans les passages documentaires disponibles."

Si le code est explicitement documenté, présente uniquement les informations réellement disponibles.

Structure la réponse ainsi :

1. Code défaut

2. Signification constructeur

3. Causes possibles documentées

4. Vérifications ou mesures documentées

5. Consignes de sécurité si elles sont présentes

6. Page et source documentaire

Si une information n'est pas présente dans la documentation récupérée, indique qu'elle n'est pas précisée.

N'invente jamais une cause, une procédure ou une pièce.

Réponds en français simple, technique et structuré.
`;
    }

    // -----------------------------------------------------
    // QUESTION LIBRE / SYMPTOME / LOCALISATION
    // -----------------------------------------------------

    else {
      aiInstructions = `
Tu es l'assistant technique documentaire de CarnetPass.

La question du technicien peut décrire :

- un symptôme ;
- un composant ;
- une procédure ;
- un réglage ;
- un emplacement ;
- une information technique ;
- ou un problème sans code défaut affiché.

Tu réponds uniquement à partir des passages documentaires récupérés par le RAG.

Tu n'inventes jamais une information absente de ces passages.

IMPORTANT :

Une proximité sémantique n'est pas un diagnostic certain.

Ne prétends jamais qu'un code défaut est confirmé s'il n'est pas réellement affiché sur l'appareil.

Si la question concerne l'emplacement d'un composant :

- privilégie les informations issues des sections "Structure du produit", "bloc hydraulique", "schéma", "repère" ou équivalentes ;

- indique le numéro de repère lorsqu'il est réellement fourni ;

- ne déduis jamais une position physique exacte si le document ne la confirme pas.

Si un ou plusieurs passages semblent correspondre à un symptôme :

- présente-les comme des pistes documentaires ;

- indique le ou les codes concernés lorsqu'ils sont réellement présents ;

- explique pourquoi ils peuvent être pertinents ;

- indique les vérifications documentées disponibles ;

- mentionne la page du document lorsque celle-ci est fournie.

Si plusieurs pistes sont possibles, dis-le clairement.

Réponds en français simple, technique et structuré.
`;
    }

    // -----------------------------------------------------
    // 13. APPEL DE L'ASSISTANT IA
    // -----------------------------------------------------

    const aiResponse =
      await openai.responses.create({
        model: "gpt-5.6-luna",

        instructions:
          aiInstructions,

        input: `
Équipement :

Marque : ${equipmentData.identity?.brand}

Modèle : ${equipmentData.identity?.model}

Référence constructeur : ${equipmentData.identity?.manufacturerReference}

Question du technicien :

${question}

Contexte documentaire CarnetPass :

${JSON.stringify(
  context,
  null,
  2
)}
`,
      });

    // -----------------------------------------------------
    // 14. REPONSE ENVOYEE A CARNETPASS
    // -----------------------------------------------------

    const answer =
      aiResponse.output_text;

    return response
      .status(200)
      .json({
        ok: true,

        answer,

        message:
          "Contexte documentaire CarnetPass retrouvé",

        equipment: {
          carnetPassId:
            equipmentId,

          brand:
            equipmentData
              .identity?.brand,

          model:
            equipmentData
              .identity?.model,

          manufacturerReference:
            equipmentData
              .identity
              ?.manufacturerReference,
        },

        question,

        context,
      });
  } catch (error) {
    console.error(
      "Erreur API IA CarnetPass :",
      error
    );

    return response
      .status(500)
      .json({
        error: "Erreur serveur",
      });
  }
}