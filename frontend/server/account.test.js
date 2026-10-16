import test from "node:test";
import assert from "node:assert/strict";
import handler from "./account.js";
test("company export requires verified account, MFA and responsible membership", async () => {
  const previous = { ...process.env };
  Object.assign(process.env, { VITE_SUPABASE_URL: "https://example.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: "public", SUPABASE_SECRET_KEY: "secret" });
  let role = "admin", verified = true, exportCalls = 0; const limits=[];
  const user = { id: "user", email: "user@example.invalid", email_confirmed_at: "2026-01-01",
    factors: [{ status: "verified" }] };
  const dependencies = {
    exportRateLimit: async (_req,scope,_id,max) => {limits.push({scope,max});},
    clientFactory(_url, key, options) {
      const query = (table) => ({
        select() { return this; }, eq(field, value) {
          assert.equal(value, table === "profiles" || (table === "company_members" && field === "user_id") ? "user" : "owned");
          return this;
        }, order() { return this; }, range: async () => { exportCalls++; return { data: [] }; },
        single: async () => ({ data: { id: "owned" } }),
        maybeSingle: async () => ({ data: table === "profiles" ? { id: "user" } : null }),
        then(resolve) { return Promise.resolve({ data: [{ company_id: "owned", role }] }).then(resolve); },
      });
      if (options.global) {
        assert.match(options.global.headers.Authorization, /^Bearer /);
        return { from: query };
      }
      if (key === "public") return { auth: { getUser: async () => ({ data: { user }, error: verified ? null : {} }) } };
      return { from: query };
    },
  };
  const run = async (aal = "aal2", query = { action: "export", companyId: "foreign" }) => {
    const token = `header.${Buffer.from(JSON.stringify({ sub: "user", aal })).toString("base64url")}.signature`;
    const response = { headers: {}, setHeader(k,v) { this.headers[k] = v; },
      status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: "GET", headers: aal ? { authorization: `Bearer ${token}` } : {}, query }, response, dependencies);
    return response;
  };
  try {
    assert.equal((await run(null)).code, 401);
    assert.equal((await run("aal1")).code, 403);
    verified = false; assert.equal((await run()).code, 401); verified = true;
    role = "technician"; assert.equal((await run()).code, 403); assert.equal(exportCalls, 0);
    role = "admin";
    const result = await run();
    assert.equal(result.code, 200); assert.equal(result.body.company.id, "owned");
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.match(result.headers["Content-Disposition"], /attachment/);
    assert.equal((await run("aal2", {})).code, 400);
    assert.equal((await run("aal2", {action:"export-page",table:"equipments"})).code,200);
    assert.deepEqual(limits.at(-1),{scope:"account-export-read",max:1200});
    assert.ok(limits.some(limit=>limit.scope==="account-export-start" && limit.max===2));
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
