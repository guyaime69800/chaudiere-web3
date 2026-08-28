import ragEmbeddingData from "../../src/data/rag/saunier-duval-0020238207-08.embeddings.json" with {
  type: "json",
};

// Les embeddings des documents ont déjà été calculés une fois.
const ragItems = ragEmbeddingData.items ?? [];

// Calcule la proximité entre deux embeddings.
// Plus le score est élevé, plus les deux textes sont proches par leur sens.
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
export async function searchRagContext(openai, question, topK = 3) {
  // IMPORTANT :
  // on calcule maintenant uniquement l'embedding de la question.
  // Les embeddings documentaires sont déjà dans le fichier JSON.
  const embeddingResponse = await openai.embeddings.create({
    model: ragEmbeddingData.model ?? "text-embedding-3-small",
    input: question,
  });

  const questionEmbedding =
    embeddingResponse.data[0].embedding;

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

  results.sort((a, b) => b.score - a.score);

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