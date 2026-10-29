import { useId, useState } from 'react';
import { adminBrandLabel, organizeAdminDocuments } from '../lib/admin-document-organization.js';
import { documentGroups, documentTypeFromTitle } from '../lib/document-types.js';

export default function AdminDocumentBrowser({documents,renderDocument,categories,label}){
 const id=useId(),[filters,setFilters]=useState({search:'',brand:'',type:'',issue:'',status:''}),[page,setPage]=useState(1);
 const {groups,duplicates,visibleDocuments}=organizeAdminDocuments(documents,filters);
 const pages=Math.max(1,Math.ceil(groups.length/12)),current=Math.min(page,pages);
 const brands=[...new Set(documents.map(d=>adminBrandLabel(d.manufacturer)))].sort((a,b)=>a.localeCompare(b,'fr'));
 function change(key,value){setFilters(previous=>({...previous,[key]:value}));setPage(1);}
 return <div className="admin-document-browser" aria-label={label}>
  <div className="admin-document-filters">
   <label htmlFor={`${id}-search`}>Rechercher un modèle ou une référence<input id={`${id}-search`} type="search" value={filters.search} onChange={e=>change('search',e.target.value)} placeholder="Ex. ThemaFast, 0010015384, VU FR…" /></label>
   <label htmlFor={`${id}-brand`}>Marque<select id={`${id}-brand`} value={filters.brand} onChange={e=>change('brand',e.target.value)}><option value="">Toutes les marques</option>{brands.map(brand=><option key={brand}>{brand}</option>)}</select></label>
   <label htmlFor={`${id}-type`}>Type de document<select id={`${id}-type`} value={filters.type} onChange={e=>change('type',e.target.value)}><option value="">Tous les types</option>{documentGroups.map(([type,name])=><option key={type} value={type}>{name}</option>)}</select></label>
   <label htmlFor={`${id}-issue`}>Points à examiner<select id={`${id}-issue`} value={filters.issue} onChange={e=>change('issue',e.target.value)}><option value="">Tous les documents</option><option value="duplicate">Doublons possibles</option><option value="category">Catégorie manquante</option><option value="index">Indexation en échec ou OCR nécessaire</option></select></label>
   {new Set(documents.map(d=>d.status)).size>1&&<label htmlFor={`${id}-status`}>État de validation<select id={`${id}-status`} value={filters.status} onChange={e=>change('status',e.target.value)}><option value="">Tous les états</option><option value="approved">Validés</option><option value="rejected">Rejetés</option><option value="pending_review">À valider</option></select></label>}
  </div>
  <p role="status">{visibleDocuments} document(s) · {groups.length} modèle(s) · classement par marque, modèle et type.</p>
  {duplicates.size>0&&<p className="admin-document-warning">{duplicates.size} fiches ont un PDF identique pour la même référence et catégorie. Elles sont signalées sans suppression automatique ; une notice commune à des références différentes n’est pas un doublon.</p>}
  {groups.length===0?<p>Aucun document ne correspond à ces filtres.</p>:<>
   <nav className="platform-admin-pagination" aria-label={`Pages : ${label}`}><button type="button" disabled={current<=1} onClick={()=>setPage(current-1)}>← Précédente</button><span>Page {current} sur {pages}</span><button type="button" disabled={current>=pages} onClick={()=>setPage(current+1)}>Suivante →</button></nav>
   <ul>{groups.slice((current-1)*12,current*12).map(group=><li key={group.key} className="admin-document-model">
    <details><summary><span>{group.manufacturer} · {group.model||group.reference}</span><small>{group.reference} · {categories.find(([value])=>value===group.category)?.[1]||'Catégorie à renseigner'} · {group.entries.length} document(s)</small></summary>
     {documentGroups.map(([type,name])=>{const entries=group.entries.filter(d=>documentTypeFromTitle(d.title)===type);return entries.length>0&&<div key={type} className="admin-document-type"><h4>{name} ({entries.length})</h4><ul>{entries.map(entry=>renderDocument(entry,duplicates.has(entry.id)))}</ul></div>;})}
    </details>
   </li>)}</ul>
  </>}
 </div>;
}
