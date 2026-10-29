import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
const directory=process.argv[3]||'C:/dev/chaudiere-web3/tmp/pdfs';
fs.mkdirSync(directory,{recursive:true});
const pdf=await getDocument({data:new Uint8Array(fs.readFileSync(process.argv[2]||'C:/dev/chaudiere-web3/output/pdf/CarnetPass-projet-et-outils-de-A-a-Z.pdf')),useSystemFonts:true}).promise;
const report=[];
for(let i=1;i<=pdf.numPages;i++){
 const page=await pdf.getPage(i),viewport=page.getViewport({scale:1.2});
 const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
 await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
 fs.writeFileSync(path.join(directory,`page-${String(i).padStart(2,'0')}.png`),canvas.toBuffer('image/png'));
 const content=await page.getTextContent();const text=content.items.map(t=>t.str).join(' ');
 if(text.includes('\uFFFD'))throw Error('Invalid text on page '+i);
 report.push({page:i,words:text.split(/\s+/).length,text});
}
const {loadImage}=await import('@napi-rs/canvas');
for(let start=1;start<=pdf.numPages;start+=6){
 const sheet=createCanvas(1080,1520),ctx=sheet.getContext('2d');ctx.fillStyle='#d6d6d6';ctx.fillRect(0,0,1080,1520);
 for(let j=0;j<6&&start+j<=pdf.numPages;j++){
  const im=await loadImage(path.join(directory,`page-${String(start+j).padStart(2,'0')}.png`));
  const col=j%3,row=Math.floor(j/3);ctx.drawImage(im,col*360+6,row*760+12,348,492);
  ctx.fillStyle='#111';ctx.font='16px sans-serif';ctx.fillText('Page '+(start+j),col*360+12,row*760+526);
 }
 fs.writeFileSync(path.join(directory,`planche-${start}.png`),sheet.toBuffer('image/png'));
}
fs.writeFileSync(path.join(directory,'text-review.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pages:pdf.numPages,words:report.reduce((s,p)=>s+p.words,0),minPageWords:Math.min(...report.map(p=>p.words)),rendered:true}));
