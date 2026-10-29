// Permission probe only: the fake customer cannot create an invoice preview or a charge.
const key = process.env.STRIPE_SECRET_KEY;
if (!/^(sk|rk)_live_[A-Za-z0-9]+$/.test(key || '')) throw Error('Live credential required for permission probe');
const headers = { Authorization: `Bearer ${key}`, 'Stripe-Version': '2026-08-26.dahlia' };
const accountResponse = await fetch('https://api.stripe.com/v1/account', { headers, signal: AbortSignal.timeout(10000) });
if (!accountResponse.ok || (await accountResponse.json()).id !== process.env.STRIPE_EXPECTED_ACCOUNT_ID) throw Error('Account scope mismatch');
const response = await fetch('https://api.stripe.com/v1/invoices/create_preview', {
  method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ customer: 'cus_CarnetPassNonexistentPermissionProbe' }), signal: AbortSignal.timeout(10000),
});
const result = await response.json().catch(() => null);
console.log(JSON.stringify({ seatInvoicePreviewPermissionProbe: { httpStatus: response.status,
  permissionDenied: response.status === 403,
  reachedCustomerLookup: result?.error?.code === 'resource_missing' && result?.error?.param === 'customer',
  realCustomerUsed: false, financialWrite: false } }));
if (response.ok) throw Error('Unexpected fake customer response; permission probe stopped');
