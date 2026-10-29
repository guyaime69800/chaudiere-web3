import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { loadEnv } from 'vite';
import middleware from '../middleware.js';
import accessSession from '../server/access-session.js';
import platformAdmin from '../server/platform-admin.js';
import maintenanceControl from '../server/maintenance-control.js';
import { adminTestWorkspace } from '../server/admin-test-workspace.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/dev/carnetpass-documents/node_modules/playwright');
const publicEnv=loadEnv('production',process.cwd(),'VITE_');
const storageKey=`sb-${new URL(publicEnv.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
Object.assign(process.env,{VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',CARNETPASS_PRODUCTION_ADMIN_ENABLED:'true',CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF:'tsyukqcyfxcrjrhopvpv',VITE_SUPABASE_URL:'https://tsyukqcyfxcrjrhopvpv.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'test-public',SUPABASE_SECRET_KEY:'test-secret',UPSTASH_REDIS_REST_KV_REST_API_URL:'https://redis.invalid',UPSTASH_REDIS_REST_KV_REST_API_TOKEN:'test-redis'});
let enabled=true,role=null,adminLoads=0,crossSiteReturnWithoutCookie=false;
const user={id:'11111111-1111-4111-8111-111111111111',email:'test@example.invalid',email_confirmed_at:'2026-01-01',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{role:'founder'},factors:[]};
const testRecords = new Map();
const testDatabase = { async rpc(name, params) {
 assert.equal(params.p_actor,user.id);
 if(name==='open_admin_test_workspace')return {data:{id:user.id,environment:'test'}};
 assert.equal(name,'admin_test_command');
 if(params.p_action==='snapshot')return {data:{id:user.id,environment:'test',records:[...testRecords.values()],billing:{}}};
 if(params.p_action==='get')return testRecords.has(params.p_id)?{data:testRecords.get(params.p_id)}:{error:{message:'Not found'}};
 if(params.p_action.startsWith('save_')){const record={id:params.p_id,kind:params.p_action.slice(5),data:params.p_data,createdAt:new Date().toISOString()};testRecords.set(record.id,record);return {data:record};}
 throw Error('Unsupported isolated RPC');
} };
globalThis.fetch=async(input,init={})=>{const url=typeof input==='string'?input:input.url;
 if(url.startsWith('https://redis.invalid'))return Response.json({result:JSON.stringify({enabled,message:'Maintenance de test'})});
 if(url.includes('/auth/v1/user'))return Response.json(user);
 if(url.includes('/rest/v1/platform_admins'))return Response.json(role?[{role}]:[]);
 if(url.includes('/rest/v1/rpc/open_admin_test_workspace'))return Response.json((await testDatabase.rpc('open_admin_test_workspace',JSON.parse(init.body))).data);
 if(url.includes('/rest/v1/'))return Response.json([]);
 throw Error('Network denied in isolated test');
};
const tls = process.env.CARNETPASS_TEST_TLS_KEY && process.env.CARNETPASS_TEST_TLS_CERT;
const createServer = handler => tls ? https.createServer({key:fs.readFileSync(process.env.CARNETPASS_TEST_TLS_KEY),cert:fs.readFileSync(process.env.CARNETPASS_TEST_TLS_CERT)},handler) : http.createServer(handler);
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'https://carnetpass.test');
 if(req.headers['sec-fetch-site']==='cross-site'&&url.pathname==='/administration-interne'&&url.searchParams.get('test')==='1'){
  crossSiteReturnWithoutCookie=!(req.headers.cookie||'').includes('__Host-carnetpass-internal=');
 }
 const gate=await middleware(new Request(url,{method:req.method,headers:req.headers}));
 if(gate.headers.get('x-middleware-next')!=='1'){res.writeHead(gate.status,Object.fromEntries(gate.headers));res.end(await gate.text());return;}
 for(const [k,v]of gate.headers)if(!k.startsWith('x-middleware'))res.setHeader(k,v);
 res.status=n=>(res.statusCode=n,res);res.json=b=>(res.setHeader('Content-Type','application/json'),res.end(JSON.stringify(b)));
 res.send=b=>res.end(b);
 req.query=Object.fromEntries(url.searchParams);
 if(req.url.startsWith('/api/access-session'))return accessSession(req,res);
 if(req.url.startsWith('/api/platform-admin-documents'))return res.status(200).json({documents:[]});
 if(url.searchParams.get('scope')==='test'&&url.pathname==='/api/platform-admin'){
  if(role!=='founder')return res.status(403).json({message:'Founder required'});
  return adminTestWorkspace(req,res,{user,database:testDatabase,rate:async()=>{}});
 }
 if(req.url.startsWith('/api/platform-admin')){if(url.searchParams.get('security')!=='1')adminLoads++;return platformAdmin(req,res);}
 if(req.url.startsWith('/api/maintenance-control'))return maintenanceControl(req,res);
 if(req.url.startsWith('/api/'))return res.status(403).json({ok:false});
 const filename=url.pathname.startsWith('/assets/')||/\.(js|css|png|svg|webmanifest|ico)$/.test(url.pathname)?path.join(process.cwd(),'dist',url.pathname):path.join(process.cwd(),'dist/index.html');
 if(!filename.startsWith(path.join(process.cwd(),'dist')+path.sep)||!fs.existsSync(filename)){res.statusCode=404;res.end();return;}
 const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'}[path.extname(filename)]||'application/octet-stream';res.setHeader('Content-Type',type);res.end(fs.readFileSync(filename));
}catch(e){res.statusCode=500;res.end('Isolated test failed');console.error(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`${tls?'https':'http'}://127.0.0.1:${server.address().port}`;
let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE || 'C:/dev/carnetpass-documents/.browsers/chromium-1248/chrome-win64/chrome.exe'});
 for(const identity of ['anonymous','pro','company-collaborator','operator','founder']){
  role=['operator','founder'].includes(identity)?identity:null;enabled=true;
  const jwt=[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',aal:'aal2',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)})).toString('base64url'),Buffer.alloc(32).toString('base64url')].join('.');
  const context=await browser.newContext({extraHTTPHeaders:identity==='anonymous'?{}:{Authorization:`Bearer ${jwt}`},serviceWorkers:'block',ignoreHTTPSErrors:Boolean(tls)});
  await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.request().url().includes('/auth/v1/user')?r.fulfill({json:user,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,x-client-info,x-supabase-api-version','access-control-allow-methods':'GET,POST,OPTIONS'}}):r.abort());
  if(identity!=='anonymous')await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:storageKey,session:{access_token:jwt,refresh_token:'fake-local-test',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>console.log('Page error: '+e.message));console.log('Checking '+identity);
  const direct=await page.goto(origin+'/administration-interne');
  if(!role){assert.equal(direct.status(),identity==='anonymous'?401:403);assert.doesNotMatch(await page.locator('body').innerText(),/Entreprises|Mettre le site|Collaborateurs internes/);}
  else{
   assert.equal(direct.status(),200);await page.getByRole('heading',{name:'Administration CarnetPass',exact:true}).waitFor().catch(async e=>{console.log('Page path: '+new URL(page.url()).pathname);console.log((await page.locator('body').innerText()).slice(0,900));throw e;});
   assert.equal(await page.getByRole('link',{name:'Mettre le site en maintenance',exact:true}).count(),role==='founder'?1:0);
   assert.equal(await page.getByRole('heading',{name:'Mon compte de test',exact:true}).count(),role==='founder'?1:0);
   assert.equal(await page.getByRole('link',{name:/Ouvrir mon espace de test/}).count(),0);
   if(role==='founder'){
    await page.getByRole('button',{name:'Ouvrir mon compte de test',exact:true}).click();
    const panel=page.locator('[aria-label="Espace de test privé Paris 2"]');await panel.waitFor();
    await panel.getByLabel('Marque',{exact:true}).fill('Marque TEST');await panel.getByLabel('Modèle',{exact:true}).fill('Modèle TEST');
    await panel.getByRole('button',{name:'Enregistrer dans mon espace de test',exact:true}).click();
    await panel.getByRole('button',{name:'Créer une fiche PDF TEST',exact:true}).waitFor();
    await panel.getByRole('button',{name:'Créer une fiche PDF TEST',exact:true}).click();
    await panel.getByRole('button',{name:'Télécharger le PDF TEST',exact:true}).waitFor();
    const downloaded=page.waitForEvent('download');await panel.getByRole('button',{name:'Télécharger le PDF TEST',exact:true}).click();
    assert.match((await downloaded).suggestedFilename(),/^TEST-.*\.pdf$/);
    assert.equal(testRecords.size,2);
    if(tls){
     await context.setExtraHTTPHeaders({});
     await context.addCookies([{name:'__Host-carnetpass-internal',value:jwt,url:origin,httpOnly:true,secure:true,sameSite:'Strict'}]);
     await context.route('https://stripe-return.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<a href="${origin}/administration-interne?test=1">Retour CarnetPass</a>`}));
     await page.goto('https://stripe-return.test/');
     await page.getByRole('link',{name:'Retour CarnetPass',exact:true}).click();
     await page.getByRole('heading',{name:'Administration CarnetPass',exact:true}).waitFor();
     assert.equal(crossSiteReturnWithoutCookie,true,'Strict cookie must be absent on the cross-site navigation');
     assert.equal(new URL(page.url()).search,'?test=1');
     await panel.waitFor();
     console.log('Cross-site HTTPS return restored the Strict admin cookie after verified founder + MFA.');
     await context.setExtraHTTPHeaders({Authorization:`Bearer ${jwt}`});
    }
   }
  }
  // Client navigation from an already loaded shell must not mount admin data for ordinary users.
  enabled=false;await page.goto(origin+'/connexion-interne');await page.getByRole('link',{name:'Mentions légales',exact:true}).waitFor();
  const loadsBefore=adminLoads;enabled=true;
  await page.evaluate(()=>{history.pushState({},'', '/administration-interne');window.dispatchEvent(new PopStateEvent('popstate'));});
  if(role)await page.getByRole('heading',{name:'Administration CarnetPass',exact:true}).waitFor();
  else{await page.getByRole('heading',{name:'Le site est momentanément en maintenance.'}).waitFor();assert.equal(adminLoads,loadsBefore);assert.equal(await page.getByRole('link',{name:'Mettre le site en maintenance'}).count(),0);}
  if(role){role=null;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('heading',{name:'Le site est momentanément en maintenance.'}).waitFor();}
  results.push({identity,directStatus:direct.status(),spaProtected:true,revocationChecked:['operator','founder'].includes(identity)});
  await context.close();
 }
 const c=await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:Boolean(tls)});await c.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.request().url().includes('/auth/v1/user')?r.fulfill({json:user,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,x-client-info,x-supabase-api-version','access-control-allow-methods':'GET,POST,OPTIONS'}}):r.abort());const p=await c.newPage();
 await p.goto(origin+'/connexion-interne');await p.getByRole('button',{name:'Se connecter',exact:true}).waitFor();assert.equal(await p.getByRole('link',{name:'Créer un compte',exact:true}).count(),0);await c.close();
 console.log(JSON.stringify({isolated:true,productionContacted:false,results,privateLogin:true,strictCookieCrossSiteReturn:tls?crossSiteReturnWithoutCookie:'not-run'},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
