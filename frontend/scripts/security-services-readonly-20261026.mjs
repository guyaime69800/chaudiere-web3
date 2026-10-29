import { createClient } from '@supabase/supabase-js';
import { adminServiceHealth } from '../server/lib/admin-service-health.js';
import { adminBillingHealth } from '../server/lib/admin-billing-health.js';
import { auditProductionCatalog } from '../server/lib/stripe-production-catalog.js';
if (process.env.VERCEL_ENV !== 'production') throw Error('Production-only audit');
const db=createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const [health,billing,stripe]=await Promise.all([
 adminServiceHealth(),adminBillingHealth(db),
 auditProductionCatalog({key:process.env.STRIPE_SECRET_KEY,expectedAccount:process.env.STRIPE_EXPECTED_ACCOUNT_ID}).then(r=>({ok:r.ok,checkedPrices:r.checkedPrices})).catch(()=>({ok:false}))
]);
console.log('SECURITY_READONLY_AUDIT_20261026 '+JSON.stringify({health,billing,stripe,financialWrites:false,emailSent:false}));
if(!stripe.ok||billing.state==='unavailable'||['unavailable','critical'].includes(health.polygon.state))throw Error('Read-only service audit needs review');
