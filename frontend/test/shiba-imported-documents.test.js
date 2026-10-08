import test from "node:test";
import assert from "node:assert/strict";

test("Shiba accepts published indexed documents in Production and preserves account/model checks", async () => {
  const previous={...process.env}, previousFetch=globalThis.fetch;
  Object.assign(process.env,{OPENAI_API_KEY:"test",UPSTASH_REDIS_REST_KV_REST_API_URL:"https://redis.invalid",UPSTASH_REDIS_REST_KV_REST_API_TOKEN:"test",VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:"main",CARNETPASS_PRODUCTION_ADMIN_ENABLED:"true",CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF:"abcdefghijklmnopqrst",VITE_SUPABASE_URL:"https://abcdefghijklmnopqrst.supabase.co",VITE_SUPABASE_PUBLISHABLE_KEY:"public",SUPABASE_SECRET_KEY:"secret"});
  const {default:handler}=await import("../api/ai.js");
  const userId="00000000-0000-4000-8000-000000000001",id="00000000-0000-4000-8000-000000000002";
  const token=aal=>`header.${Buffer.from(JSON.stringify({sub:userId,aal})).toString("base64url")}.signature`;
  let indexed=[{id,manufacturer:"Atlantic",model_reference:"ALFEA DUO - MH-D8 · 023103",title:"Notice technique",hotline_phone:"03 51 42 70 42",rag_data:{items:[{text:"Sonde de température",page:12}]}}];
  let reads=0;
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url.includes('/auth/v1/user'))return Response.json({id:userId,email_confirmed_at:'2026-01-01',factors:[{status:'verified'}]});
    if(url.includes('/company_members'))return Response.json([{company_id:id,role:'owner'}]);
    if(url.includes('/companies'))return Response.json({id,is_demo:true,created_at:'2026-10-01',company_verifications:{status:'pending'}});
    if(url.includes('/platform_admins'))return Response.json({role:'founder'});
    if(url.includes('/subscriptions'))return Response.json({plan:'enterprise',status:'active',current_period_end:'2099-01-01'});
    if(url.includes('/platform_document_intake')){reads++;return Response.json(indexed);}
    throw Error('Unexpected external request');
  };
  const invoke=async({aal='aal2',equipmentId='',authenticated=true}={})=>{
    const res={setHeader(){},status(value){this.statusCode=value;return this;},json(body){this.body=body;return this;}};
    await handler({method:'POST',headers:authenticated?{authorization:`Bearer ${token(aal)}`}:{},body:{equipmentId,platformDocumentIds:[id],question:'Quelle est la hotline constructeur ?'}},res);return res;
  };
  try{
    const allowed=await invoke();assert.equal(allowed.statusCode,200);assert.match(allowed.body.answer,/03 51 42 70 42/);assert.equal(reads,1);
    const low=await invoke({aal:'aal1'});assert.equal(low.statusCode,403);assert.equal(reads,1);
    const anonymous=await invoke({authenticated:false});assert.equal(anonymous.statusCode,401);assert.equal(reads,1);
    const mismatched=await invoke({equipmentId:'0010017388'});assert.equal(mismatched.statusCode,400);
    indexed=[];const unavailable=await invoke();assert.equal(unavailable.statusCode,409);
    process.env.CARNETPASS_PRODUCTION_ADMIN_ENABLED='false';const disabled=await invoke();assert.equal(disabled.statusCode,404);
  }finally{globalThis.fetch=previousFetch;for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
});
