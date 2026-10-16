import { zipSync, strToU8 } from "fflate";
async function exportFetch(token,parameters,onProgress=()=>{}) {
 for(let attempt=0;attempt<=24;attempt++) {
  const response=await fetch("/api/account?"+new URLSearchParams(parameters),{headers:{Authorization:"Bearer "+token},cache:"no-store"});
  if(response.status!==429)return response;
  if(attempt===24)throw new Error("Export interrompu par la protection technique. Relancez-le plus tard ; les archives précédentes ne sont pas complètes.");
  onProgress("Export en pause pour la protection technique. Reprise automatique dans 30 secondes ; gardez cet onglet ouvert.");
  await new Promise(resolve=>setTimeout(resolve,30000));
 }
}
export async function companyDataRequest(token, action, parameters={}, method="GET", onProgress) {
 const response=method==="GET" && action==="export-page" ? await exportFetch(token,{action,...parameters},onProgress) : await fetch("/api/account"+(method==="GET"?"?"+new URLSearchParams({action,...parameters}):""),{
  method,headers:{Authorization:"Bearer "+token,...(method==="POST"?{"Content-Type":"application/json"}:{})},
  cache:"no-store",...(method==="POST"?{body:JSON.stringify({action,...parameters})}:{})});
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(result?.message||"Opération indisponible.");return result;
}
export function safeArchiveName(value) {return String(value||"document").normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g,"_").replace(/^\.+/,"").slice(0,120)||"document";}
function saveZip(entries,part) {
 const archive=zipSync(entries,{level:0});const url=URL.createObjectURL(new Blob([archive],{type:"application/zip"}));
 const link=document.createElement("a");link.href=url;link.download="carnetpass-dossiers-partie-"+part+".zip";document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export async function downloadCompanyExport(token,onProgress=()=>{}) {
 const manifest=await companyDataRequest(token,"export-manifest");
 let entries={},size=0,part=1,count=0;
 const add=(name,bytes)=>{if(size+bytes.length>80*1024*1024 && size){saveZip(entries,part++);entries={};size=0;}entries[name]=bytes;size+=bytes.length;};
 const summary={...manifest,parts:[],files:0};
 add("entreprise.json",strToU8(JSON.stringify(manifest,null,2)));
 add("LIRE-MOI.txt",strToU8("Export privé CarnetPass. Conservez toutes les parties ZIP dans un emplacement protégé. Les dossiers sont en JSON ; les pièces jointes gardent leur format. Les factures du service sont disponibles dans les paramètres du compte. Un export interrompu est incomplet : relancez-le. Évitez les modifications pendant l’export."));
 for(const table of manifest.tables){let offset=0;
  do{
   const page=await companyDataRequest(token,"export-page",{table,offset:String(offset)},"GET",onProgress);
   add("donnees/"+table+"-"+offset+".json",strToU8(JSON.stringify(page.rows,null,2)));
   for(const file of page.files){
    onProgress("Récupération des fichiers : "+(++count));
    const response=await exportFetch(token,{action:"export-file",table:file.table,id:file.id},onProgress);
    if(!response.ok)throw new Error("Export incomplet : une pièce jointe est indisponible. Relancez l’export.");
    const bytes=new Uint8Array(await response.arrayBuffer());
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),n=>n.toString(16).padStart(2,"0")).join("");
    if(bytes.length!==file.size || !file.sha256 || hash!==file.sha256.toLowerCase())throw new Error("Export incomplet : contrôle d’intégrité d’une pièce jointe impossible.");
    add("fichiers/"+safeArchiveName(file.equipmentId)+"/"+safeArchiveName(file.id)+"-"+safeArchiveName(file.name),bytes);
   }
   offset=page.next;
  }while(offset!==null);
 }
 if(size>79*1024*1024){saveZip(entries,part++);entries={};size=0;}
 summary.files=count;summary.parts=Array.from({length:part},(_,i)=>"carnetpass-dossiers-partie-"+(i+1)+".zip");summary.complete=true;
 add("EXPORT-TERMINE.json",strToU8(JSON.stringify(summary,null,2)));saveZip(entries,part);
 onProgress(part+" archive(s) téléchargée(s), "+count+" fichier(s) vérifié(s). Gardez toutes les parties ZIP.");
}
