import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Embeddings déjà calculés de toute la notice.
const embeddingsPath = path.resolve(
  "src/data/rag/saunier-duval-0020238207-08.full.embeddings.json"
);

const embeddingData = JSON.parse(
  fs.readFileSync(embeddingsPath, "utf8")
);

// Question de test.
// Ici on teste volontairement autre chose qu'un code défaut.
const question = "comment régler la puissance de la pompe ?";

// Similarité cosinus = mesure de proximité entre deux embeddings.
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

// On crée UNIQUEMENT l'embedding de la question.
const questionResponse = await openai.embeddings.create({
  model: embeddingData.model,
  input: question,
});

const questionEmbedding =
  questionResponse.data[0].embedding;

// Comparaison avec les 98 embeddings déjà stockés.
const results = embeddingData.items.map((item) => ({
  chunkId: item.chunkId,
  page: item.page,
  section: item.section,
  score: cosineSimilarity(
    questionEmbedding,
    item.embedding
  ),
  text: item.text,
}));

results.sort((a, b) => b.score - a.score);

const topResults = results.slice(0, 5);

console.log("");
console.log("CarnetPass - Test RAG notice complète");
console.log("------------------------------------");
console.log("Question :", question);
console.log(
  "Embeddings documentaires comparés :",
  embeddingData.items.length
);
console.log(
  "Tokens utilisés pour la question :",
  questionResponse.usage?.total_tokens ?? "inconnu"
);

console.log("");
console.log("Top 5 résultats :");

topResults.forEach((result, index) => {
  console.log("");
  console.log(
    `${index + 1}. Page ${result.page} - score ${result.score.toFixed(4)}`
  );
  console.log(result.text);
});