import fs from "fs";
import path from "path";

const chunksPath = path.resolve(
  "frontend/src/data/rag/saunier-duval-0020238207-08.chunks.json"
);

const chunks = JSON.parse(
  fs.readFileSync(chunksPath, "utf8")
);

const question = "le moteur d'extraction ne tourne plus";

const results = chunks.filter((chunk) =>
  chunk.text.toLowerCase().includes(question.toLowerCase())
);

console.log("Question :", question);
console.log("Chunks disponibles :", chunks.length);
console.log("Résultats trouvés :", results.length);
console.log(results);