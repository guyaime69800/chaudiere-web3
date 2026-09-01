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

// ---------------------------------------------------------
// NORMALISATION DU TEXTE
// ---------------------------------------------------------

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

// ---------------------------------------------------------
// MOTS A IGNORER POUR LA RECHERCHE LEXICALE
// ---------------------------------------------------------

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

// ---------------------------------------------------------
// DETECTION DES QUESTIONS DE LOCALISATION
// ---------------------------------------------------------

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

// ---------------------------------------------------------
// NORMALISATION DES CODES DEFAUT F.xxx
// ---------------------------------------------------------
//
// Exemples équivalents :
//
// F28
// F.28
// F028
// F.028
//
// deviennent tous :
//
// F.28
//
// Cela permet de comparer correctement
// la question du technicien
// avec l'écriture utilisée par le constructeur.
// ---------------------------------------------------------

function normalizeErrorCodeNumber(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return `F.${numericValue}`;
}

// ---------------------------------------------------------
// EXTRACTION DES CODES DEFAUT
// ---------------------------------------------------------
//
// Recherche les codes F dans un texte.
//
// Exemple :
//
// "Erreur F.028 puis F074"
//
// donne :
//
// F.28
// F.74
// ---------------------------------------------------------

function extractErrorCodes(text) {
  const source =
    String(text ?? "").toUpperCase();

  const regex =
    /\bF\s*\.?\s*(\d{1,3})\b/g;

  const codes = new Set();

  let match;

  while ((match = regex.exec(source)) !== null) {
    const normalizedCode =
      normalizeErrorCodeNumber(match[1]);

    if (normalizedCode) {
      codes.add(normalizedCode);
    }
  }

  return [...codes];
}

// ---------------------------------------------------------
// DETECTION D'UNE QUESTION SUR UN CODE DEFAUT
// ---------------------------------------------------------

function isErrorCodeQuestion(question) {
  return extractErrorCodes(question).length > 0;
}

// ---------------------------------------------------------
// BONUS POUR UN CODE DEFAUT EXACT
// ---------------------------------------------------------
//
// Cette partie est essentielle.
//
// Si le technicien demande F28
// et qu'un chunk contient réellement F.028,
// ce chunk doit passer AVANT
// un passage qui parle simplement
// d'un autre défaut ressemblant.
//
// On utilise donc un bonus important.
// ---------------------------------------------------------

function calculateErrorCodeBonus(
  question,
  documentText
) {
  const requestedCodes =
    extractErrorCodes(question);

  if (requestedCodes.length === 0) {
    return {
      requestedCodes: [],
      documentCodes: [],
      matchedCodes: [],
      exactCodeMatch: false,
      errorCodeBonus: 0,
      errorTableBonus: 0,
    };
  }

  const documentCodes =
    extractErrorCodes(documentText);

  const matchedCodes =
    requestedCodes.filter((code) =>
      documentCodes.includes(code)
    );

  const exactCodeMatch =
    matchedCodes.length > 0;

  if (!exactCodeMatch) {
    return {
      requestedCodes,
      documentCodes,
      matchedCodes: [],
      exactCodeMatch: false,
      errorCodeBonus: 0,
      errorTableBonus: 0,
    };
  }

  // -------------------------------------------------------
  // BONUS PRINCIPAL
  // -------------------------------------------------------
  //
  // Un passage contenant réellement
  // le code demandé reçoit un bonus fort.
  // -------------------------------------------------------

  const errorCodeBonus = 0.65;

  // -------------------------------------------------------
  // BONUS TABLEAU / DIAGNOSTIC
  // -------------------------------------------------------
  //
  // Lorsqu'un passage contient également des termes
  // typiques d'un tableau constructeur :
  //
  // Code
  // Signification
  // Cause possible
  // Mesure
  //
  // on le favorise encore davantage.
  // -------------------------------------------------------

  const normalizedDocument =
    normalizeText(documentText);

  const ERROR_TABLE_HINTS = [
    "signification",
    "cause possible",
    "causes possibles",
    "mesure",
    "mesures",
    "code signification",
    "codes de mode de secours",
    "code erreur",
    "code defaut",
    "remede",
    "solution",
  ];

  const hasErrorTableHint =
    ERROR_TABLE_HINTS.some((hint) =>
      normalizedDocument.includes(hint)
    );

  const errorTableBonus =
    hasErrorTableHint ? 0.15 : 0;

  return {
    requestedCodes,
    documentCodes,
    matchedCodes,
    exactCodeMatch,
    errorCodeBonus,
    errorTableBonus,
  };
}

