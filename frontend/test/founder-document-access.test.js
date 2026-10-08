import test from 'node:test';
import assert from 'node:assert/strict';
import { requireVerifiedCompany } from '../server/lib/require-verified-company.js';

test('only the authenticated founder demo receives full document access', async () => {
  const previousFetch=globalThis.fetch;
  const previousEnv={...process.env};
  Object.assign(process.env,{VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',
    VITE_SUPABASE_URL:'https://tsyukqcyfxcrjrhopvpv.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY:'test-public-key',SUPABASE_SECRET_KEY:'test-server-key',
    CARNETPASS_PRODUCTION_ADMIN_ENABLED:'true',CARNETPASS_PRODUCTION_ADMIN_SUPABASE_REF:'tsyukqcyfxcrjrhopvpv'});
  let operator='founder', verificationStatus='pending';
  globalThis.fetch=async (input) => {
    const url=String(input);
    const data=url.includes('/auth/v1/user') ? {id:'founder-user',email_confirmed_at:'2026-01-01'}
      :url.includes('/company_members') ? [{company_id:'test-company',role:'owner'}]
        :url.includes('/companies?') ? {id:'test-company',is_demo:true,created_at:'2020-01-01',company_verifications:{status:verificationStatus}}
          :url.includes('/platform_admins') ? {role:operator}
            :url.includes('/subscriptions') ? {plan:'free',status:'active'} : null;
    assert.ok(data,'Unexpected request '+url);
    return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
  };
  const response={status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  const token = 'header.' + Buffer.from(JSON.stringify({sub:'founder-user',aal:'aal2'})).toString('base64url') + '.signature';
  try {
    assert.equal((await requireVerifiedCompany({headers:{authorization:'Bearer '+token}},response)).accessKind,'founder_test');
    operator='operator';
    assert.equal((await requireVerifiedCompany({headers:{authorization:'Bearer test-token'}},response)).accessKind,'demo');
    operator='founder'; verificationStatus='suspended';
    assert.equal(await requireVerifiedCompany({headers:{authorization:'Bearer test-token'}},response),null);
    assert.equal(response.code,403);
    assert.equal(await requireVerifiedCompany({headers:{}},response),null);
    assert.equal(response.code,401);
  } finally {
    globalThis.fetch=previousFetch;
    for(const key of Object.keys(process.env)) if(!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env,previousEnv);
  }
});
