import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { equipmentMetadataRegistry } from '../server/lib/equipment-metadata.generated.js';
import { generatedEquipmentRegistry } from '../server/lib/equipment-registry.generated.js';

test('lightweight registry preserves every original equipment and exact identity', () => {
  assert.deepEqual(equipmentMetadataRegistry.map(e => e.equipmentData), generatedEquipmentRegistry.map(e => e.equipmentData));
  assert.ok(equipmentMetadataRegistry.every(e => !('ragData' in e)));
});

test('lookup and registration routes do not import vectors', async () => {
  for (const file of ['api/search.js', 'api/carnetpass.js', 'server/lib/equipment-metadata.generated.js']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ["'][^"']*equipment-registry\.generated|from ["'][^"']*embeddings\.json/);
  }
});