// ---------------------------------------------------------
// RECHERCHE RAG
// ---------------------------------------------------------
//
// Recherche les passages documentaires
// les plus pertinents pour la question.
//
// ragEmbeddingData correspond uniquement
// à l'équipement actuellement consulté.
// ---------------------------------------------------------

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
  // 1. ANALYSE DE LA QUESTION
  // -------------------------------------------------------

  const requestedErrorCodes =
    extractErrorCodes(question);

  const errorCodeQuestion =
    requestedErrorCodes.length > 0;

  const locationQuestion =
    isLocationQuestion(question);

  // -------------------------------------------------------
  // 2. EMBEDDING DE LA QUESTION
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
  // 3. ANALYSE DE TOUS LES CHUNKS
  // -------------------------------------------------------

  const results = ragItems.map((item) => {
    const documentText = [
      item.topic,
      item.section,
      item.text,
    ]
      .filter(Boolean)
      .join("\n");

    // -----------------------------------------------------
    // SCORE SEMANTIQUE
    // -----------------------------------------------------

    const semanticScore =
      cosineSimilarity(
        questionEmbedding,
        item.embedding
      );

    // -----------------------------------------------------
    // SCORE LEXICAL
    // -----------------------------------------------------

    const lexicalScore =
      lexicalSimilarity(
        question,
        documentText
      );

    // -----------------------------------------------------
    // BONUS SELON LE TYPE DE QUESTION
    // -----------------------------------------------------

    const intentBonus =
      calculateIntentBonus(
        question,
        documentText,
        lexicalScore
      );

    // -----------------------------------------------------
    // BONUS CODE DEFAUT
    // -----------------------------------------------------

    const errorCodeAnalysis =
      calculateErrorCodeBonus(
        question,
        documentText
      );

    const {
      matchedCodes,
      exactCodeMatch,
      errorCodeBonus,
      errorTableBonus,
    } = errorCodeAnalysis;

    // -----------------------------------------------------
    // SCORE FINAL
    // -----------------------------------------------------
    //
    // Le sens reste la base du moteur.
    //
    // On ajoute :
    //
    // - un petit bonus lexical ;
    // - un bonus selon l'intention ;
    // - un GROS bonus si le code exact est présent ;
    // - un bonus supplémentaire si le passage ressemble
    //   à un tableau constructeur de diagnostic.
    // -----------------------------------------------------

    const rankingScore =
      semanticScore +
      lexicalScore * 0.08 +
      intentBonus +
      errorCodeBonus +
      errorTableBonus;

    return {
      chunkId: item.chunkId,
      documentId: item.documentId,
      topic: item.topic,
      page: item.page,
      section: item.section,
      text: item.text,

      // Score sémantique historique.
      score: semanticScore,

      // Nouveaux éléments de diagnostic RAG.
      lexicalScore,
      intentBonus,

      exactCodeMatch,
      matchedCodes,
      errorCodeBonus,
      errorTableBonus,

      rankingScore,
    };
  });

  // -------------------------------------------------------
  // 4. CLASSEMENT
  // -------------------------------------------------------
  //
  // IMPORTANT :
  //
  // Si la question contient un code défaut précis,
  // les chunks contenant réellement ce code
  // passent avant les chunks qui ne le contiennent pas.
  //
  // Ensuite seulement,
  // on utilise le score global pour les départager.
  //
  // Cela évite par exemple que F.022
  // soit proposé avant F.028
  // simplement parce que les textes sont proches.
  // -------------------------------------------------------

  results.sort((a, b) => {
    if (
      errorCodeQuestion &&
      a.exactCodeMatch !== b.exactCodeMatch
    ) {
      return a.exactCodeMatch ? -1 : 1;
    }

    return (
      b.rankingScore -
      a.rankingScore
    );
  });

  const topResults =
    results.slice(0, topK);

  // -------------------------------------------------------
  // 5. CONTEXTE ENVOYE A L'IA
  // -------------------------------------------------------

  const contextText = topResults
    .map(
      (result) =>
        `Page : ${result.page}
Section : ${result.section}
Information : ${result.text}`
    )
    .join("\n\n---\n\n");

  // -------------------------------------------------------
  // 6. TYPE DE QUESTION
  // -------------------------------------------------------

  let queryIntent = "general";

  if (errorCodeQuestion) {
    queryIntent = "error_code";
  } else if (locationQuestion) {
    queryIntent = "component_location";
  }

  // -------------------------------------------------------
  // 7. RESULTAT
  // -------------------------------------------------------

  return {
    topResults,
    contextText,

    queryIntent,

    requestedErrorCodes,

    exactErrorCodeFound:
      errorCodeQuestion
        ? topResults.some(
            (result) =>
              result.exactCodeMatch
          )
        : null,

    tokensUsed:
      embeddingResponse.usage
        ?.total_tokens ?? null,
  };
}