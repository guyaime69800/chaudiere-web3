import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { subscriptionPaymentEffect } from '../server/lib/stripe-live-reconciliation.js';
import { productionPrices } from '../server/lib/stripe-production-catalog.js';
import { sendScheduledCancellationEmails } from '../server/lib/scheduled-cancellation-email.js';
const {PGlite}=await import(process.env.CARNETPASS_SQL_TEST_MODULE);
const db=new PGlite(),checks=[],sent=[];
const company='11111111-1111-4111-8111-111111111111',user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',orderId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const now=Date.now(),end=Math.floor(now/1000)+30*86400;
const binding={company_id:company,customer_id:'cus_isolated',account_id:'acct_isolated'};
const state={subscription_id:'sub_isolated',paid_until:new Date(end*1000).toISOString()};
function price(name){const p=productionPrices[name];return {id:p.id,active:true,livemode:true,currency:'eur',unit_amount:p.amount,billing_scheme:'per_unit',tax_behavior:'unspecified',type:'recurring',recurring:{interval:'month',interval_count:1,usage_type:'licensed'},metadata:name==='additionalAccount'?{carnetpass_additional_accounts:'v1'}:{},product:{id:'prod_isolated',active:true,livemode:true}};}
let sub={id:'sub_isolated',livemode:true,customer:binding.customer_id,status:'active',cancel_at:null,
 items:{has_more:false,data:[{quantity:1,price:price('pro'),current_period_end:end},{quantity:1,price:price('additionalAccount'),current_period_end:end}]},
 latest_invoice:{livemode:true,status:'paid',amount_remaining:0,customer:binding.customer_id,currency:'eur',parent:{subscription_details:{subscription:'sub_isolated'}},amount_paid:4800,total:4800,total_taxes:[],total_discount_amounts:[],
 lines:{has_more:false,data:[{pricing:{price_details:{price:productionPrices.pro.id}},quantity:1,amount:2800,period:{end}},{pricing:{price_details:{price:productionPrices.additionalAccount.id}},quantity:1,amount:2000,period:{end}}]}}};
