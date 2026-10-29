import { documentTypeFromTitle } from './document-types.js';
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const brands=new Map([['chappee','Chappée'],['atlantic','Atlantic'],['saunierduval','Saunier Duval'],['dedietrich','De Dietrich'],['elmleblanc','ELM Leblanc'],['vaillant','Vaillant'],['frisquet','Frisquet'],['viessmann','Viessmann'],['airwell','Airwell'],['chaffoteaux','Chaffoteaux']]);
export const adminBrandLabel=value=>brands.get(normalize(value).replace(/[^a-z0-9]/g,''))||String(value||'Marque à renseigner').trim();
const collator=new Intl.Collator('fr',{numeric:true,sensitivity:'base'});
export function duplicateDocumentIds(documents){
 const groups=new Map();
 for(const d of documents){if(!d.sha256)continue;const key=JSON.stringify([adminBrandLabel(d.manufacturer),normalize(d.model_reference),d.catalog_category||'',documentTypeFromTitle(d.title),d.sha256]);
 if(!groups.has(key))groups.set(key,[]);groups.get(key).push(d.id);}
 return new Set([...groups.values()].filter(ids=>ids.length>1).flat());
}
export function organizeAdminDocuments(documents,{search='',brand='',type='',issue='',status=''}={}){
 const duplicates=duplicateDocumentIds(documents),query=normalize(search);
 const filtered=documents.filter(d=>(!status||d.status===status)&&(!brand||adminBrandLabel(d.manufacturer)===brand)&&(!type||documentTypeFromTitle(d.title)===type)
 &&(!query||normalize([d.manufacturer,d.model_name,d.model_reference,d.title,...(d.model_aliases||[])].join(' ')).includes(query))
 &&(!issue||(issue==='duplicate'&&duplicates.has(d.id))||(issue==='category'&&!d.catalog_category)||(issue==='index'&&['failed','needs_ocr'].includes(d.rag_status))));
 const models=new Map();
 for(const d of filtered){const manufacturer=adminBrandLabel(d.manufacturer),key=JSON.stringify([manufacturer,normalize(d.model_reference),d.catalog_category||'']);
 if(!models.has(key))models.set(key,{key,manufacturer,model:d.model_name||'',reference:d.model_reference||'Référence à renseigner',category:d.catalog_category||'',entries:[]});models.get(key).entries.push(d);}
 const rank={installation_manual:0,user_manual:1,exploded_view:2,technical_manual:3};
 for(const group of models.values())group.entries.sort((a,b)=>rank[documentTypeFromTitle(a.title)]-rank[documentTypeFromTitle(b.title)]||collator.compare(a.title,b.title)||String(a.id).localeCompare(String(b.id)));
 return {groups:[...models.values()].sort((a,b)=>collator.compare(a.manufacturer,b.manufacturer)||collator.compare(a.model||a.reference,b.model||b.reference)||collator.compare(a.reference,b.reference)||collator.compare(a.category,b.category)),duplicates,visibleDocuments:filtered.length};
}
