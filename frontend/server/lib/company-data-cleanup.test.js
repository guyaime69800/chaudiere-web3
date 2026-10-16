import test from "node:test";import assert from "node:assert/strict";import {cleanupCompanyData,validCleanupPath} from "./company-data-cleanup.js";
const company="10000000-0000-4000-8000-000000000001",equipment="10000000-0000-4000-8000-000000000002";
test("storage cleanup only accepts the exact company/equipment prefixes",()=>{
 assert.ok(validCleanupPath({company_id:company,equipment_id:equipment,pathname:"equipment-attachments/"+equipment+"/file.pdf"}));
 assert.ok(!validCleanupPath({company_id:company,equipment_id:equipment,pathname:"regulatory/other/"+equipment+"/file.pdf"}));
 assert.ok(!validCleanupPath({company_id:company,equipment_id:equipment,pathname:"equipment-attachments/"+equipment+"/../file.pdf"}));
});
test("failed file cleanup stays pending, while successful cleanup removes its storage path",async()=>{
 const changes=[],jobs=[{id:"a",company_id:company,equipment_id:equipment,kind:"blob",pathname:"equipment-attachments/"+equipment+"/file.pdf",attempts:0}];let unavailable=true;
 const db={from(){const q={select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},update(value){changes.push(value);return this;},then(resolve){resolve({data:jobs});}};return q;},rpc:async()=>({})};
 const blobDelete=async()=>{if(unavailable)throw new Error("Unavailable");};
 assert.equal((await cleanupCompanyData(db,{companyId:company,blobDelete})).failed,1);assert.deepEqual(changes,[{attempts:1}]);
 changes.length=0;unavailable=false;assert.equal((await cleanupCompanyData(db,{companyId:company,blobDelete})).failed,0);assert.equal(changes[0].status,"done");assert.equal(changes[0].pathname,null);
});
test("registry cleanup ignores another company and persists a bounded scan cursor",async()=>{
 const changes=[],evaluations=[];let page=0;const jobs=[{id:"job",company_id:company,equipment_id:equipment,kind:"registry",attempts:0}];
 const db={from(){return{select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},update(v){changes.push(v);return this;},then(resolve){resolve({data:jobs});}};},rpc:async()=>({})};
 const redisFactory=()=>({scan:async()=>[String(++page),["carnetpass:CP-2026-000001"]],mget:async()=>[{createdByCompanyId:"foreign",equipmentRecordId:equipment}],eval:async(...args)=>evaluations.push(args)});
 await cleanupCompanyData(db,{companyId:company,redisFactory});assert.equal(page,5);assert.equal(evaluations.length,0);assert.deepEqual(changes,[{scan_cursor:"5"}]);
});

test("whole-company cleanup removes historical unlinked QR records but preserves a new dossier",async()=>{
 const changes=[],evaluations=[],jobs=[{id:"job",company_id:company,equipment_id:equipment,kind:"registry",registry_all:true,created_at:"2026-10-12T12:00:00Z",attempts:0}];
 const db={from(table){return{select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},update(v){changes.push(v);return this;},maybeSingle:async()=>({data:table==="equipments"?{id:equipment}:null}),then(resolve){resolve({data:jobs});}};},rpc:async()=>({})};
 const redisFactory=()=>({scan:async()=>["0",["carnetpass:CP-old","carnetpass:CP-new"]],mget:async()=>[
 {createdByCompanyId:company,equipmentRecordId:null,carnetPassId:"CP-old",serialNumber:"OLD",createdAt:"2026-10-11T12:00:00Z"},
 {createdByCompanyId:company,equipmentRecordId:equipment,carnetPassId:"CP-new",serialNumber:"NEW",createdAt:"2026-10-12T13:00:00Z"}],eval:async(...args)=>{evaluations.push(args);return 1;}});
 // The operation equipment marker differs from any actual new dossier ID.
 jobs[0].equipment_id="10000000-0000-4000-8000-000000000099";
 await cleanupCompanyData(db,{companyId:company,redisFactory});assert.equal(evaluations.length,1);assert.equal(evaluations[0][1][0],"carnetpass:CP-old");assert.equal(changes[0].status,"done");
});
