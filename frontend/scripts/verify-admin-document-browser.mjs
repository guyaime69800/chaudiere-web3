import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {createRequire} from 'node:module';
import path from 'node:path';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
const require=createRequire(import.meta.url),{chromium}=require('C:/dev/carnetpass-documents/node_modules/playwright');
const fixtures=Array.from({length:16},(_,i)=>({id:`v${i}`,manufacturer:'Vaillant',model_name:`VU ${i+1} R2`,model_reference:`vu-${i+1}-r2`,catalog_category:'boiler',title:'vue-eclatee',sha256:String(i).padStart(64,'a'),status:'approved'}));
fixtures.push({...fixtures[0],id:'duplicate'},{...fixtures[0],id:'c1',manufacturer:'Chappee',model_name:'Initia',model_reference:'initia-exact',title:'notice-installation'},{...fixtures[0],id:'c2',manufacturer:'Chappée',model_name:'Initia',model_reference:'initia-exact',title:'notice-utilisation'});
const html=`<!doctype html><html lang="fr"><head><title>Test isolé classement</title></head><body><main class="platform-admin"><h1>Classement des documents - test isolé</h1><div id="root"></div></main><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import Browser from'/src/components/AdminDocumentBrowser.jsx';import'/src/pages/PlatformAdminPage.css';createRoot(document.getElementById('root')).render(React.createElement(Browser,{documents:${JSON.stringify(fixtures)},categories:[['boiler','Chaudières']],label:'Documents de test',renderDocument:entry=>React.createElement('li',{key:entry.id},entry.title)}));</script></body></html>`;
const out='C:/dev/chaudiere-web3/tmp/output/admin-documents-20261025';fs.mkdirSync(out,{recursive:true});
const entry=path.resolve('scripts/.admin-document-fixture.jsx');
fs.writeFileSync(entry,html.match(/<script type="module">([\s\S]*)<\/script>/)[1].replace("'/src/components/","'../src/components/").replace("'/src/pages/","'../src/pages/"));
try{await build({configFile:false,define:{"process.env.NODE_ENV":"\"production\""},plugins:[react()],logLevel:'error',build:{outDir:out,emptyOutDir:false,lib:{entry,name:'AdminFixture',formats:['iife'],fileName:()=> 'fixture.js',cssFileName:'fixture'}}});}finally{fs.unlinkSync(entry);}
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><main class="platform-admin"><h1>Classement - test isolé</h1><div id="root"></div></main><script src="/fixture.js"></script></body></html>');return;}const name=req.url==='/fixture.js'?'fixture.js':req.url==='/fixture.css'?'fixture.css':null;if(!name){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync(path.join(out,name)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/dev/carnetpass-documents/.browsers/chromium-1248/chrome-win64/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1280,height:1000}});await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 page.on('pageerror',error=>console.log('BROWSER ERROR:',error.message));await page.goto(origin);await page.screenshot({path:out+'/debug.png',fullPage:true});console.log(await page.locator('body').innerText());await page.locator('select').nth(0).waitFor({timeout:5000});
 await page.locator('select').nth(0).selectOption('Chappée');await page.getByText('2 document(s) · 1 modèle(s)',{exact:false}).waitFor();
 await page.locator('.admin-document-model summary').click();assert.equal(await page.getByRole('heading',{name:'Notice d’installation (1)'}).count(),1);assert.equal(await page.getByRole('heading',{name:'Notice d’utilisation (1)'}).count(),1);
 await page.screenshot({path:out+'/desktop.png',fullPage:true});
 await page.locator('select').nth(0).selectOption('');await page.locator('select').nth(2).selectOption('duplicate');await page.getByText('2 document(s) · 1 modèle(s)',{exact:false}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:out+'/mobile.png',fullPage:true});
 console.log(JSON.stringify({brandGrouping:true,types:true,duplicateFilter:true,mobileOverflow:false,externalRequestsBlocked:true,out}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

