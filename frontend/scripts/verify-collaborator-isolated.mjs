import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { additionalAccountAccess } from '../server/lib/additional-account-access.js';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/dev/carnetpass-documents/node_modules/playwright');
const {PGlite}=await import(process.env.CARNETPASS_SQL_TEST_MODULE);
const db=new PGlite();
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',collaborator='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',outsider='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const company='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
const email='guyaimeparie@gmail.com',future=new Date(Date.now()+30*86400000).toISOString();
let serial=Promise.resolve();
function asActor(actor,sql,params=[]){const call=serial.then(async()=>{
 await db.exec('begin; set local role authenticated');
 try {await db.query("select set_config('app.uid',$1,true)",[actor]);const result=await db.query(sql,params);await db.exec('commit');return result;}
 catch(error){await db.exec('rollback');throw error;}
});serial=call.catch(()=>{});return call;}
function scopedClient(actor){return {from(table){
 assert.ok(['pro_account_assignments','pro_additional_accounts'].includes(table));
 const filters=[];
 const read=()=>asActor(actor,`select * from ${table} where ${filters.map(([field],i)=>`${field}=$${i+1}`).join(' and ')||'true'} order by ${table==='pro_account_assignments'?'assigned_at,user_id':'company_id'}`,filters.map(([,value])=>value)).then(result=>({data:result.rows}));
 return {select(){return this;},eq(field,value){assert.ok(['company_id','user_id'].includes(field));filters.push([field,value]);return this;},order(){return this;},
 maybeSingle:async()=>{const result=await read();return {data:result.data[0]||null};},then(resolve,reject){return read().then(resolve,reject);}};
}};}
function user(actor){return {id:actor,email:actor===owner?'responsable@example.invalid':actor===collaborator?email:'autre@example.invalid',email_confirmed_at:'2026-10-24',aud:'authenticated',role:'authenticated',factors:[]};}
function jwt(actor){return [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({sub:actor,aal:'aal2',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),Buffer.alloc(32).toString('base64url')].join('.');}
const session=actor=>({access_token:jwt(actor),refresh_token:'isolated-fictional',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:user(actor)});
await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table companies(id uuid primary key);create table profiles(id uuid primary key);
 create table company_members(company_id uuid references companies(id),user_id uuid references auth.users(id),role text,created_at timestamptz default now(),primary key(company_id,user_id));
 create table subscriptions(company_id uuid primary key references companies(id),plan text,status text);
 create function is_company_member(requested_company_id uuid) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.company_members where company_id=requested_company_id and user_id=auth.uid())$$;
 grant select on company_members to authenticated;`);
for(const file of ['20261012205113_pro_additional_accounts.sql','20261012211047_pro_main_account_guard.sql'])await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
await db.query('insert into companies values($1),($2)',[company,foreign]);
for(const actor of [owner,collaborator,outsider]){await db.query('insert into auth.users values($1,$2,now())',[actor,user(actor).email]);await db.query('insert into profiles values($1)',[actor]);}
await db.query("insert into company_members(company_id,user_id,role) values($1,$2,'admin'),($3,$4,'admin')",[company,owner,foreign,outsider]);
await db.query("insert into subscriptions values($1,'pro','active'),($2,'pro','active')",[company,foreign]);
await db.query("insert into pro_additional_accounts values($1,1,$2,'production',now())",[company,future]);
await db.exec(`create table isolated_documents(company_id uuid references companies(id),label text);
 alter table isolated_documents enable row level security;grant select on isolated_documents to authenticated;
 create policy own_company on isolated_documents for select to authenticated using(public.is_company_member(company_id));`);
await db.query('insert into isolated_documents values($1,$2),($3,$4)',[company,'Document de l’entreprise TEST',foreign,'Document privé d’une autre entreprise']);
const out=path.resolve('../../output/recette-collaborateur-20261024');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const filename=pathname.startsWith('/assets/')?path.join(process.cwd(),'dist',pathname):path.join(process.cwd(),'dist/index.html');
 if(!filename.startsWith(path.join(process.cwd(),'dist')+path.sep)||!fs.existsSync(filename)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(filename)]||'application/octet-stream');res.end(fs.readFileSync(filename));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:'C:/dev/carnetpass-documents/.browsers/chromium-1248/chrome-win64/chrome.exe'});
const checks=[],errors=[];let invitationHash;
async function contextFor(actor,loggedIn=true){
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
 if(loggedIn)await context.addInitScript(session=>localStorage.setItem('sb-tsyukqcyfxcrjrhopvpv-auth-token',JSON.stringify(session)),session(actor));
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  const json=(data,status=200)=>route.fulfill({status,json:data,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,x-client-info,x-supabase-api-version,content-type,accept','access-control-allow-methods':'GET,POST,OPTIONS'}});
  if(route.request().method()==='OPTIONS')return json({});
  if(url.origin===origin&&!url.pathname.startsWith('/api/'))return route.continue();
  if(url.pathname==='/auth/v1/token')return json(session(actor));
  if(url.pathname==='/auth/v1/user')return json(user(actor));
  if(url.pathname.startsWith('/rest/v1/')){
   const table=url.pathname.split('/').at(-1);const body=route.request().postDataJSON();
   if(['invite_pro_account','accept_pro_account','manage_pro_account'].includes(table)){
    try {
     if(table==='invite_pro_account'){invitationHash=body.p_hash;await asActor(actor,'select invite_pro_account($1,$2,$3)',[body.p_company,body.p_email,body.p_hash]);return json(null);}
     if(table==='accept_pro_account'){const result=await asActor(actor,'select accept_pro_account($1) as company',[body.p_hash]);return json(result.rows[0].company);}
     await asActor(actor,'select manage_pro_account($1,$2,$3)',[body.p_company,body.p_target,body.p_add]);return json(null);
    }catch{return json({message:'Invitation ou accès refusé dans la base isolée'},400);}
   }
   if(table==='list_pro_accounts')return json((await asActor(actor,'select * from list_pro_accounts($1)',[company])).rows);
   const membership=(await asActor(actor,'select company_id,role,created_at from company_members where user_id=$1',[actor])).rows;
   let rows=[];
   if(table==='company_members')rows=membership;
   if(table==='profiles')rows=[{full_name:actor===owner?'Responsable TEST':'Collaborateur TEST'}];
   if(table==='companies'&&membership.length)rows=[{id:membership[0].company_id,name:'Entreprise isolée TEST',siret:'12345678901234',is_demo:false}];
   if(table==='company_verifications')rows=[{status:'approved',verified_siret:'12345678901234',verified_at:'2026-10-24'}];
   if(table==='subscriptions'&&membership.length)rows=[{plan:'pro',status:'active',stripe_live_managed:true,current_period_end:future}];
   if(table==='pro_additional_accounts'||table==='pro_account_assignments')rows=(await asActor(actor,`select * from ${table} where company_id=$1`,[company])).rows;
   return json(route.request().headers().accept?.includes('vnd.pgrst.object')?rows[0]||null:rows);
  }
  if(url.pathname==='/api/access-session')return json({maintenance:false});
  if(url.pathname==='/api/platform-admin'||url.pathname==='/api/maintenance-control')return json({},404);
  if(url.pathname==='/api/billing'&&url.searchParams.get('action')==='purchase-status')return json({available:false,seatsAvailable:false});
  if(url.pathname==='/api/billing'&&url.searchParams.get('action')==='portal-status')return json({available:false});
  if(url.pathname==='/api/billing'&&url.searchParams.get('action')==='invoices')return json({invoices:[],hasMore:false},actor===owner?200:403);
  if(url.origin===origin)return json({},503);
  errors.push('External request blocked: '+url.hostname);return route.abort();
 });return context;
}
try{
 const ownerContext=await contextFor(owner),ownerPage=await ownerContext.newPage();ownerPage.on('pageerror',e=>errors.push(e.message));
 await ownerPage.goto(origin+'/parametres-compte#comptes');
 await ownerPage.getByRole('button',{name:'Ajouter un compte',exact:true}).click();
 await ownerPage.getByLabel('Adresse e-mail du collaborateur').fill(email);
 await ownerPage.getByRole('button',{name:'Créer un lien d’invitation'}).click();
 const link=await ownerPage.getByLabel('Lien personnel à transmettre').inputValue();assert.ok(link.startsWith(origin+'/parametres-compte?invitation='));
 checks.push('Lien personnel créé depuis l’interface et hash enregistré par la vraie fonction SQL');
 await assert.rejects(asActor(outsider,'select accept_pro_account($1)',[invitationHash]),/Invitation unavailable/);
 await db.query('update auth.users set email_confirmed_at=null where id=$1',[collaborator]);
 await assert.rejects(asActor(collaborator,'select accept_pro_account($1)',[invitationHash]),/Invitation unavailable/);
 await db.query('update auth.users set email_confirmed_at=now() where id=$1',[collaborator]);
 checks.push('Refus d’une autre adresse et d’un destinataire non confirmé');
 const colleagueContext=await contextFor(collaborator,false),page=await colleagueContext.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(link);await page.locator('input[type=email]').fill(email);await page.getByLabel('Mot de passe',{exact:true}).fill('mot-de-passe-fictif');
 await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(link);
 await page.getByRole('button',{name:'Accepter mon invitation à rejoindre l’entreprise'}).click();
 await page.getByText('Le responsable de votre entreprise gère les comptes et les places souscrites.').waitFor();
 assert.equal(await page.getByRole('button',{name:'Ajouter un compte',exact:true}).count(),0);
 checks.push('Connexion simulée, conservation du lien et acceptation réelle dans PostgreSQL isolé');
 await assert.rejects(asActor(collaborator,'select accept_pro_account($1)',[invitationHash]),/Invitation unavailable/);
 const docs=(await asActor(collaborator,'select * from isolated_documents')).rows;
 assert.equal(docs.length,1);assert.equal(docs[0].company_id,company);
 checks.push('RLS : seul le document de sa propre entreprise est visible ; rejeu refusé');
 const professional={companyId:company,userId:collaborator};
 assert.deepEqual(await additionalAccountAccess(scopedClient(collaborator),professional,'production'),{additionalAccount:true});
 await db.query("update pro_additional_accounts set paid_until=now()-interval '1 minute' where company_id=$1",[company]);
 // At expiry RLS hides the assignment itself; the upstream company check
 // must deny access, rather than treating a missing assignment as main access.
 assert.equal((await asActor(collaborator,'select is_company_member($1) as allowed',[company])).rows[0].allowed,false);
 assert.equal((await asActor(collaborator,'select * from isolated_documents')).rows.length,0);
 await db.query('update pro_additional_accounts set paid_until=$1 where company_id=$2',[future,company]);
 checks.push('Place active reconnue par le contrôle serveur ; expiration refusée par les règles SQL de l’entreprise');
 await page.screenshot({path:path.join(out,'collaborateur-accepte.png'),fullPage:true});
 await ownerPage.reload();await ownerPage.getByRole('button',{name:'Ajouter un compte',exact:true}).click();
 await ownerPage.getByText(email,{exact:true}).waitFor();ownerPage.on('dialog',dialog=>dialog.accept());
 await ownerPage.getByRole('button',{name:'Retirer l’accès',exact:true}).click();
 await ownerPage.getByText('Accès retiré. La place reste disponible et facturée.').waitFor();
 assert.equal((await asActor(collaborator,'select * from isolated_documents')).rows.length,0);
 assert.equal((await asActor(collaborator,'select company_id from company_members where user_id=$1',[collaborator])).rows.length,0);
 assert.equal((await db.query('select quantity from pro_additional_accounts where company_id=$1',[company])).rows[0].quantity,1);
 checks.push('Retrait depuis l’interface : accès retiré, documents conservés, capacité inchangée');
 assert.deepEqual(errors,[]);
 const report={result:'passed',isolation:'PostgreSQL PGlite en mémoire, navigateur et services Auth/Stripe simulés ; toute requête externe bloquée',checks,realAccountCreated:false,realEmailSent:false,financialOperation:false,productionModified:false};
 fs.writeFileSync(path.join(out,'rapport.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.message);throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));await db.close();}
