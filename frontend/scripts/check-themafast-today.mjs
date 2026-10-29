import fs from 'node:fs';
import {createCanvas,DOMMatrix,ImageData,Path2D} from '@napi-rs/canvas';
Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
const state=JSON.parse(fs.readFileSync('C:/dev/carnetpass-documents/state/collector.json','utf8'));
const records=[];
for(const a of state.assets.filter(a=>a.date.startsWith('2026-10-25'))){
 const pdf=await getDocument({data:new Uint8Array(fs.readFileSync(a.path)),useSystemFonts:true}).promise;
 const p=await pdf.getPage(1),tc=await p.getTextContent();
 const text=tc.items.map(i=>i.str).join(' ');
 const v=p.getViewport({scale:.8}),canvas=createCanvas(Math.ceil(v.width),Math.ceil(v.height));
 await p.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;
 fs.mkdirSync('C:/dev/chaudiere-web3/tmp/themafast-today',{recursive:true});
 fs.writeFileSync('C:/dev/chaudiere-web3/tmp/themafast-today/'+a.key+'.png',canvas.toBuffer('image/png'));
 records.push({key:a.key,type:a.type,pages:pdf.numPages,firstPage:text.slice(0,750)});
 p.cleanup();
}
fs.writeFileSync('C:/dev/chaudiere-web3/tmp/themafast-today/check.json',JSON.stringify(records,null,2));
console.log(JSON.stringify(records,null,2));
