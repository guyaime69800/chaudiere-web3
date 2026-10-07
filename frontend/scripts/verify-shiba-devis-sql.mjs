// Isolated PostgreSQL smoke test. Install the pinned test dependency with:
// npm install --prefix .verification-deps --no-save --package-lock=false @electric-sql/pglite@0.3.15
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import('../.verification-deps/node_modules/@electric-sql/pglite/dist/index.js');
const db=new PGlite();
const admin='00000000-0000-0000-0000-000000000001',user='00000000-0000-0000-0000-000000000002';
await db.exec(`create schema auth; create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;create table public.platform_admins(user_id uuid primary key,role text);create table public.companies(id uuid primary key);create table public.equipments(id uuid primary key,company_id uuid);create table public.equipment_private_attachments(id uuid primary key);grant usage on schema public,auth to service_role;grant select on public.platform_admins to service_role;insert into auth.users values('${admin}'),('${user}');insert into public.platform_admins values('${admin}','founder');`);
await db.exec(await readFile(new URL('../supabase/migrations/20261007111436_shiba_devis_aids_rge_scan.sql',import.meta.url),'utf8'));
const today=new Date().toISOString().slice(0,10);
const rule={slug:'fixture-aid',schemaVersion:1,name:'Fixture',effectiveFrom:today,effectiveUntil:'2099-12-31',freshnessDays:30};
const draft=async payload=>(await db.query('select public.shiba_aid_new_draft($1,$2::jsonb) id',[admin,JSON.stringify(payload)])).rows[0].id;
const transition=(id,action)=>db.query('select public.shiba_aid_transition($1,$2,$3,$4)',[admin,id,action,'Conditions, plafonds, cumul et périodes contrôlés dans cette fixture.']);
const first=await draft(rule);
await assert.rejects(transition(first,'publish'));
await transition(first,'validate');await transition(first,'publish');
const second=await draft(rule);await transition(second,'validate');await transition(second,'publish');
assert.equal((await db.query("select count(*)::int n from shiba_aid_versions where status='published'")).rows[0].n,1);
assert.equal((await db.query('select status from shiba_aid_versions where id=$1',[first])).rows[0].status,'archived');
await transition(first,'rollback');await transition(first,'suspend');
await assert.rejects(transition(first,'publish'));
await assert.rejects(db.query('update shiba_aid_versions set rule=$1 where id=$2',[JSON.stringify({...rule,name:'Mutated'}),second]));
await assert.rejects(db.query('select shiba_aid_new_draft($1,$2::jsonb)',[user,JSON.stringify(rule)]));
const future=await draft({...rule,slug:'future-aid',effectiveFrom:'2099-01-01'});await transition(future,'validate');await assert.rejects(transition(future,'publish'));
const expired=await draft({...rule,slug:'expired-aid',effectiveFrom:'2020-01-01',effectiveUntil:'2020-12-31'});await transition(expired,'validate');await assert.rejects(transition(expired,'publish'));
for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from shiba_devis_simulations'));await assert.rejects(db.query('select * from company_rge_qualifications'));await assert.rejects(db.query('select shiba_aid_new_draft($1,$2::jsonb)',[admin,JSON.stringify(rule)]));await db.exec('reset role');}
const a='10000000-0000-0000-0000-000000000001',b='10000000-0000-0000-0000-000000000002';
await db.query('insert into shiba_devis_simulations(id,owner_id,snapshot) values($1,$2,$3)',[a,user,'{"subtotal":5000}']);
await db.query('insert into shiba_devis_simulations(id,owner_id,snapshot,previous_id) values($1,$2,$3,$4)',[b,user,'{"subtotal":4000}',a]);
await assert.rejects(db.query('update shiba_devis_simulations set snapshot=$1 where id=$2',['{"subtotal":0}',a]));
await db.query('delete from shiba_devis_simulations where id=$1',[a]);
assert.equal((await db.query('select snapshot,previous_id from shiba_devis_simulations where id=$1',[b])).rows[0].previous_id,null);
assert.equal((await db.query('select snapshot from shiba_devis_simulations where id=$1',[b])).rows[0].snapshot.subtotal,4000);
await db.exec('set role service_role');assert.equal((await db.query('select count(*)::int n from shiba_devis_simulations')).rows[0].n,1);await db.exec('reset role');
const rights=await db.query("select relname,relrowsecurity,relforcerowsecurity from pg_class where relname in ('shiba_aid_versions','shiba_devis_simulations','company_rge_qualifications','equipment_plate_confirmations')");assert.ok(rights.rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
await db.close();console.log('PostgreSQL isolé : migration, transitions, retour arrière, snapshots immuables, effacement et refus anon/authenticated vérifiés.');
