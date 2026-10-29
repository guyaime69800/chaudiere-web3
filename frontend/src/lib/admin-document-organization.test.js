import test from 'node:test';
import assert from 'node:assert/strict';
import {organizeAdminDocuments,duplicateDocumentIds} from './admin-document-organization.js';
const doc=(id,changes={})=>({id,manufacturer:'Vaillant',model_name:'VU 1206 R2',model_reference:'vu-r2',catalog_category:'boiler',title:'vue-eclatee',sha256:'a'.repeat(64),...changes});
test('sorting keeps exact revisions, manufacturers and categories separate',()=>{
 const result=organizeAdminDocuments([doc('r10',{model_name:'VU 1206 R10',model_reference:'vu-r10'}),doc('r2'),doc('foreign',{manufacturer:'Atlantic'}),doc('category',{catalog_category:'regulation'})]);
 assert.equal(result.groups.length,4);assert.equal(result.groups[0].manufacturer,'Atlantic');
 assert.deepEqual(result.groups.filter(g=>g.category==='boiler'&&g.manufacturer==='Vaillant').map(g=>g.model),['VU 1206 R2','VU 1206 R10']);
});
test('brand spelling is grouped for display without changing metadata',()=>{
 const docs=[doc('a',{manufacturer:'Chappee'}),doc('b',{manufacturer:'Chappée',title:'notice-installation'})];
 const result=organizeAdminDocuments(docs);assert.equal(result.groups.length,1);assert.equal(result.groups[0].manufacturer,'Chappée');assert.equal(docs[0].manufacturer,'Chappee');
 assert.deepEqual(result.groups[0].entries.map(d=>d.id),['b','a']);
});
test('identical PDFs shared by different references are not duplicate records',()=>{
 const docs=[doc('a'),doc('b'),doc('c',{model_reference:'vu-r3'}),doc('d',{catalog_category:'regulation'})];
 assert.deepEqual([...duplicateDocumentIds(docs)],['a','b']);assert.equal(organizeAdminDocuments(docs,{issue:'duplicate'}).visibleDocuments,2);
});
test('search includes explicit aliases and filters retain real document counts',()=>{
 const docs=[doc('a',{model_aliases:['exact-shared-reference'],title:'notice-utilisation'}),doc('b',{rag_status:'needs_ocr'}),doc('c',{catalog_category:null})];
 assert.equal(organizeAdminDocuments(docs,{search:'exact-shared-reference'}).visibleDocuments,1);
 assert.equal(organizeAdminDocuments(docs,{type:'user_manual'}).visibleDocuments,1);
 assert.equal(organizeAdminDocuments(docs,{issue:'index'}).visibleDocuments,1);
 assert.equal(organizeAdminDocuments(docs,{issue:'category'}).visibleDocuments,1);
});