let eventNumber=0;
const rpc=async(name,values=[])=>{const result=await db.query(`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) as result`,values);return {data:result.rows[0]?.result};};
function database(){return {rpc:async name=>{
 assert.equal(name,'claim_scheduled_cancellation_emails');return {data:(await db.query('select * from claim_scheduled_cancellation_emails()')).rows};
},from(table){assert.ok(['stripe_live_company_state','stripe_live_customers','stripe_live_cancellation_emails'].includes(table));const filters=[],updates=[];
 const run=async()=>{
 const where=filters.map(([field],i)=>`${field}=$${i+1}`).join(' and ')||'true';
 if(updates.length){const values=[...filters.map(([,v])=>v),...updates.map(([,v])=>v)];await db.query(`update ${table} set ${updates.map(([field],i)=>`${field}=$${filters.length+i+1}`).join(',')} where ${where}`,values);return {data:null};}
 return {data:(await db.query(`select * from ${table} where ${where}`,filters.map(([,v])=>v))).rows};};
 return {select(){return this;},eq(field,value){assert.ok(['id','company_id','lease_token','status'].includes(field));filters.push([field,value]);return this;},update(values){for(const [field,value]of Object.entries(values)){assert.ok(['status','sent_at'].includes(field));updates.push([field,value]);}return this;},maybeSingle:async()=>{const result=await run();return {data:result.data[0]||null};},then(resolve,reject){return run().then(resolve,reject);}};
}};}
async function apply(snapshot){
 const event='evt_isolated'+(++eventNumber);
 await rpc('record_stripe_live_event',[{account_id:binding.account_id,event_id:event,event_type:'customer.subscription.updated',object_id:snapshot.id,event_created:Math.floor(now/1000),identity_hash:'a'.repeat(64)}]);
 const token=(await rpc('claim_stripe_live_company',[company])).data;
 const effect=subscriptionPaymentEffect(snapshot,binding,eventNumber===1?{}:state,eventNumber===1?{id:orderId,kind:'pro',company_id:company}:null,now);
 assert.equal((await rpc('apply_stripe_live_effect',[company,token,event,effect])).data,'processed');
 return effect;
}
const read=async path=>path.startsWith('subscriptions/')?sub:{id:binding.customer_id,livemode:true,email:'client@example.invalid'};
const provider={env:{RESEND_API_KEY:'isolated-placeholder',STRIPE_EXPECTED_ACCOUNT_ID:binding.account_id},request:async(url,request)=>{
 assert.equal(url,'https://api.resend.com/emails');sent.push({key:request.headers['Idempotency-Key'],body:JSON.parse(request.body)});return {ok:true};
}};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;
 create schema auth;create table auth.users(id uuid primary key);create table companies(id uuid primary key);
 create table company_members(company_id uuid,user_id uuid,role text,primary key(company_id,user_id));
 create table pro_account_assignments(company_id uuid,user_id uuid,primary key(company_id,user_id),foreign key(company_id,user_id) references company_members(company_id,user_id) on delete cascade);
 create table pro_account_invitations(company_id uuid,expires_at timestamptz,used_at timestamptz);
 create type subscription_status as enum('active','trialing','past_due','canceled');
 create table subscriptions(company_id uuid primary key,plan text,status subscription_status,current_period_end timestamptz,stripe_customer_id text,updated_at timestamptz);
 create table pro_additional_accounts(company_id uuid primary key,quantity integer,paid_until timestamptz,billing_environment text,updated_at timestamptz);
 grant select,insert,update,delete on subscriptions,pro_additional_accounts,company_members,pro_account_assignments,pro_account_invitations to service_role;`);
 for(const name of ['20261020164021_stripe_live_event_inbox.sql','20261021102225_stripe_live_entitlements.sql','20261021141150_stripe_live_scheduled_cancellation.sql','20261021143658_stripe_live_seat_changes.sql','20261023162216_scheduled_cancellation_notifications.sql'])await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.query('insert into companies values($1)',[company]);await db.query('insert into auth.users values($1)',[user]);
 await db.query("insert into subscriptions(company_id,plan,status) values($1,'free','active')",[company]);
 await db.query('insert into stripe_live_customers(company_id,account_id,customer_id) values($1,$2,$3)',[company,binding.account_id,binding.customer_id]);
 await db.query("insert into stripe_live_orders(id,company_id,user_id,kind,session_id,terms_version,terms_sha256) values($1,$2,$3,'pro','cs_live_isolated','v1',repeat('a',64))",[orderId,company,user]);
 await db.exec('set role service_role');
 await apply(sub);
 checks.push('Facture fictive réglée : Pro actif et une place supplémentaire');
 sub={...sub,cancel_at:end};const effect=await apply(sub);
 assert.equal(effect.status,'active');assert.equal(Date.parse(effect.paid_until),end*1000);
 assert.equal((await db.query('select quantity from pro_additional_accounts')).rows[0].quantity,1);
 assert.equal((await db.query('select count(*)::int n from stripe_live_cancellation_emails')).rows[0].n,1);
 checks.push('Résiliation programmée : accès payé conservé et confirmation mise en file dans la même transaction');
 assert.equal((await sendScheduledCancellationEmails(database(),read,provider)).sent,1);
 assert.match(sent[0].body.text,/ne sera pas renouvelé/);assert.match(sent[0].body.text,/heure de Paris/);assert.doesNotMatch(sent[0].body.text,/questionnaire|commentaire/);
 await apply(sub);await sendScheduledCancellationEmails(database(),read,provider);assert.equal(sent.length,1);
 checks.push('Confirmation sans questionnaire : date de fin et arrêt du renouvellement ; notification répétée sans doublon');
 sub={...sub,cancel_at:null};await apply(sub);sub={...sub,cancel_at:end};await apply(sub);sub={...sub,cancel_at:null};await apply(sub);
 assert.equal((await sendScheduledCancellationEmails(database(),read,provider)).skipped,1);assert.equal(sent.length,1);
 checks.push('Reprise avant envoi : confirmation devenue obsolète ignorée');
 sub={...sub,status:'past_due'};await apply(sub);
 assert.equal((await db.query('select status from subscriptions')).rows[0].status,'past_due');assert.equal((await db.query('select quantity from pro_additional_accounts')).rows[0].quantity,0);
 assert.throws(()=>subscriptionPaymentEffect({...sub,status:'active',latest_invoice:{...sub.latest_invoice,status:'open'}},binding,state,null,now));
 checks.push('Paiement refusé : impayé enregistré, places désactivées ; facture non réglée insuffisante pour réactiver');
 sub={...sub,status:'active'};await apply(sub);assert.equal((await db.query('select quantity from pro_additional_accounts')).rows[0].quantity,1);
 sub={...sub,status:'canceled'};await apply(sub);assert.equal((await db.query('select status from subscriptions')).rows[0].status,'canceled');assert.equal((await db.query('select quantity from pro_additional_accounts')).rows[0].quantity,0);
 checks.push('Régularisation réglée réactive les droits ; annulation effective les arrête');
 const report={result:'passed',checks,isolation:'PGlite en mémoire, snapshots Stripe et expéditeur mail simulés',realPayment:false,realEmailSent:false,productionModified:false};
 const out=path.resolve('../../output/recette-facturation-20261024');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'rapport.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await db.close();}
