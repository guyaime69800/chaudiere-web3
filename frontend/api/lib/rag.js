// ---------------------------------------------------------
// CARNETPASS - MOTEUR RAG
// Recherche sémantique + amélioration de pertinence
// ---------------------------------------------------------

// Calcule la proximité entre deux embeddings.
//
// Plus le score est élevé,
// plus les deux textes sont proches par leur sens.
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  const denominator =
    Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);

  if (!denominator) {
    return 0;
  }

  return dotProduct / denominator;
}

// Normalise un texte pour faciliter
// les comparaisons lexicales.
function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Mots très fréquents que l'on ne veut pas utiliser
// pour calculer la pertinence lexicale.
const STOP_WORDS = new Set([
  "avec",
  "dans",
  "des",
  "les",
  "une",
  "pour",
  "est",
  "sont",
  "sur",
  "quel",
  "quelle",
  "quels",
  "quelles",
  "comment",
  "quoi",
  "cela",
  "cette",
  "cet",
  "ces",
  "peut",
  "dois",
  "doit",
  "faire",
  "trouve",
  "trouver",
]);

function extractKeywords(text) {
  return [
    ...new Set(
      normalizeText(text)
        .split(" ")
        .filter(
          (word) =>
            word.length >= 3 &&
            !STOP_WORDS.has(word)
        )
    ),
  ];
}

// Mesure combien de mots importants de la question
// sont réellement présents dans le passage documentaire.
function lexicalSimilarity(question, documentText) {
  const keywords = extractKeywords(question);

  if (keywords.length === 0) {
    return 0;
  }

  const normalizedDocument =
    normalizeText(documentText);

  const matches = keywords.filter((keyword) =>
    normalizedDocument.includes(keyword)
  ).length;

  return matches / keywords.length;
}

// Détecte les questions qui cherchent
// l'emplacement physique d'un composant.
function isLocationQuestion(question) {
  const text = normalizeText(question);

  return (
    text.includes("ou se trouve") ||
    text.includes("ou est") ||
    text.includes("emplacement") ||
    text.includes("localiser") ||
    text.includes("localisation") ||
    text.includes("position") ||
    text.includes("repere")
  );
}

// Pour une question de localisation,
// certains types de passages sont beaucoup plus utiles
// qu'une page de codes défauts.
const LOCATION_HINTS = [
  "structure du produit",
  "structure du bloc hydraulique",
  "vue d ensemble",
  "emplacement",
  "position",
  "repere",
  "schema",
  "composant",
  "composants",
];

// Calcule un bonus documentaire lorsque le passage
// correspond au type de question posé.
function calculateIntentBonus(
  question,
  documentText,
  lexicalScore
) {
  if (!isLocationQuestion(question)) {
    return 0;
  }

  // On ne favorise pas une page de structure
  // si elle ne contient aucun élément pertinent
  // par rapport à la question.
  if (lexicalScore <= 0) {
    return 0;
  }

  const text = normalizeText(documentText);

  const hasLocationHint = LOCATION_HINTS.some(
    (hint) => text.includes(hint)
  );

  return hasLocationHint ? 0.12 : 0;
}

// Recherche les passages documentaires
// les plus pertinents pour la question.
//
// ragEmbeddingData correspond uniquement
// à l'équipement actuellement consulté.
export async function searchRagContext(
  openai,
  ragEmbeddingData,
  question,
  topK = 3
) {
  const ragItems =
    ragEmbeddingData?.items ?? [];

  if (ragItems.length === 0) {
    throw new Error(
      "Aucun embedding RAG disponible pour cet équipement"
    );
  }

  // -------------------------------------------------------
  // 1. EMBEDDING DE LA QUESTION
  // -------------------------------------------------------

  const embeddingResponse =
    await openai.embeddings.create({
      model:
        ragEmbeddingData.model ??
        "text-embedding-3-small",

      input: question,
    });

  const questionEmbedding =
    embeddingResponse.data[0].embedding;

  // -------------------------------------------------------
  // 2. ANALYSE DE TOUS LES CHUNKS
  // -------------------------------------------------------

  const results = ragItems.map((item) => {
    const documentText = [
      item.topic,
      item.section,
      item.text,
    ]
      .filter(Boolean)
      .join("\n");

    const semanticScore =
      cosineSimilarity(
        questionEmbedding,
        item.embedding
      );

    const lexicalScore =
      lexicalSimilarity(
        question,
        documentText
      );

    const intentBonus =
      calculateIntentBonus(
        question,
        documentText,
        lexicalScore
      );

    // Le sens reste la base du moteur.
    //
    // On ajoute seulement :
    // - un petit bonus lexical ;
    // - un bonus spécifique au type de question.
    const rankingScore =
      semanticScore +
      lexicalScore * 0.08 +
      intentBonus;

    return {
      chunkId: item.chunkId,
      documentId: item.documentId,
      topic: item.topic,
      page: item.page,
      section: item.section,
      text: item.text,

      score: semanticScore,
      lexicalScore,
      intentBonus,
      rankingScore,
    };
  });

  // -------------------------------------------------------
  // 3. CLASSEMENT
  // -------------------------------------------------------

  results.sort(
    (a, b) =>
      b.rankingScore -
      a.rankingScore
  );

  const topResults =
    results.slice(0, topK);

  // -------------------------------------------------------
  // 4. CONTEXTE ENVOYÉ À L'IA
  // -------------------------------------------------------

  const contextText = topResults
    .map(
      (result) =>
        `Page : ${result.page}
Section : ${result.section}
Information : ${result.text}`
    )
    .join("\n\n---\n\n");

  return {
    topResults,
    contextText,

    queryIntent:
      isLocationQuestion(question)
        ? "component_location"
        : "general",

    tokensUsed:
      embeddingResponse.usage
        ?.total_tokens ?? null,
  };
}