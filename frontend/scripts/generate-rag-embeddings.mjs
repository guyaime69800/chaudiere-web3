import fs from "fs";
import path from "path";
import OpenAI from "openai";

// OpenAI récupère la clé depuis OPENAI_API_KEY.
// La clé n'est jamais écrite dans le fichier généré.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Fichier contenant nos 43 chunks documentaires.
const chunksPath = path.resolve(
  "frontend/src/data/rag/saunier-duval-0020238207-08.chunks.json"
);

// Futur fichier contenant les chunks + leurs embeddings pré-calculés.
const outputPath = path.resolve(
  "frontend/src/data/rag/saunier-duval-0020238207-08.embeddings.json"
);

// Lecture des chunks.
const chunks = JSON.parse(
  fs.readFileSync(chunksPath, "utf8")
);

console.log("Chunks à transformer en embeddings :", chunks.length);

// On envoie seulement les textes des chunks.
// Il n'y a PAS de question utilisateur ici.
const texts = chunks.map((chunk) => chunk.text);

// Création des embeddings en une seule requête.
const response = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: texts,
});

// On associe chaque embedding à son chunk d'origine.
const items = chunks.map((chunk, index) => ({
  ...chunk,
  embedding: response.data[index].embedding,
}));

// Informations utiles pour savoir comment le fichier a été créé.
const embeddingData = {
  model: "text-embedding-3-small",
  generatedAt: new Date().toISOString(),
  chunkCount: items.length,
  items,
};

// Écriture du fichier JSON.
fs.writeFileSync(
  outputPath,
  JSON.stringify(embeddingData, null, 2),
  "utf8"
);

console.log("");
console.log("Fichier embeddings généré :", outputPath);
console.log("Nombre d'embeddings :", items.length);
console.log(
  "Dimensions d'un embedding :",
  items[0]?.embedding?.length ?? 0
);
console.log(
  "Tokens utilisés pour ce pré-calcul :",
  response.usage?.total_tokens ?? "inconnu"
);