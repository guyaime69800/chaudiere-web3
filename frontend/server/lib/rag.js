// ---------------------------------------------------------
// CARNETPASS - MOTEUR RAG MULTI-DOCUMENTS
// ---------------------------------------------------------
//
// Objectifs :
//
// - recherche sémantique ;
// - recherche lexicale ;
// - priorité aux codes défaut exacts ;
// - détection des questions de localisation ;
// - détection des questions sur les pièces / références ;
// - exploitation automatique des vues éclatées ;
// - diversité documentaire : notice + vue éclatée ;
// - éviter qu'une notice monopolise tout le Top-K.
//
// ---------------------------------------------------------

// ---------------------------------------------------------
// SIMILARITÉ COSINUS
// ---------------------------------------------------------

function cosineSimilarity(a, b) {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.length === 0 ||
    b.length === 0 ||
    a.length !== b.length
  ) {
    return 0;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  const denominator =
    Math.sqrt(magnitudeA) *
    Math.sqrt(magnitudeB);

  if (!denominator) {
    return 0;
  }

  return dotProduct / denominator;
}

// ---------------------------------------------------------
// NORMALISATION TEXTE
// ---------------------------------------------------------

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
// STOP WORDS
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
  "avoir",
  "avait",
  "mon",
  "ma",
  "mes",
  "son",
  "sa",
  "ses",
  "qui",
  "que",
  "quoi",
  "dont",
  "afin",
  "apres",
  "avant",
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

// ---------------------------------------------------------
// SIMILARITÉ LEXICALE
// ---------------------------------------------------------

function lexicalSimilarity(
  question,
  documentText
) {
  const keywords =
    extractKeywords(question);

  if (keywords.length === 0) {
    return 0;
  }

  const normalizedDocument =
    normalizeText(documentText);

  const matches =
    keywords.filter((keyword) =>
      normalizedDocument.includes(keyword)
    ).length;

  return matches / keywords.length;
}

// ---------------------------------------------------------
// QUESTIONS DE LOCALISATION
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
    text.includes("repere") ||
    text.includes("numero de repere") ||
    text.includes("quel repere")
  );
}

const LOCATION_HINTS = [
  "structure du produit",
  "structure du bloc hydraulique",
  "vue d ensemble",
  "vue eclatee",
  "emplacement",
  "position",
  "repere",
  "schema",
  "composant",
  "composants",
];

// ---------------------------------------------------------
// QUESTIONS PIÈCES / RÉFÉRENCES
// ---------------------------------------------------------

function isPartReferenceQuestion(question) {
  const text = normalizeText(question);

  return (
    text.includes("reference") ||
    text.includes("ref piece") ||
    text.includes("piece detachee") ||
    text.includes("piece de rechange") ||
    text.includes("reference constructeur") ||
    text.includes("reference du capteur") ||
    text.includes("reference de remplacement") ||
    text.includes("remplacement") ||
    text.includes("remplacer") ||
    text.includes("quelle piece") ||
    text.includes("quel capteur") ||
    text.includes("designation") ||
    text.includes("vue eclatee") ||
    text.includes("repere")
  );
}

const PART_HINTS = [
  "reference",
  "ref.",
  "ref ",
  "designation",
  "piece",
  "piece detachee",
  "piece de rechange",
  "remplacement",
  "remplacer",
  "repere",
  "vue eclatee",
  "capteur",
  "pompe",
  "vanne",
  "moteur",
  "electrode",
  "echangeur",
  "circulateur",
  "ventilateur",
];

// ---------------------------------------------------------
// DÉTECTION TYPE DE DOCUMENT
// ---------------------------------------------------------

