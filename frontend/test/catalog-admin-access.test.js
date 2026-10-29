import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogAccess } from '../server/lib/platform-catalog-documents.js';

test('catalogue: fondateur vérifié avec MFA sans abonnement de démonstration', async () => {
  const access = await catalogAccess({ headers: { authorization: 'Bearer verified' } }, {},
    async () => ({ user: { id: 'founder' }, role: 'founder', mfaRequired: false }),
    async () => { throw Error('Ne doit pas utiliser un abonnement client'); });
  assert.deepEqual(access, { userId: 'founder', accessKind: 'admin_catalog' });
});

test('catalogue: clients, opérateurs, rôle retiré et MFA manquante gardent les contrôles entreprise', async () => {
  for (const identity of [
    { user: { id: 'client', user_metadata: { role: 'founder' } }, role: null },
    { user: { id: 'operator' }, role: 'operator' },
    { user: { id: 'founder' }, role: 'founder', mfaRequired: true },
    { user: null, role: null },
  ]) {
    let checked = false;
    const access = await catalogAccess({ headers: { authorization: 'Bearer credential' } }, {},
      async () => identity, async () => { checked = true; return null; });
    assert.equal(access, null); assert.equal(checked, true);
  }
});

test('catalogue: un cookie seul et une panne de vérification ne confèrent aucun accès fondateur', async () => {
  assert.equal(await catalogAccess({ headers: { cookie: 'role=founder' } }, {},
    async () => { throw Error('Pas de jeton'); }, async () => null), null);
  await assert.rejects(catalogAccess({ headers: { authorization: 'Bearer credential' } }, {},
    async () => { throw Error('Indisponible'); }, async () => ({ accessKind: 'admin_catalog' })));
});
