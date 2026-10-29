import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedDocumentScope } from './platform-document-scope.js';
const view = { manufacturer: 'Vaillant', catalog_category: 'boiler', model_reference: 'VU-R3', model_name: 'VU R3' };
const notice = { ...view, model_reference: 'VU-R2', model_name: 'VU R2', model_aliases: ['VU-R3'] };
test('Shiba accepts a view and a shared notice only for a reference covered by every selected document', () => {
  assert.deepEqual(sharedDocumentScope([notice, view], 'VU-R3'), { manufacturer: 'Vaillant', reference: 'VU-R3', model: 'VU R3' });
  assert.equal(sharedDocumentScope([notice, view], 'VU-R2'), null);
  assert.equal(sharedDocumentScope([notice, view], 'VU-R4'), null);
  assert.equal(sharedDocumentScope([notice, view], 'VU-R3', { brand: 'Vaillant', manufacturerReference: 'VU-R4' }), null);
});
test('a shared reference is mandatory, not a chain of aliases or a similar family', () => {
  assert.equal(sharedDocumentScope([view, { ...notice, model_aliases: ['VU-R4'] }]), null);
  assert.equal(sharedDocumentScope([notice, { ...view, manufacturer: 'Autre' }], 'VU-R3'), null);
  assert.equal(sharedDocumentScope([notice, { ...view, catalog_category: 'regulation' }], 'VU-R3'), null);
  assert.equal(sharedDocumentScope([notice, view], {}), null);
});
