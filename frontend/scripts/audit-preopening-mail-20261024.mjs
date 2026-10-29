import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { adminBillingHealth } from '../server/lib/admin-billing-health.js';
assert.equal(process.env.VERCEL_ENV, 'production');
assert.equal(new URL(process.env.VITE_SUPABASE_URL).hostname, 'tsyukqcyfxcrjrhopvpv.supabase.co');
assert.ok(process.env.RESEND_API_KEY, 'Email configuration missing');
const db=createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const health=await adminBillingHealth(db);assert.notEqual(health.state,'unavailable');
console.log(JSON.stringify({preopeningBillingHealth:health}));
// One explicitly authorized test message. No subscription/customer/payment creation.
assert.equal(new Date().toISOString().slice(0,10),'2026-10-24');
const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),
 headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':'carnetpass-preopening-mail-20261024-guy-v1'},
 body:JSON.stringify({from:process.env.ENTERPRISE_QUOTE_FROM_EMAIL||'CarnetPass <contact@carnetpass.fr>',to:['guy@carnetpass.fr'],
 subject:'TEST CarnetPass — vérification avant ouverture',
 text:'Bonjour,\n\nCeci est le message de test CarnetPass demandé pour vérifier la réception des courriels avant ouverture.\n\nCe test ne crée aucun abonnement, aucun prélèvement et aucune résiliation.\nMerci de confirmer sa réception dans la conversation.\n\nCarnetPass\ncontact@carnetpass.fr'})});
if(!response.ok)throw Error(`Email test not accepted: HTTP ${response.status}`);
const result=await response.json();assert.ok(result.id);
console.log(JSON.stringify({preopeningMailTest:{accepted:true,messageId:result.id,deliveryConfirmed:false,financialWrite:false}}));
