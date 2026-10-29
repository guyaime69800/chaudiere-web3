import test from 'node:test';
import assert from 'node:assert/strict';
import lot from '../data/chappee-import-20261017-18.json' with { type: 'json' };
import { chappeePublicationSelection, publishChappeeBatch } from './technicalBatchPublication.js';
const entry = lot.entries[0];
const document = { id: '11111111-1111-4111-8111-111111111111', manufacturer: 'Chappée', title: entry.title,
  model_reference: entry.modelReference, model_aliases: entry.modelAliases, status: 'pending_review',
  blob_pathname: `r2://platform-documents/sha256/${entry.sha256}.pdf#11111111-1111-4111-8111-111111111111` };
test('publication selects only exact lot hashes, references and document types', () => {
  const unrelated = [
    { ...document, id: 'other', model_reference: 'other-model' },
    { ...document, id: 'other', model_aliases: ['unrelated'] },
    { ...document, id: 'other', manufacturer: 'other-brand' },
    { ...document, id: 'other', title: 'notice-other' },
    { ...document, id: 'other', blob_pathname: 'blob/other.pdf' },
    { ...document, id: 'other', status: 'rejected' },
    { ...document, id: 'other', rag_error: 'deleted_by_admin' },
    { ...document, id: 'other', status: 'approved', distribution_confirmed_at: 'date', rag_status: 'ready' },
    { ...document, id: 'other', status: 'approved', distribution_confirmed_at: null, rag_status: 'failed' },
  ];
  assert.deepEqual(chappeePublicationSelection([document, ...unrelated]), [document]);
});
test('sequential publication uses existing approve/index API and reports OCR without claiming ready', async () => {
  const retry = { ...document, id: 'retry', status: 'approved', distribution_confirmed_at: 'date', rag_status: 'failed' };
  const calls = [];
  const results = await publishChappeeBatch([document, retry], () => 'test-token', () => {}, async (url, options) => {
    calls.push(JSON.parse(options.body)); assert.equal(url, '/api/platform-admin-documents');
    return Response.json({ indexStatus: calls.length === 1 ? 'ready' : 'needs_ocr' });
  });
  assert.deepEqual(calls[0], { id: document.id, action: 'approve', category: 'boiler', distributionConfirmed: true });
  assert.deepEqual(calls[1], { id: 'retry', action: 'index' });
  assert.deepEqual(results.map(r => r.status), ['ready', 'needs_ocr']);
});
test('permission failure stops immediately without automatic retry', async () => {
  let calls = 0;
  await assert.rejects(publishChappeeBatch([document, document], () => 'test-token', () => {}, async () => {
    calls++; return Response.json({ error: 'Accès refusé' }, { status: 403 });
  }), /Accès refusé/);
  assert.equal(calls, 1);
});

test('a newly selected archive scopes publication without including the previous lot', async () => {
  const nextEntry = { ...entry, sha256: 'a'.repeat(64), modelReference: 'initia-new-reference', modelAliases: [] };
  const nextDocument = { ...document, id: 'next', model_reference: nextEntry.modelReference, model_aliases: [],
    blob_pathname: `r2://platform-documents/sha256/${nextEntry.sha256}.pdf#11111111-1111-4111-8111-111111111111` };
  assert.deepEqual(chappeePublicationSelection([document, nextDocument], [nextEntry]), [nextDocument]);
  const ids = [];
  await publishChappeeBatch([document, nextDocument], () => 'test', () => {}, async (_url, options) => {
    ids.push(JSON.parse(options.body).id); return Response.json({ indexStatus: 'ready' });
  }, [nextEntry]);
  assert.deepEqual(ids, ['next']);
});

test('Vaillant publication uses the selected manifest manufacturer and excludes Chappée', () => {
  const vaillantEntry = { ...entry, manufacturer: 'Vaillant' };
  const vaillantDocument = { ...document, manufacturer: 'Vaillant' };
  assert.deepEqual(chappeePublicationSelection([document, vaillantDocument], [vaillantEntry]), [vaillantDocument]);
});

test('PAC indoor and outdoor publication follows each manifest category', async () => {
  for (const category of ['heat_pump_indoor', 'heat_pump_outdoor']) {
    const calls = [];
    await publishChappeeBatch([document], () => 'test', () => {}, async (_url, options) => {
      calls.push(JSON.parse(options.body)); return Response.json({ indexStatus: 'ready' });
    }, [{ ...entry, catalogCategory: category }]);
    assert.equal(calls[0].category, category);
  }
});

test('invalid manifest category stops before any publication', async () => {
  let calls = 0;
  await assert.rejects(publishChappeeBatch([document], () => 'test', () => {}, async () => { calls++; }, [{ ...entry, catalogCategory: 'invalid' }]), /Catégorie/);
  assert.equal(calls, 0);
});
