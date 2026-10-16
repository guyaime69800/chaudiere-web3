import fs from "fs";
import path from "path";
import OpenAI from "openai";

// ---------------------------------------------------------
// PARAMÈTRES
// ---------------------------------------------------------
//
// Exemple :
// node scripts/generate-full-rag-embeddings.mjs \
// src/data/rag/saunier-duval-0020238207-08.full.chunks.json
//
// Le script peut maintenant traiter n'importe quel
// fichier .full.chunks.json.
// ---------------------------------------------------------

const chunksFileArg = process.argv[2];

if (!chunksFileArg) {
  throw new Error(
    'Fichier .full.chunks.json manquant. Exemple : node scripts/generate-full-rag-embeddings.mjs src/data/rag/document.full.chunks.json'
  );
}

// ---------------------------------------------------------
// SÉCURITÉ
// ---------------------------------------------------------

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "OPENAI_API_KEY absente. La clé OpenAI doit être fournie par l'environnement."
  );
}

// La clé reste dans l'environnement.
// Elle n'est jamais écrite dans le code ni dans le JSON.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------------------------------------------------
// FICHIERS
// ---------------------------------------------------------

const chunksPath = path.resolve(
  chunksFileArg
);

if (!fs.existsSync(chunksPath)) {
  throw new Error(
    `Fichier de chunks introuvable : ${chunksPath}`
  );
}

// Le nom de sortie est créé automatiquement.
//
// Exemple :
// document.full.chunks.json
//
// devient :
// document.full.embeddings.json
const outputPath = chunksPath.replace(
  /\.full\.chunks\.json$/i,
  ".full.embeddings.json"
);

if (outputPath === chunksPath) {
  throw new Error(
    'Le fichier d’entrée doit se terminer par ".full.chunks.json".'
  );
}

// ---------------------------------------------------------
// LECTURE DES CHUNKS
// ---------------------------------------------------------

const chunks = JSON.parse(
  fs.readFileSync(chunksPath, "utf8")
);

if (!Array.isArray(chunks)) {
  throw new Error(
    "Le fichier de chunks doit contenir une liste."
  );
}

if (chunks.length === 0) {
  throw new Error(
    "Aucun chunk disponible pour générer les embeddings."
  );
}

console.log("");
console.log(
  "CarnetPass - Génération des embeddings"
);
console.log(
  "--------------------------------------"
);

console.log(
  "Fichier source :",
  chunksPath
);

console.log(
  "Chunks à traiter :",
  chunks.length
);

// ---------------------------------------------------------
// MODÈLE D'EMBEDDING
// ---------------------------------------------------------

const EMBEDDING_MODEL =
  "text-embedding-3-small";

// ---------------------------------------------------------
// TRAITEMENT PAR LOTS
// ---------------------------------------------------------
//
// batch = lot.
//
// Au lieu d'envoyer un très gros document d'un seul coup,
// on traite plusieurs petits groupes.
//
// C'est plus robuste pour les futures notices
// beaucoup plus volumineuses.
// ---------------------------------------------------------

const BATCH_SIZE = 50;

const items = [];

let totalTokens = 0;

for (
  let start = 0;
  start < chunks.length;
  start += BATCH_SIZE
) {
  const batch = chunks.slice(
    start,
    start + BATCH_SIZE
  );

  const texts = batch.map(
    (chunk) => String(chunk.text ?? "")
  );

  console.log(
    `Traitement ${start + 1} à ${Math.min(
      start + batch.length,
      chunks.length
    )} / ${chunks.length}`
  );

  const response =
    await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });

  batch.forEach((chunk, index) => {
    items.push({
      ...chunk,

      embedding:
        response.data[index].embedding,
    });
  });

  totalTokens +=
    response.usage?.total_tokens ?? 0;
}

// ---------------------------------------------------------
// FICHIER FINAL
// ---------------------------------------------------------

const embeddingData = {
  model: EMBEDDING_MODEL,

  generatedAt:
    new Date().toISOString(),

  chunkCount:
    items.length,

  dimensions:
    items[0]?.embedding?.length ?? 0,

  items,
};

fs.mkdirSync(
  path.dirname(outputPath),
  { recursive: true }
);

fs.writeFileSync(
  outputPath,
  JSON.stringify(
    embeddingData,
    null,
    2
  ),
  "utf8"
);

// ---------------------------------------------------------
// CONTRÔLE
// ---------------------------------------------------------

console.log("");

console.log(
  "Embeddings générés ✅"
);

console.log(
  "Nombre d'embeddings :",
  items.length
);

console.log(
  "Dimensions :",
  items[0]?.embedding?.length ?? 0
);

console.log(
  "Tokens utilisés :",
  totalTokens
);

console.log(
  "Fichier créé :",
  outputPath
);