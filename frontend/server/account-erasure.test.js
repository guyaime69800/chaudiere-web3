import test from "node:test";import assert from "node:assert/strict";import handler from "./account.js";
test("erasure verifies responsible membership, exact confirmation and password before tenant-scoped RPC",async()=>{
 const previous={...process.env};Object.assign(process.env,{VITE_SUPABASE_URL:"https://fixture.invalid",VITE_SUPABASE_PUBLISHABLE_KEY:"public",SUPABASE_SECRET_KEY:"secret"});
 const company="10000000-0000-4000-8000-000000000001",equipment="10000000-0000-4000-8000-000000000002",user={id:"user",email:"fixture@example.invalid",email_confirmed_at:"2026-10-12"};
 let role="admin",wrongPassword=false,rpcFailure=false,calls=[];
 const dependencies={exportRateLimit:async()=>{},clientFactory(_url,key){
  if(key==="public")return{auth:{getUser:async()=>({data:{user}}),signInWithPassword:async()=>wrongPassword?{error:{}}:{data:{user}}}};
  return{from(table){return{select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},single:async()=>({data:{id:company,name:"Fixture"}}),maybeSingle:async()=>({data:null}),then(resolve){resolve(table==="company_members"?{data:[{company_id:company,role}]}:{error:{}});}};},rpc:async(name,args)=>{calls.push({name,args});return rpcFailure?{error:{}}:{data:"operation"};}};
 }};
 const base={action:"erase-company-data",confirmation:"Fixture",password:"fixture-password",archived:true,equipmentId:equipment,companyId:"foreign",actorId:"foreign"};
 const run=async(body=base)=>{const res={setHeader(){},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};await handler({method:"POST",headers:{authorization:"Bearer fixture-token"},body},res,dependencies);return res;};
 try{
  role="technician";assert.equal((await run()).code,403);role="admin";
  assert.equal((await run({...base,confirmation:"Other"})).code,400);assert.equal((await run({...base,archived:false})).code,400);
  wrongPassword=true;assert.equal((await run()).code,403);wrongPassword=false;assert.equal(calls.length,0);
  assert.equal((await run({...base,equipmentId:"../foreign"})).code,400);
  const result=await run();assert.equal(result.code,202);assert.equal(calls[0].name,"erase_company_dossiers");assert.deepEqual(calls[0].args,{p_company_id:company,p_actor_id:user.id,p_equipment_id:equipment});
  rpcFailure=true;assert.equal((await run()).code,503);
 }finally{for(const k of Object.keys(process.env))if(!(k in previous))delete process.env[k];Object.assign(process.env,previous);}
});
