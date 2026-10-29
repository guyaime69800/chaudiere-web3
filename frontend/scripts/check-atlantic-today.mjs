import fs from 'node:fs';
import {createCanvas,DOMMatrix,ImageData,Path2D} from '@napi-rs/canvas';
Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
const state=JSON.parse(fs.readFileSync('C:/dev/carnetpass-documents/state/collector.json','utf8'));
const out='C:/dev/chaudiere-web3/tmp/atlantic-20261026';fs.mkdirSync(out,{recursive:true});
const records=[];let index=0;const sheet=createCanvas(1200,Math.ceil(state.assets.filter(a=>a.date.startsWith('2026-10-26')).length/4)*460),ctx=sheet.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,sheet.width,sheet.height);
for(const a of state.assets.filter(a=>a.date.startsWith('2026-10-26'))){
 const pdf=await getDocument({data:new Uint8Array(fs.readFileSync(a.path)),useSystemFonts:true}).promise;
 const p=await pdf.getPage(1),tc=await p.getTextContent(),text=tc.items.map(i=>i.str).join(' ');
 const v=p.getViewport({scale:.5}),canvas=createCanvas(Math.ceil(v.width),Math.ceil(v.height));await p.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;
 fs.writeFileSync(out+'/'+a.key+'.png',canvas.toBuffer('image/png'));
 const x=(index%4)*300,y=Math.floor(index/4)*460;ctx.drawImage(canvas,x,y,290,410);ctx.fillStyle='black';ctx.font='12px Arial';ctx.fillText(String(index+1)+' '+a.type,x+5,y+430);index++;
 records.push({key:a.key,type:a.type,pages:pdf.numPages,firstPage:text.slice(0,1000)});p.cleanup();
}
fs.writeFileSync(out+'/contact.png',sheet.toBuffer('image/png'));fs.writeFileSync(out+'/check.json',JSON.stringify(records,null,2));console.log(JSON.stringify(records));