function inferDocumentType(item) {
  const explicitType =
    item?.documentType;

  if (explicitType) {
    const normalized =
      normalizeText(explicitType);

    if (
      normalized.includes("exploded") ||
      normalized.includes("eclatee")
    ) {
      return "exploded_view";
    }

    if (
      normalized.includes("installation") &&
      normalized.includes("maintenance")
    ) {
      return "installation_maintenance";
    }

    return explicitType;
  }

  const source = normalizeText(
    [
      item?.documentId,
      item?.topic,
      item?.section,
      item?.title,
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (
    source.includes("exploded-view") ||
    source.includes("exploded view") ||
    source.includes("vue eclatee") ||
    source.includes("eclatee")
  ) {
    return "exploded_view";
  }

  if (
    source.includes(
      "installation-maintenance"
    ) ||
    source.includes(
      "installation maintenance"
    )
  ) {
    return "installation_maintenance";
  }

  return "unknown";
}

// ---------------------------------------------------------
// BONUS LOCALISATION
// ---------------------------------------------------------

function calculateLocationBonus(
  question,
  documentText,
  lexicalScore,
  documentType
) {
  if (!isLocationQuestion(question)) {
    return 0;
  }

  const text =
    normalizeText(documentText);

  let bonus = 0;

  const hasLocationHint =
    LOCATION_HINTS.some((hint) =>
      text.includes(hint)
    );

  if (
    hasLocationHint &&
    lexicalScore > 0
  ) {
    bonus += 0.12;
  }

  // Une vue éclatée est particulièrement
  // utile pour localiser une pièce.
  if (
    documentType === "exploded_view"
  ) {
    bonus += 0.30;
  }

  return bonus;
}

// ---------------------------------------------------------
// BONUS PIÈCE / RÉFÉRENCE
// ---------------------------------------------------------

function calculatePartBonus(
  question,
  documentText,
  lexicalScore,
  documentType
) {
  if (!isPartReferenceQuestion(question)) {
    return 0;
  }

  const text =
    normalizeText(documentText);

  let bonus = 0;

  // Très important :
  // lorsqu'une référence de pièce est demandée,
  // on favorise franchement la vue éclatée.
  if (
    documentType === "exploded_view"
  ) {
    bonus += 0.45;
  }

  const hintMatches =
    PART_HINTS.filter((hint) =>
      text.includes(hint)
    ).length;

  if (hintMatches > 0) {
    bonus += Math.min(
      0.18,
      hintMatches * 0.035
    );
  }

  if (lexicalScore > 0.25) {
    bonus += 0.05;
  }

  return bonus;
}

// ---------------------------------------------------------
// NORMALISATION CODES DÉFAUT
// ---------------------------------------------------------

function normalizeErrorCodeNumber(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return `F.${numericValue}`;
}

// ---------------------------------------------------------
// EXTRACTION CODES DÉFAUT
// ---------------------------------------------------------

function extractErrorCodes(text) {
  const source =
    String(text ?? "").toUpperCase();

  const regex =
    /\bF\s*\.?\s*(\d{1,3})\b/g;

  const codes = new Set();

  let match;

  while (
    (match = regex.exec(source)) !== null
  ) {
    const normalizedCode =
      normalizeErrorCodeNumber(
        match[1]
      );

    if (normalizedCode) {
      codes.add(normalizedCode);
    }
  }

  return [...codes];
}

// ---------------------------------------------------------
// BONUS CODE DÉFAUT
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

  // Très gros bonus pour le code exact.
  const errorCodeBonus = 0.65;

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
    hasErrorTableHint
      ? 0.15
      : 0;

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
// NORMALISATION DES SOURCES RAG
// ---------------------------------------------------------
//
// Compatible avec :
//
// 1. ancien format :
//    { model, items: [...] }
//
// 2. tableau de documents :
//    [ragNotice, ragVueEclatee]
//
// 3. structure multi-documents :
//    { documents: [...] }
//
// ---------------------------------------------------------

function getRagSources(
  ragEmbeddingData
) {
  if (!ragEmbeddingData) {
    return [];
  }

  if (
    Array.isArray(ragEmbeddingData)
  ) {
    return ragEmbeddingData;
  }

  if (
    Array.isArray(
      ragEmbeddingData.documents
    )
  ) {
    return ragEmbeddingData.documents;
  }

  if (
    Array.isArray(
      ragEmbeddingData.ragDocuments
    )
  ) {
    return ragEmbeddingData.ragDocuments;
  }

  return [ragEmbeddingData];
}

function getRagItems(
  ragEmbeddingData
) {
  const sources =
    getRagSources(ragEmbeddingData);

  const items = [];

  for (const source of sources) {
    const sourceItems =
      source?.items ?? [];

    for (const item of sourceItems) {
      items.push({
        ...item,

        documentType:
          item.documentType ??
          source.documentType ??
          source.metadata
            ?.documentType ??
          inferDocumentType(item),

        ragModel:
          source.model ?? null,
      });
    }
  }

  return items;
}

function getEmbeddingModel(
  ragEmbeddingData
) {
  const sources =
    getRagSources(ragEmbeddingData);

  for (const source of sources) {
    if (source?.model) {
      return source.model;
    }
  }

  return "text-embedding-3-small";
}

// ---------------------------------------------------------
// IDENTIFIANT UNIQUE CHUNK
// ---------------------------------------------------------

function getResultKey(result) {
  return [
    result.documentId ?? "document",
    result.chunkId ?? "chunk",
    result.page ?? "page",
  ].join("::");
}

// ---------------------------------------------------------
// SÉLECTION MULTI-DOCUMENTS
// ---------------------------------------------------------
//
// C'est la partie importante de cette correction.
//
// Exemple question :
//
// "J'ai F22, que vérifier et quelle est
//  la référence du capteur de pression ?"
//
// On veut obligatoirement :
//
// - au moins un passage F22 de la notice ;
// - au moins un passage de la vue éclatée ;
// - puis compléter avec les meilleurs résultats.
//
// ---------------------------------------------------------

function selectDiverseResults(
  results,
  {
    topK,
    errorCodeQuestion,
    partReferenceQuestion,
    locationQuestion,
  }
) {
  const selected = [];
  const selectedKeys =
    new Set();

  function add(result) {
    if (!result) {
      return;
    }

    const key =
      getResultKey(result);

    if (
      selectedKeys.has(key)
    ) {
      return;
    }

    selectedKeys.add(key);
    selected.push(result);
  }

  // -------------------------------------------------------
  // 1. CODE DÉFAUT EXACT
  // -------------------------------------------------------

  if (errorCodeQuestion) {
    const exactCodeResult =
      results.find(
        (result) =>
          result.exactCodeMatch
      );

    add(exactCodeResult);
  }

  // -------------------------------------------------------
  // 2. VUE ÉCLATÉE
  // -------------------------------------------------------
  //
  // Si la question demande :
  //
  // - une référence ;
  // - un remplacement ;
  // - un repère ;
  // - un emplacement ;
  //
  // on réserve une place à la meilleure
  // information provenant d'une vue éclatée.
  // -------------------------------------------------------

  if (
    partReferenceQuestion ||
    locationQuestion
  ) {
    const explodedViewResult =
      results.find(
        (result) =>
          result.documentType ===
          "exploded_view"
      );

    add(explodedViewResult);
  }

  // -------------------------------------------------------
  // 3. DIVERSITÉ DOCUMENTAIRE
  // -------------------------------------------------------
  //
  // Si plusieurs documents existent,
  // on essaye de ne pas envoyer uniquement
  // trois chunks issus du même PDF.
  // -------------------------------------------------------

  const selectedDocumentIds =
    new Set(
      selected
        .map(
          (result) =>
            result.documentId
        )
        .filter(Boolean)
    );

  if (
    selected.length < topK
  ) {
    const diverseCandidate =
      results.find((result) => {
        if (!result.documentId) {
          return false;
        }

        return (
          !selectedDocumentIds.has(
            result.documentId
          ) &&
          !selectedKeys.has(
            getResultKey(result)
          )
        );
      });

    if (diverseCandidate) {
      add(diverseCandidate);

      selectedDocumentIds.add(
        diverseCandidate.documentId
      );
    }
  }

  // -------------------------------------------------------
  // 4. COMPLÉTER AVEC LE CLASSEMENT GLOBAL
  // -------------------------------------------------------

  for (const result of results) {
    if (
      selected.length >= topK
    ) {
      break;
    }

    add(result);
  }

  return selected.slice(
    0,
    topK
  );
}

// ---------------------------------------------------------
// RECHERCHE RAG
// ---------------------------------------------------------

export async function searchRagContext(
  openai,
  ragEmbeddingData,
  question,
  topK = 4
) {
  // -------------------------------------------------------
  // 1. RÉCUPÉRER TOUS LES CHUNKS
  // -------------------------------------------------------

  const ragItems =
    getRagItems(
      ragEmbeddingData
    );

  if (
    ragItems.length === 0
  ) {
    throw new Error(
      "Aucun embedding RAG disponible pour cet équipement"
    );
  }

  // -------------------------------------------------------
  // 2. ANALYSER LA QUESTION
  // -------------------------------------------------------

  const requestedErrorCodes =
    extractErrorCodes(question);

  const errorCodeQuestion =
    requestedErrorCodes.length > 0;

  const locationQuestion =
    isLocationQuestion(question);

  const partReferenceQuestion =
    isPartReferenceQuestion(
      question
    );

  // -------------------------------------------------------
  // 3. EMBEDDING DE LA QUESTION
  // -------------------------------------------------------

  const model =
    getEmbeddingModel(
      ragEmbeddingData
    );

  const embeddingResponse =
    await openai.embeddings.create({
      model,
      input: question,
    });

  const questionEmbedding =
    embeddingResponse
      .data?.[0]
      ?.embedding;

  if (!questionEmbedding) {
    throw new Error(
      "Embedding de la question introuvable"
    );
  }

  // -------------------------------------------------------
  // 4. ANALYSER TOUS LES CHUNKS
  // -------------------------------------------------------

  const results =
    ragItems.map((item) => {
      const documentType =
        inferDocumentType(item);

      const documentText = [
        item.topic,
        item.section,
        item.text,
      ]
        .filter(Boolean)
        .join("\n");

      // Score sémantique.
      const semanticScore =
        cosineSimilarity(
          questionEmbedding,
          item.embedding
        );

      // Score lexical.
      const lexicalScore =
        lexicalSimilarity(
          question,
          documentText
        );

      // Bonus localisation.
      const locationBonus =
        calculateLocationBonus(
          question,
          documentText,
          lexicalScore,
          documentType
        );

      // Bonus pièce / référence.
      const partBonus =
        calculatePartBonus(
          question,
          documentText,
          lexicalScore,
          documentType
        );

      // Bonus code défaut.
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

      // ---------------------------------------------------
      // SCORE GLOBAL
      // ---------------------------------------------------

      const rankingScore =
        semanticScore +
        lexicalScore * 0.08 +
        locationBonus +
        partBonus +
        errorCodeBonus +
        errorTableBonus;

      return {
        chunkId:
          item.chunkId,

        documentId:
          item.documentId,

        documentType,

        topic:
          item.topic,

        page:
          item.page,

        section:
          item.section,

        text:
          item.text,

        score:
          semanticScore,

        lexicalScore,

        locationBonus,

        partBonus,

        exactCodeMatch,

        matchedCodes,

        errorCodeBonus,

        errorTableBonus,

        rankingScore,
      };
    });

  // -------------------------------------------------------
  // 5. CLASSEMENT GLOBAL
  // -------------------------------------------------------

  results.sort((a, b) => {
    // Lorsqu'un code exact est demandé,
    // les chunks qui contiennent réellement
    // ce code restent prioritaires.
    if (
      errorCodeQuestion &&
      a.exactCodeMatch !==
        b.exactCodeMatch
    ) {
      return a.exactCodeMatch
        ? -1
        : 1;
    }

    return (
      b.rankingScore -
      a.rankingScore
    );
  });

  // -------------------------------------------------------
  // 6. TOP-K MULTI-DOCUMENTS
  // -------------------------------------------------------

  const topResults =
    selectDiverseResults(
      results,
      {
        topK,
        errorCodeQuestion,
        partReferenceQuestion,
        locationQuestion,
      }
    );

  // -------------------------------------------------------
  // 7. CONTEXTE ENVOYÉ À L'IA
  // -------------------------------------------------------
  //
  // On précise maintenant explicitement
  // la provenance de chaque passage.
  //
  // Ainsi l'IA sait par exemple :
  //
  // - ceci vient de la notice ;
  // - ceci vient de la vue éclatée.
  //
  // -------------------------------------------------------

  const contextText =
    topResults
      .map(
        (result) =>
          `Source documentaire :
Type : ${result.documentType}
Document : ${result.documentId}
Page : ${result.page}
Section : ${result.section}

Information :
${result.text}`
      )
      .join(
        "\n\n----------------------------------------\n\n"
      );

  // -------------------------------------------------------
  // 8. INTENTION DE LA QUESTION
  // -------------------------------------------------------

  let queryIntent =
    "general";

  if (
    errorCodeQuestion &&
    partReferenceQuestion
  ) {
    queryIntent =
      "error_code_and_part_reference";
  } else if (
    errorCodeQuestion &&
    locationQuestion
  ) {
    queryIntent =
      "error_code_and_component_location";
  } else if (
    errorCodeQuestion
  ) {
    queryIntent =
      "error_code";
  } else if (
    partReferenceQuestion
  ) {
    queryIntent =
      "part_reference";
  } else if (
    locationQuestion
  ) {
    queryIntent =
      "component_location";
  }

  // -------------------------------------------------------
  // 9. DOCUMENTS UTILISÉS
  // -------------------------------------------------------

  const documentCoverage = [
    ...new Set(
      topResults
        .map(
          (result) =>
            result.documentId
        )
        .filter(Boolean)
    ),
  ];

  const documentTypeCoverage = [
    ...new Set(
      topResults
        .map(
          (result) =>
            result.documentType
        )
        .filter(Boolean)
    ),
  ];

  // -------------------------------------------------------
  // 10. RÉSULTAT
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

    documentCoverage,

    documentTypeCoverage,

    multiDocumentContext:
      documentCoverage.length > 1,

    tokensUsed:
      embeddingResponse.usage
        ?.total_tokens ??
      null,
  };
}