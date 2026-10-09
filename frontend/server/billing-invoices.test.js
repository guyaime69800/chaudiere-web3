import test from "node:test";
import assert from "node:assert/strict";
import handler from "./billing-invoices.js";

test("invoice access enforces account, company, MFA, environment and customer isolation", async () => {
  const previous = { ...process.env };
  Object.assign(process.env, { VERCEL_ENV: "production", VITE_SUPABASE_URL: "https://example.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: "public", SUPABASE_SECRET_KEY: "secret", STRIPE_SECRET_KEY: "sk_live_fake" });
  const user = { id: "user", email_confirmed_at: "2026-01-01", factors: [{ status: "verified" }] };
  let role = "owner", customer = "cus_owned", authError = null, stripeCalls = 0;
  let stripeData = [{ id: "in_owned", customer: "cus_owned", livemode: true, status: "paid", total: 2800,
    currency: "eur", created: 1700000000, number: "CP-1", invoice_pdf: "https://pay.stripe.com/invoice/owned/pdf",
    hosted_invoice_url: "https://invoice.stripe.com/i/owned" }];
  const dependencies = {
    clientFactory(_url, key) {
      if (key === "public") return { auth: { getUser: async () => ({ data: { user }, error: authError }) } };
      return { from(table) {
        const result = table === "company_members" ? [{ company_id: "owned-company", role }]
          : table === "platform_admins" ? null : { stripe_customer_id: customer };
        const query = { select() { return this; }, eq(field, value) {
          if (field === "company_id") assert.equal(value, "owned-company"); return this;
        }, limit: async () => ({ data: result }), maybeSingle: async () => ({ data: result }) };
        return query;
      } };
    },
    async request(url) {
      stripeCalls++;
      assert.equal(new URL(url).searchParams.get("customer"), "cus_owned");
      return Response.json({ data: stripeData, has_more: true });
    },
  };
  const run = async ({ token = "aal2", query = {} } = {}) => {
    const bearer = `header.${Buffer.from(JSON.stringify({ sub: "user", aal: token })).toString("base64url")}.signature`;
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: "GET", headers: token ? { authorization: `Bearer ${bearer}` } : {}, query }, res, dependencies);
    return res;
  };
  try {
    assert.equal((await run({ token: null })).code, 401);
    assert.equal((await run({ token: "aal1" })).code, 403);
    role = "technician"; assert.equal((await run()).code, 403); assert.equal(stripeCalls, 0);
    role = "owner"; authError = { message: "Invalid user" }; assert.equal((await run()).code, 401); authError = null;
    const valid = await run({ query: { customer: "cus_attacker", companyId: "foreign-company" } });
    assert.equal(valid.code, 200); assert.equal(valid.body.invoices[0].number, "CP-1");
    assert.equal(valid.body.nextCursor, "in_owned"); assert.equal(valid.body.testMode, false);
    assert.equal((await run({ query: { after: "invalid" } })).code, 400);
    customer = null; assert.deepEqual((await run()).body.invoices, []); customer = "cus_owned";
    process.env.STRIPE_SECRET_KEY = "sk_test_fake"; assert.equal((await run()).code, 503);
    process.env.STRIPE_SECRET_KEY = "sk_live_fake";
    stripeData = [{ ...stripeData[0], customer: "cus_foreign" }]; assert.equal((await run()).code, 503);
    stripeData = [{ ...stripeData[0], customer: "cus_owned", livemode: false }]; assert.equal((await run()).code, 503);
    process.env.VERCEL_ENV = "preview"; process.env.STRIPE_TEST_SECRET_KEY = "sk_test_fake";
    stripeData = [{ ...stripeData[0], invoice_pdf: "https://attacker.example/pdf" }];
    const preview = await run(); assert.equal(preview.code, 200); assert.equal(preview.body.testMode, true);
    assert.equal(preview.body.invoices[0].pdfUrl, null);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
