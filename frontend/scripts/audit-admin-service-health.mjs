import { adminServiceHealth } from '../server/lib/admin-service-health.js';
const health = await adminServiceHealth();
console.log('Admin service health (read-only):', JSON.stringify(health));
if (health.polygon.state === 'unavailable') throw Error('Polygon health unavailable');
