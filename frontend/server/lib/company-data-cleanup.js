import { del } from "@vercel/blob";
import { devisRedis, fail } from "./devis-security.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validCleanupPath(job) {
 if(!uuid.test(job.company_id) || !uuid.test(job.equipment_id) || typeof job.pathname!=="string" || job.pathname.includes("..")) return false;
 return job.pathname.startsWith("equipment-attachments/"+job.equipment_id+"/") || job.pathname.startsWith("regulatory/"+job.company_id+"/"+job.equipment_id+"/");
}
async function eraseRegistry(job, redis, db) {
 // Compare the stored company AND equipment before touching an entry or any shared index.
 let cursor=job.scan_cursor || "0", keys;
 const inspect=async list=>{const values=list.length?await redis.mget(...list):[];for(let index=0;index<list.length;index++){
  const key=list[index], value=values[index];
  if(value?.createdByCompanyId!==job.company_id)continue;
  const normalize=value=>String(value||"").trim().toUpperCase();
  const selected=value.equipmentRecordId===job.equipment_id || (!value.equipmentRecordId && job.registry_serial && normalize(value.serialNumber)===normalize(job.registry_serial));
  let historical=job.registry_all && (!value.createdAt || Date.parse(value.createdAt)<=Date.parse(job.created_at));
  if(job.registry_all && !historical && value.equipmentRecordId) {
   const {data: equipment,error}=await db.from("equipments").select("id").eq("company_id",job.company_id).eq("id",value.equipmentRecordId).maybeSingle();
   if(error)throw error;
   historical=!equipment; // A late registration for an already erased equipment must also disappear.
  }
  if(!selected && !historical)continue;
  const ids=[value.serialNumber?"carnetpass:serial:"+value.serialNumber:"carnetpass:equipment-id:"+job.equipment_id,
   "carnetpass:manufacturer:"+value.manufacturerReference,"carnetpass:equipment:"+value.equipmentId];
  const removed=await redis.eval(`local raw=redis.call('GET',KEYS[1]); if not raw then return 1 end; local row=cjson.decode(raw); local function text(v) if v==nil or v==cjson.null then return '' else return tostring(v) end end; if row.createdByCompanyId~=ARGV[1] or text(row.createdAt)~=ARGV[2] or row.carnetPassId~=ARGV[3] or text(row.equipmentRecordId)~=ARGV[4] or text(row.serialNumber)~=ARGV[5] then return 0 end; for i=2,#KEYS do if redis.call('GET',KEYS[i])==ARGV[3] then redis.call('DEL',KEYS[i]) end end; redis.call('DEL',KEYS[1]); return 1`,[key,...ids],[job.company_id,value.createdAt||"",value.carnetPassId,value.equipmentRecordId||"",value.serialNumber||""]);
  if(removed!==1)throw new Error("Concurrent registry modification");
 }};
 for(let page=0;page<5;page++){[cursor,keys]=await redis.scan(cursor,{match:"carnetpass:CP-*",count:100});await inspect(keys);if(String(cursor)==="0")break;}
 return String(cursor);
}
export async function cleanupCompanyData(db,{companyId=null,limit=20,blobDelete=del,redisFactory=devisRedis}={}) {
 let query=db.from("company_data_cleanup_jobs").select("*").eq("status","pending").order("attempts",{ascending:true}).order("kind",{ascending:false}).order("created_at",{ascending:true}).limit(limit);
 if(companyId)query=query.eq("company_id",companyId);
 const {data: jobs,error}=await query;
 if(error) throw fail(503,"Suivi du nettoyage indisponible.");
 let failed=0;
 for(const job of jobs||[]) {
  try {
   if(job.kind==="blob") {if(!validCleanupPath(job))throw new Error("Unsafe storage path");await blobDelete(job.pathname);}
   else if(job.kind==="registry") {
    const cursor=await eraseRegistry(job,redisFactory(),db);
    if(cursor!=="0") {
     const {error: cursorError}=await db.from("company_data_cleanup_jobs").update({scan_cursor:cursor}).eq("id",job.id).eq("company_id",job.company_id);
     if(cursorError)throw cursorError;
     continue;
    }
   }
   else throw new Error("Unknown cleanup kind");
   const {error: updateError}=await db.from("company_data_cleanup_jobs").update({status:"done",pathname:null,registry_serial:null,completed_at:new Date().toISOString()}).eq("id",job.id).eq("company_id",job.company_id);
   if(updateError)throw updateError;
  } catch {failed++;await db.from("company_data_cleanup_jobs").update({attempts:job.attempts+1}).eq("id",job.id).eq("company_id",job.company_id);}
 }
 const {error: finishError}=await db.rpc("finish_company_data_cleanup");
 if(finishError)throw fail(503,"Suivi du nettoyage indisponible.");
 return {processed:jobs?.length||0,failed};
}
