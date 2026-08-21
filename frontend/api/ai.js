import OpenAI from "openai";
import equipmentData from "../src/data/equipment/saunier-duval-0010017388.json" with {
  type: "json",
};
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
// Transforme F28, f28, F.28 ou "défaut F28" en "F.28".
function normalizeErrorCode(input) {
  const text = String(input ?? "").trim().toUpperCase();

  const match = text.match(/F\s*\.?\s*(\d{1,3})/);

  if (!match) {
    return null;
  }

  return `F.${match[1]}`;
}

export default async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return response.status(405).json({
        error: "Méthode non autorisée",
      });
    }

    const body = request.body ?? {};

    const equipmentId = String(body?.equipmentId ?? "").trim();
    const question = String(body?.question ?? "").trim();

    if (!equipmentId || !question) {
      return response.status(400).json({
        error: "Équipement ou question manquant",
      });
    }

    // Vérifie que la question concerne bien
    // l'équipement documentaire chargé.
    const equipmentMatches =
      equipmentData.carnetPass?.linkedIds?.includes(equipmentId) ||
      equipmentData.equipmentId === equipmentId ||
      equipmentData.identity?.manufacturerReference === equipmentId;

    if (!equipmentMatches) {
      return response.status(404).json({
        error: "Équipement documentaire introuvable",
      });
    }

    // Cherche un code défaut dans la question du technicien.
    const normalizedCode = normalizeErrorCode(question);

    if (!normalizedCode) {
      return response.status(422).json({
        error: "Aucun code défaut reconnu dans la question",
      });
    }

    // Recherche le code défaut uniquement
    // dans les données du bon équipement.
    const errorCode =
      equipmentData.errorCodes?.find(
        (error) => error.code.toUpperCase() === normalizedCode
      ) ?? null;

    if (!errorCode) {
      return response.status(404).json({
        error: `Code défaut ${normalizedCode} introuvable pour cet équipement`,
      });
    }

    // Premier contexte documentaire destiné au futur LLM.
    const context = {
      code: errorCode.code,
      title: errorCode.title,
      meaning: errorCode.manufacturerData?.meaning ?? null,
      possibleCauses: errorCode.manufacturerData?.possibleCauses ?? [],
      professionalChecks:
        errorCode.manufacturerData?.professionalChecks ?? [],
      userGuidance: errorCode.userGuidance ?? null,
      source: errorCode.source ?? null,
    };
    const aiResponse = await openai.responses.create({
      model: "gpt-5.6-luna",

      instructions: `
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

    const answer = aiResponse.output_text;
    return response.status(200).json({
      ok: true,
      answer,
      message: "Contexte documentaire CarnetPass retrouvé",
      equipment: {
        carnetPassId: equipmentId,
        brand: equipmentData.identity?.brand,
        model: equipmentData.identity?.model,
        manufacturerReference:
          equipmentData.identity?.manufacturerReference,
      },
      question,
      context,
    });
  } catch (error) {
    console.error("Erreur API IA CarnetPass :", error);

    return response.status(500).json({
      error: "Erreur serveur",
    });
  }
}