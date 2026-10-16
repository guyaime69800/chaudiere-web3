import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedNoticeLabels} from './platformDocumentLibrary.js';
const pdf={title:"Notice d'installation",sha256:'a'.repeat(64),sizeBytes:123};
const a={brand:'ELM Leblanc',manufacturerReference:'NGLM24-5H',publishedDocuments:[pdf]},b={brand:'ELM Leblanc',manufacturerReference:'NGLM23-5H5',publishedDocuments:[{...pdf}]};
test('list indicates shared installation notice without merging models',()=>{assert.deepEqual(sharedNoticeLabels(a,[a,b]),["Notice d’installation commune avec : NGLM23-5H5"]);assert.equal(a.manufacturerReference,'NGLM24-5H');});
test('no common notice without exact bytes and matching manufacturer',()=>{for(const replacement of [{...pdf,sha256:'b'.repeat(64)},{...pdf,sizeBytes:124},{...pdf,sha256:undefined},{...pdf,title:'Vue éclatée'}])assert.deepEqual(sharedNoticeLabels(a,[a,{...b,publishedDocuments:[replacement]}]),[]);assert.deepEqual(sharedNoticeLabels(a,[a,{...b,brand:'Frisquet'}]),[]);});
