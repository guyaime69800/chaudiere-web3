import fs from 'node:fs';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { jsPDF } from 'jspdf';
Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
const dir='C:/dev/chaudiere-web3/output/documents-20261025';
const source=dir+'/Saunier-Duval-ThemaFast-V25-R1-vue-eclatee.pdf';
const pdf=await getDocument({data:new Uint8Array(fs.readFileSync(source)),useSystemFonts:true}).promise;
let output;
for(let i=1;i<=pdf.numPages;i++){
 const p=await pdf.getPage(i),v=p.getViewport({scale:2.5}),natural=p.getViewport({scale:1});
 const size=[natural.width*25.4/72,natural.height*25.4/72];
 if(!output)output=new jsPDF({unit:'mm',format:size,orientation:size[0]>size[1]?'landscape':'portrait',compress:true});
 else output.addPage(size,size[0]>size[1]?'landscape':'portrait');
 const canvas=createCanvas(Math.ceil(v.width),Math.ceil(v.height));
 await p.render({canvasContext:canvas.getContext('2d'),viewport:v,background:'#ffffff'}).promise;
 output.addImage(new Uint8Array(canvas.toBuffer('image/jpeg',92)),'JPEG',0,0,...size);
 p.cleanup();
}
const target=dir+'/Saunier-Duval-ThemaFast-V25-R1-compatible.pdf';
output.setProperties({title:'Saunier Duval ThemaFast V25 R1 - Vue éclatée - copie compatible',subject:'Copie visuelle des 23 pages du PDF original ; original conservé'});
output.save(target);
console.log(JSON.stringify({target,pages:pdf.numPages,bytes:fs.statSync(target).size}));
