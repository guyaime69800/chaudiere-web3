import test from 'node:test';
import assert from 'node:assert/strict';
import { proInvitationDestination } from './pro-invitation.js';
test('login retains only an exact local invitation route and opaque token', () => {
  const token = 'a'.repeat(64);
  assert.equal(proInvitationDestination({ pathname: '/parametres-compte', search: `?invitation=${token}&next=https://evil.invalid` }), `/parametres-compte?invitation=${token}#comptes`);
  assert.equal(proInvitationDestination({ pathname: '//evil.invalid', search: `?invitation=${token}` }), null);
  assert.equal(proInvitationDestination({ pathname: '/parametres-compte', search: '?invitation=invalid' }), null);
});
