import assert from 'node:assert/strict';
import { liveCheckoutEnabled } from '../server/billing-live.js';
import { livePortalEnabled } from '../server/billing-live-portal.js';
import { readMaintenance } from '../server/lib/internal-access.js';

assert.equal(liveCheckoutEnabled(), true, 'Achats non activés');
assert.equal(livePortalEnabled(process.env), true, 'Portail non activé');
assert.notEqual(process.env.CARNETPASS_LIVE_SEATS_ENABLED, 'true', 'Places hors périmètre');
assert.equal((await readMaintenance()).enabled, true, 'Maintenance requise');
await import('./audit-stripe-production.mjs');
await import('./audit-stripe-live-portal.mjs');
if (process.exitCode) throw Error('Audit Stripe échoué');
console.log('Controlled billing verified: checkout and portal enabled, seats disabled, maintenance active. No payment created.');
