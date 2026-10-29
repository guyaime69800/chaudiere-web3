import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { catalogModelsWithPublishedDocuments, catalogModelFamilies } from '../src/services/platformDocumentLibrary.js';

// CPU-only synthetic catalogue. No network, credentials or production writes.
const results = [];
for (const count of [100, 500, 1000]) {
  const documents = Array.from({ length: count }, (_, i) => ({
    id: `synthetic-${i}`, manufacturer: 'Saunier Duval',
    model_name: `THEMAFAST C${i} (H-FR)`, model_reference: `synthetic-ref-${i}`,
    title: 'vue-eclatee', catalog_category: 'boiler',
  }));
  const samples = [];
  for (let iteration = 0; iteration < 6; iteration++) {
    const start = performance.now();
    const models = catalogModelsWithPublishedDocuments([], documents);
    const families = catalogModelFamilies(models);
    const elapsed = performance.now() - start;
    assert.equal(models.length, count);
    assert.equal(families.reduce((sum, family) => sum + family.count, 0), count);
    for (const model of models) assert.equal(model.publishedDocuments.length, 1);
    if (iteration) samples.push(elapsed);
  }
  samples.sort((a, b) => a - b);
  results.push({ models: count, documents: count, samples: samples.length,
    medianMs: Math.round(samples[2]), maxMs: Math.round(samples.at(-1)) });
}
const report = { at: new Date().toISOString(), scope: 'Local catalogue CPU only; synthetic data',
  limitations: 'Does not measure browser rendering, simultaneous users, Vercel, Supabase, PDF transfer or paid APIs.', results };
const directory = 'C:/dev/chaudiere-web3/tmp/output/volume-catalogue-20261024';
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'rapport.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
