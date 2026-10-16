// Local UI only; separate empty Chrome profile and synthetic aid fixture.
// Run Vite at http://127.0.0.1:5183 with dummy Supabase public configuration first.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {initialAidDrafts} from '../server/lib/aid-drafts.js';
import {simulateAid} from '../shared/aid-engine.js';
import {createCanvas} from '@napi-rs/canvas';
import {PLATE_FIELDS} from '../shared/plate-scan.js';
const directory=path.resolve('.verification-artifacts');await mkdir(directory,{recursive:true});
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--remote-debugging-port=9225',`--user-data-dir=${path.join(directory,'chrome-ui')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let socket;
try {
  let version;for(let attempt=0;attempt<30;attempt++){try{version=await (await fetch('http://127.0.0.1:9225/json/version',{signal:AbortSignal.timeout(1000)})).json();break;}catch{await delay(200);}}
  assert.ok(version,'Isolated Chrome did not start.');
  socket=new WebSocket(version.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let sequence=0;const pending=new Map(),errors=[];
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`${method} timed out`));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const item=pending.get(msg.id);if(!item)return;clearTimeout(item.timer);pending.delete(msg.id);msg.error?item.reject(new Error(msg.error.message)):item.resolve(msg.result);return;}if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);if(msg.method==='Fetch.requestPaused'&&msg.params.request.url.includes('/api/shiba-devis')){const request=msg.params.request;const body=JSON.parse(request.postData||'{}');const fixture={id:'fixture-aid',version:1,status:'published',validated_by:'fixture-admin',validated_at:'2026-10-07T10:00:00Z',rule:initialAidDrafts[0]};const result=simulateAid(body.project||{},[fixture],{today:'2026-10-07'});call('Fetch.fulfillRequest',{requestId:msg.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({ok:true,result,ticket:null})).toString('base64')},msg.sessionId).catch(e=>errors.push(e.message));}});
  const {targetId}=await call('Target.createTarget',{url:'about:blank'});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const cmd=(m,p)=>call(m,p,sessionId);
  const evaluate=async expression=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
  await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Fetch.enable',{patterns:[{urlPattern:'*/api/shiba-devis*'}]});
  await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});await cmd('Page.navigate',{url:'http://127.0.0.1:5183/shiba-devis'});
  for(let i=0;i<50;i++){if(await evaluate("Boolean(document.querySelector('input[name=budget]'))"))break;await delay(100);}
  assert.ok(await evaluate("Boolean(document.querySelector('input[name=budget]'))"),'Financial form missing.');
  await evaluate("Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r})))");
  assert.ok(await evaluate("[...document.images].filter(i=>i.classList.contains('devis-mascot')).every(i=>i.naturalWidth>0)"));
  const capture=async name=>{const r=await cmd('Page.captureScreenshot',{format:'png'});await writeFile(path.join(directory,`${name}.png`),Buffer.from(r.data,'base64'));};
  await capture('devis-desktop');
  const inputs={housing:'house',occupancy:'owner',work:'heating',currentEquipment:'boiler',postalCode:'69000',housingAge:'20',principalResidence:'yes',plannedEquipment:'heat_pump_air_water',workDate:'2026-11-04',householdSize:'2',taxIncome:'20000',taxYear:'2025',budget:'15000',eligibleCost:'12000',ceeAmount:'2000',otherGrants:'0',previousMpr:'0',technicalCriteria:'yes',rgeDeclaration:'yes'};
  for(const [name,value] of Object.entries(inputs)){await evaluate(`(()=>{const e=document.querySelector('[name=${name}]');if(!e)throw new Error('Missing input ${name}');Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);await delay(20);}
  await evaluate("document.querySelector('input[name=budget]').closest('form').requestSubmit()");
  for(let i=0;i<30;i++){if(await evaluate("document.body.innerText.includes('Votre estimation')"))break;await delay(100);}
  assert.ok(await evaluate("document.body.innerText.includes('5 000,00')||document.body.innerText.includes('5 000,00')"),'Server engine fixture calculation missing.');
  await evaluate("[...document.querySelectorAll('h3')].find(e=>e.textContent==='Votre estimation').scrollIntoView()");await capture('devis-desktop-result');
  await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate('window.scrollTo(0,0)');await capture('devis-mobile');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),'Mobile horizontal overflow.');
  await evaluate("document.querySelector('input[name=budget]').scrollIntoView()");await capture('devis-mobile-budget');
  await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent==='Effacer mon brouillon').click()");await delay(100);assert.equal(await evaluate("document.querySelector('input[name=budget]').value"),'');
  await cmd('Page.navigate',{url:'http://127.0.0.1:5183/espace-particulier'});for(let i=0;i<30;i++){if(await evaluate("Boolean(document.querySelector('a[href=\"/shiba-devis\"]'))"))break;await delay(100);}assert.ok(await evaluate("Boolean(document.querySelector('a[href=\"/shiba-devis\"]'))"));await capture('individual-mobile');
  await cmd('Fetch.disable');
  let rejectScan=false;
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.method!=='Fetch.requestPaused'||!msg.params.request.url.includes('/api/plate-scan'))return;
    const fields=Object.fromEntries(PLATE_FIELDS.map(k=>[k,{value:{brand:'Airwell',model:'AW-CBV007-N11',productReference:'7SP04H038',serialNumber:'FIXTURE-PRIVATE',equipmentType:'air_conditioning'}[k]||'',evidence:k==='manufactureYear'?'':`Literal ${k}`,uncertain:true}]));
    call('Fetch.fulfillRequest',{requestId:msg.params.requestId,responseCode:rejectScan?503:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(rejectScan?{ok:false,error:'Réseau de test indisponible'}:{ok:true,fields,candidates:[],ticket:'10000000-0000-0000-0000-000000000001'})).toString('base64')},msg.sessionId).catch(e=>errors.push(e.message));
  });
  // Existing financial listener must not fulfil the scan request.
  await cmd('Fetch.enable',{patterns:[{urlPattern:'*/api/plate-scan*'}]});
  await cmd('Page.navigate',{url:'http://127.0.0.1:5183/scripts/fixtures/plate-ui.html'});
  for(let i=0;i<40;i++){if(await evaluate("Boolean(document.querySelector('input[name=manualBrand]'))"))break;await delay(100);}
  const canvas=createCanvas(600,300),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,600,300);ctx.fillStyle='#111';ctx.font='24px sans-serif';ctx.fillText('AIRWELL MODEL AW-CBV007-N11',20,60);ctx.fillText('PRODUCT 7SP04H038',20,110);ctx.fillText('SERIAL FIXTURE-PRIVATE',20,160);
  const platePath=path.join(directory,'synthetic-plate.png');await writeFile(platePath,canvas.toBuffer('image/png'));
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Scanner la plaque').click()");
  const {root}=await cmd('DOM.getDocument');const {nodeId}=await cmd('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file]'});await cmd('DOM.setFileInputFiles',{nodeId,files:[platePath]});
  for(let i=0;i<40;i++){if(await evaluate("Boolean(document.querySelector('img[alt]'))"))break;await delay(100);}
  assert.ok(await evaluate("document.querySelector('img').naturalWidth>0"),'Compressed preview missing.');
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Analyser la plaque').click()");
  for(let i=0;i<40;i++){if(await evaluate("document.body.innerText.includes('Modèle inconnu')"))break;await delay(100);}
  assert.equal(await evaluate("[...document.querySelectorAll('.devis-field')].find(l=>l.textContent.includes('Année de fabrication')).querySelector('input').value"),'');
  assert.ok(await evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"),'Scan mobile overflow.');await capture('scan-mobile-confirmation');
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('préremplir la fiche')).click()");
  assert.ok(await evaluate("document.body.innerText.includes('Équipement non enregistré.')"),'Premature equipment save.');
  rejectScan=true;await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Scanner la plaque').click()");
  const {root:root2}=await cmd('DOM.getDocument');const {nodeId:file2}=await cmd('DOM.querySelector',{nodeId:root2.nodeId,selector:'input[type=file]'});await cmd('DOM.setFileInputFiles',{nodeId:file2,files:[platePath]});
  for(let i=0;i<30;i++){if(await evaluate("Boolean([...document.querySelectorAll('button')].find(b=>b.textContent==='Analyser la plaque'))"))break;await delay(100);}
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Analyser la plaque').click()");
  for(let i=0;i<30;i++){if(await evaluate("Boolean(document.querySelector('[role=alert]'))"))break;await delay(100);}
  assert.ok(await evaluate("document.querySelector('[role=alert]').textContent.includes('Réseau de test')"));assert.equal(await evaluate("document.querySelector('input[name=manualBrand]').disabled"),false);
  assert.deepEqual(errors,[]);await writeFile(path.join(directory,'ui-report.json'),JSON.stringify({syntheticFixtures:true,realBrowser:true,desktop:'1440x1050',mobile:'390x844',checks:['mascot image loaded','progressive questionnaire','server deterministic fixture result','mobile no overflow','erase draft','individual entry'],errors},null,2));
  await cmd('Page.close');await call('Browser.close');console.log(`Local browser checks passed. Screenshots: ${directory}`);
} finally {if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({id:999999,method:'Browser.close'}));socket?.close();chrome.kill();}
