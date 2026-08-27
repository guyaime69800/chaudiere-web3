import ragChunks from "../../src/data/rag/saunier-duval-0020238207-08.chunks.json" with {
  type: "json",
};

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
  const texts = [
    question,
    ...ragChunks.map((chunk) => chunk.text),
  ];

  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });

  const questionEmbedding =
    embeddingResponse.data[0].embedding;

  const results = ragChunks.map((chunk, index) => {
    const chunkEmbedding =
      embeddingResponse.data[index + 1].embedding;

    return {
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      topic: chunk.topic,
      page: chunk.page,
      section: chunk.section,
      text: chunk.text,
      score: cosineSimilarity(
        questionEmbedding,
        chunkEmbedding
      ),
    };
  });

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