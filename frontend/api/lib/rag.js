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

  return (
    dotProduct /
    (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB))
  );
}

// Recherche les passages documentaires les plus proches
// de la question posée par le technicien.
//
// ragEmbeddingData est fourni par la configuration
// de l'équipement concerné.
export async function searchRagContext(
  openai,
  ragEmbeddingData,
  question,
  topK = 3
) {
  const ragItems = ragEmbeddingData?.items ?? [];

  // Sécurité : si aucun embedding n'est disponible,
  // on arrête proprement la recherche.
  if (ragItems.length === 0) {
    throw new Error(
      "Aucun embedding RAG disponible pour cet équipement"
    );
  }

  // Création de l'embedding de la question.
  const embeddingResponse = await openai.embeddings.create({
    model:
      ragEmbeddingData.model ??
      "text-embedding-3-small",
    input: question,
  });

  const questionEmbedding =
    embeddingResponse.data[0].embedding;

  // Compare la question avec tous les passages
  // documentaires de cet équipement.
  const results = ragItems.map((item) => ({
    chunkId: item.chunkId,
    documentId: item.documentId,
    topic: item.topic,
    page: item.page,
    section: item.section,
    text: item.text,

    score: cosineSimilarity(
      questionEmbedding,
      item.embedding
    ),
  }));

  // Classe les résultats du plus pertinent
  // au moins pertinent.
  results.sort((a, b) => b.score - a.score);

  // Top-K = les K meilleurs résultats.
  const topResults = results.slice(0, topK);

  const contextText = topResults
    .map(
      (result) =>
        `Code : ${result.topic}
Page : ${result.page}
Section : ${result.section}
Information : ${result.text}`
    )
    .join("\n\n---\n\n");

  return {
    topResults,
    contextText,

    tokensUsed:
      embeddingResponse.usage?.total_tokens ?? null,
  };
}