import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { adminTestWorkspace } from './admin-test-workspace.js';

const actor = '11111111-1111-4111-8111-111111111111';
const equipmentId = '22222222-2222-4222-8222-222222222222';
const documentId = '33333333-3333-4333-8333-333333333333';
const env = { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main', VITE_SUPABASE_URL: 'https://tsyukqcyfxcrjrhopvpv.supabase.co' };
test('equipment, scan and PDF use only the private workspace RPC and no photo is retained', async () => {
  const rows = new Map();
  const calls = [];
  const database = { async rpc(name, params) {
    calls.push(name); assert.equal(params.p_actor, actor);
    if (name === 'open_admin_test_workspace') return { data: { id: actor, environment: 'test' } };
    assert.equal(name, 'admin_test_command');
    const { p_action: action, p_id: id, p_data: data } = params;
    if (action === 'snapshot') return { data: { id: actor, records: [...rows.values()].filter(item => item.kind !== 'scan'), billing: { customerId: 'must-not-leak' } } };
    if (action === 'get') return rows.has(id) ? { data: rows.get(id) } : { error: { message: 'Scope refused' } };
    if (action.startsWith('save_')) {
      const record = { id, kind: action.slice(5), data, createdAt: '2026-10-21' };
      rows.set(id, record); return { data: record };
    }
    throw Error('Unexpected RPC action');
  } };
  const dependencies = { env, user: { id: actor, email: 'founder@example.invalid', email_confirmed_at: '2026-01-01' }, database,
    rate: async () => {}, redis: () => ({}), reserve: async (_redis, _user, settings) => assert.equal(settings.VERCEL_ENV, 'admin-test'),
    imageReader: async () => ({ hash: 'a'.repeat(64), dataUrl: 'private-image-not-retained' }),
    analyze: async () => ({ fields: { brand: { value: 'Test', evidence: 'Test' }, model: { value: 'Model', evidence: 'Model' } } }) };
  async function run(body, query = {}) {
    const res = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.code = code; return this; },
      json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } };
    await adminTestWorkspace({ method: body ? 'POST' : 'GET', body, query }, res, dependencies); return res;
  }
  const scan = await run({ action: 'analyze', image: 'fake' }); assert.equal(scan.code, 200);
  assert.equal(JSON.stringify([...rows.values()]).includes('private-image-not-retained'), false);
  assert.equal((await run({ action: 'save-equipment', requestId: equipmentId, ticket: scan.body.ticket,
    fields: { brand: 'Test', model: 'Model', equipmentType: 'heat_pump' } })).code, 200);
  assert.equal((await run({ action: 'create-document', equipmentId, requestId: documentId, notes: 'Entretien fictif' })).code, 200);
  assert.equal((await run({ action: 'create-document', equipmentId: actor, requestId: documentId })).code, 409);
  const pdf = await run(null, { document: documentId });
  assert.equal(pdf.code, 200); assert.equal(pdf.headers['Content-Type'], 'application/pdf');
  assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
  const streams = [...pdf.body.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(match => {
    try { return inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); } catch { return ''; }
  }).join('\n');
  assert.match(streams, /TEST - DOCUMENT SANS VALEUR CONTRACTUELLE/);
  const status = await run(); assert.equal(status.body.workspace.billing.customerId, undefined);
  assert.equal((await run(null, { document: equipmentId })).code, 404);
  assert.ok(calls.every(name => ['open_admin_test_workspace', 'admin_test_command'].includes(name)));
});
