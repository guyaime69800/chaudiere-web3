import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const chunksPath = path.resolve(
  "frontend/src/data/rag/saunier-duval-0020238207-08.chunks.json"
);

const chunks = JSON.parse(
  fs.readFileSync(chunksPath, "utf8")
);

const question = "le moteur d'extraction ne tourne plus";

const texts = [
  question,
  ...chunks.map((chunk) => chunk.text),
];

const response = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: texts,
});

const questionEmbedding = response.data[0].embedding;

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

const results = chunks.map((chunk, index) => {
  const chunkEmbedding = response.data[index + 1].embedding;

  return {
    topic: chunk.topic,
    page: chunk.page,
    section: chunk.section,
    score: cosineSimilarity(
      questionEmbedding,
      chunkEmbedding
    ),
    text: chunk.text,
  };
});

results.sort((a, b) => b.score - a.score);

console.log("Question :", question);
console.log("Chunks comparés :", chunks.length);
console.log("Tokens utilisés :", response.usage.total_tokens);
console.log("");
const topResults = results.slice(0, 3);

console.log("Top 3 résultats :");

topResults.forEach((result, index) => {
  console.log(
    `${index + 1}. ${result.topic} - score : ${result.score.toFixed(4)} - page ${result.page}`
  );
});
const context = topResults
  .map(
    (result) =>
      `Code : ${result.topic}
Page : ${result.page}
Section : ${result.section}
Information : ${result.text}`
  )
  .join("\n\n---\n\n");

console.log("");
console.log("Contexte qui sera envoyé à l'IA :");
console.log("");
console.log(context);
const aiResponse = await openai.responses.create({
  model: "gpt-5.6-luna",

  instructions: `
Tu es l'assistant technique de CarnetPass.

Tu réponds uniquement à partir du contexte documentaire fourni.

Tu ne dois jamais inventer une information absente du contexte.

La question peut décrire un symptôme sans donner de code défaut.
Dans ce cas, ne prétends pas avoir identifié avec certitude un code défaut.

Utilise les passages récupérés pour indiquer les pistes documentaires les plus pertinentes.

Si plusieurs codes peuvent correspondre au symptôme, explique-le clairement.

Réponds en français simple et structuré.
`,

  input: `
QUESTION DU TECHNICIEN :

${question}

CONTEXTE DOCUMENTAIRE RÉCUPÉRÉ :

${context}
`,
});

console.log("");
console.log("Réponse IA CarnetPass :");
console.log("");
console.log(aiResponse.output_text);