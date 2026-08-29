import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Chunks provenant de toute la notice.
const chunksPath = path.resolve(
  "src/data/rag/saunier-duval-0020238207-08.full.chunks.json"
);

// Nouveau fichier d'embeddings.
// On conserve les anciens embeddings pour le moment.
const outputPath = path.resolve(
  "src/data/rag/saunier-duval-0020238207-08.full.embeddings.json"
);

const chunks = JSON.parse(
  fs.readFileSync(chunksPath, "utf8")
);

console.log("");
console.log("CarnetPass - Embeddings notice complète");
console.log("---------------------------------------");
console.log("Chunks à traiter :", chunks.length);

const texts = chunks.map((chunk) => chunk.text);

const response = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: texts,
});

const items = chunks.map((chunk, index) => ({
  ...chunk,
  embedding: response.data[index].embedding,
}));

const embeddingData = {
  model: "text-embedding-3-small",
  generatedAt: new Date().toISOString(),
  chunkCount: items.length,
  items,
};

fs.writeFileSync(
  outputPath,
  JSON.stringify(embeddingData, null, 2),
  "utf8"
);

console.log("");
console.log("Embeddings générés ✅");
console.log("Nombre d'embeddings :", items.length);
console.log(
  "Dimensions :",
  items[0]?.embedding?.length ?? 0
);
console.log(
  "Tokens utilisés :",
  response.usage?.total_tokens ?? "inconnu"
);
console.log("Fichier créé :", outputPath);