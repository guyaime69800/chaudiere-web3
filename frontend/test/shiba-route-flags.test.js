import test from 'node:test';
import assert from 'node:assert/strict';
import {ambiguousApiRoute} from '../server/lib/api-route-flags.js';
test('allowed maintenance routes cannot dispatch a public simulation using an extra selector',()=>{
  assert.equal(ambiguousApiRoute({aid_admin_route:'1',shiba_devis_route:'1'}),true);
  assert.equal(ambiguousApiRoute({maintenance_control_route:'1',plate_scan_route:'1'}),true);
  assert.equal(ambiguousApiRoute({billing_route:'1',webhook:'1'}),false);
  assert.equal(ambiguousApiRoute({shiba_devis_route:'1'}),false);
  assert.equal(ambiguousApiRoute(),false);
});
