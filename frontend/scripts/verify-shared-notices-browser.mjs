import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { catalogModelsWithPublishedDocuments } from '../src/services/platformDocumentLibrary.js';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/dev/carnetpass-documents/node_modules/playwright');
const raw=fs.readFileSync('C:/dev/chaudiere-web3/tmp/vaillant-catalog-live-20261023.json');
const rows=JSON.parse(raw.toString(raw[0]===255?'utf16le':'utf8').replace(/^\uFEFF/,'' )).rows.filter(r=>r.published&&r.status==='approved').map(r=>({...r,manufacturer:'Vaillant'}));
const models=catalogModelsWithPublishedDocuments([],rows);
const selected=models.find(m=>m.manufacturerReference==='vu-146-5-5-r2-0010011669');
assert.ok(selected?.publishedDocuments.some(d=>/installation/.test(d.title)));
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user={id:actor,email:'test@example.invalid',email_confirmed_at:'2026-10-21',aud:'authenticated',role:'authenticated',factors:[]};
const jwt=[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({sub:actor,aal:'aal2',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),Buffer.alloc(32).toString('base64url')].join('.');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const relative=url.pathname.startsWith('/assets/')?url.pathname.slice(1):'index.html';
 const file=path.resolve('dist',relative);if(!file.startsWith(path.resolve('dist')+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',path.extname(file)==='.js'?'text/javascript':path.extname(file)==='.css'?'text/css':'text/html');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:'C:/dev/carnetpass-documents/.browsers/chromium-1248/chrome-win64/chrome.exe'});
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
 await context.addInitScript(({user,jwt})=>localStorage.setItem('sb-tsyukqcyfxcrjrhopvpv-auth-token',JSON.stringify({access_token:jwt,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user})),{user,jwt});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());const json=(data,status=200)=>route.fulfill({status,json:data,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  if(route.request().method()==='OPTIONS')return json({});
  if(url.origin===origin&&!url.pathname.startsWith('/api/'))return route.continue();
  if(url.pathname.startsWith('/auth/v1/user'))return json(user);
  if(url.pathname.startsWith('/rest/v1/')){
   const table=url.pathname.split('/').at(-1);let data=[];
   if(table==='company_members')data=[{company_id:'company',user_id:actor,role:'owner'}];
   if(table==='companies')data=[{id:'company',name:'Fixture',siret:'12345678901234',is_demo:false}];
   if(table==='subscriptions')data=[{plan:'pro',status:'active',current_period_end:'2099-01-01'}];
   if(table==='company_verifications')data=[{status:'approved',verified_siret:'12345678901234',verified_at:'2026-10-21'}];
   return json(route.request().headers().accept?.includes('vnd.pgrst.object')?data[0]||null:data);
  }
  if(url.pathname==='/api/access-session')return json({maintenance:false});
  if(url.pathname==='/api/platform-catalog-documents')return json({documents:rows});
  if(url.pathname==='/api/shiba-usage')return json({used:0,limit:100,remaining:100});
  return json({},404);
 });
 const page=await context.newPage();
 await page.goto(`${origin}/espace-pro`);
 await page.getByRole('button',{name:'Parcourir le catalogue technique →'}).click({timeout:10000}).catch(async e=>{console.error('Browser body:',await page.locator('body').innerText());throw e;});
 const dialog=page.getByRole('dialog',{name:'Catalogue technique'});
 await dialog.getByRole('button',{name:/Chaudières/}).click();
 await dialog.getByRole('button',{name:/^Vaillant/}).click();
 await dialog.getByRole('button').filter({hasText:'vu-146-5-5-r2-0010011669'}).click();
 const panel=dialog.getByRole('complementary',{name:'Notices du modèle sélectionné'});
 await panel.getByText('Notice d’installation',{exact:true}).waitFor();
 await panel.getByRole('button',{name:'Voir la vue éclatée'}).waitFor();
 await panel.getByText(/Commune à \d+ modèles/).first().click();
 assert.ok(await panel.getByText('vu-256-5-5-r6-0010021858',{exact:true}).count());
 fs.mkdirSync('C:/dev/chaudiere-web3/tmp/catalogue-browser',{recursive:true});
 await page.screenshot({path:'C:/dev/chaudiere-web3/tmp/catalogue-browser/shared-notice.png',fullPage:true});
 console.log('Browser verified: exact model shows view + shared installation notice; covered references visible. All API requests mocked; no provider contacted.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
