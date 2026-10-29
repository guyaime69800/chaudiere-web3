import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/dev/carnetpass-documents/node_modules/playwright');
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const colleagues = [{ user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'premier@example.invalid' },
  { user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'second@example.invalid' }];
const user = { id: actor, email: 'responsable@example.invalid', email_confirmed_at: '2026-10-21', aud: 'authenticated', role: 'authenticated', factors: [] };
const jwt = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: actor, aal: 'aal2', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), Buffer.alloc(32).toString('base64url')].join('.');
const future = new Date(Date.now() + 86400 * 30000).toISOString();
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const filename = pathname.startsWith('/assets/') ? path.join(process.cwd(), 'dist', pathname) : path.join(process.cwd(), 'dist/index.html');
  if (!filename.startsWith(path.join(process.cwd(), 'dist') + path.sep) || !fs.existsSync(filename)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webp': 'image/webp' })[path.extname(filename)] || 'application/octet-stream');
  res.end(fs.readFileSync(filename));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: 'C:/dev/carnetpass-documents/.browsers/chromium-1248/chrome-win64/chrome.exe' });
try {
  for (const scenario of ['closed', 'purchase', 'unapproved', 'technician', 'recharge', 'seats', 'seats-add', 'refund', 'invitation']) {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: scenario === 'seats' ? 390 : 1280, height: 900 } });
    const requests = []; let rechargeAttempts = 0, pendingChange = null;
    const enabled = scenario !== 'closed';
    const plan = ['recharge', 'seats', 'seats-add'].includes(scenario) ? 'pro' : 'free';
    const role = scenario === 'technician' ? 'technician' : 'admin';
    if (scenario !== 'invitation') await context.addInitScript(({ user, jwt }) => localStorage.setItem('sb-tsyukqcyfxcrjrhopvpv-auth-token', JSON.stringify({
      access_token: jwt, refresh_token: 'local-placeholder', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user })), { user, jwt });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      const json = (data, status = 200) => route.fulfill({ status, json: data, headers: { 'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization,apikey,x-client-info,x-supabase-api-version,content-type,accept', 'access-control-allow-methods': 'GET,POST,OPTIONS' } });
      if (route.request().method() === 'OPTIONS') return json({});
      if (url.pathname === '/auth/v1/token') return json({ access_token: jwt, refresh_token: 'fixture', token_type: 'bearer', expires_in: 3600, user });
      if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
      if (['checkout.stripe.com', 'invoice.stripe.com'].includes(url.hostname)) return route.fulfill({ contentType: 'text/html', body: '<h1>Provider fixture - no network</h1>' });
      if (url.pathname.startsWith('/auth/v1/user')) return json(user);
      if (url.pathname.startsWith('/rest/v1/')) {
        const table = url.pathname.split('/').at(-1);
        let rows = [];
        if (table === 'company_members') rows = scenario === 'invitation' ? [] : [{ company_id: 'company', user_id: actor, role }];
        if (table === 'companies') rows = [{ id: 'company', name: 'Entreprise fictive', siret: '12345678901234', is_demo: false }];
        if (table === 'subscriptions') rows = [{ plan, status: 'active', stripe_live_managed: plan === 'pro', current_period_end: future }];
        if (table === 'company_verifications') rows = [{ status: scenario === 'unapproved' ? 'pending' : 'approved', verified_siret: '12345678901234', verified_at: '2026-10-21' }];
        if (table === 'profiles') rows = [{ full_name: 'Compte fictif' }];
        if (table === 'pro_additional_accounts') rows = [{ quantity: 2, paid_until: future, billing_environment: 'production' }];
        if (table === 'list_pro_accounts') return json(colleagues);
        return json(route.request().headers().accept?.includes('vnd.pgrst.object') ? rows[0] || null : rows);
      }
      if (url.pathname === '/api/access-session') return json({ maintenance: false });
      if (url.pathname === '/api/platform-admin' || url.pathname === '/api/maintenance-control') return json({}, 404);
      if (url.pathname === '/api/billing' && url.searchParams.get('action') === 'purchase-status') return json({ available: enabled, seatsAvailable: scenario.startsWith('seats') });
      if (url.pathname === '/api/billing' && url.searchParams.get('action') === 'portal-status') return json({ available: false });
      if (url.pathname === '/api/billing' && url.searchParams.get('action') === 'invoices') return json({ invoices: scenario === 'refund' ? [{
        id: 'in_fixture', number: 'FACTURE-TEST', created: 1792740000, status: 'paid', total: 2800, currency: 'eur',
        refundStatus: 'full', refundedAmount: 2800,
      }] : [], hasMore: false });
      if (url.pathname === '/api/billing' && url.searchParams.get('action') === 'additional-status') return json({ change: pendingChange });
      if (url.pathname === '/api/billing' && url.searchParams.get('action') === 'additional-quote') {
        const body = route.request().postDataJSON(); requests.push({ action: 'quote', ...body });
        return json({ quote: { id: body.requestId, quantity: body.quantity, previousQuantity: 2, immediateAmountCents: scenario === 'seats-add' ? 1000 : 0, totalMonthlyEuros: 28 + 20 * body.quantity, nextRenewal: future } });
      }
      if (url.pathname === '/api/billing' && url.searchParams.get('action') === 'additional-update') {
        const body = route.request().postDataJSON(); requests.push({ action: 'update', ...body });
        if (scenario === 'seats-add') return json({ url: 'https://invoice.stripe.com/seat-fixture', message: 'Paiement des places en attente.' });
        pendingChange = { id: body.requestId, status: 'scheduled', quantity: 1, retainedMembers: [colleagues[1].user_id], nextRenewal: future };
        return json({ change: pendingChange, message: 'Réduction programmée à la prochaine échéance.' });
      }
      if (url.pathname === '/api/billing' && route.request().method() === 'POST') { requests.push(route.request().postDataJSON()); return json({ url: 'https://checkout.stripe.com/local' }); }
      if (url.pathname === '/api/shiba-recharge') {
        requests.push(route.request().postDataJSON()); rechargeAttempts++;
        return rechargeAttempts === 1 ? json({ message: 'Interruption simulée, réessayez.' }, 503) : json({ url: 'https://checkout.stripe.com/recharge' });
      }
      if (url.origin === origin) return json({}, 503);
      throw Error('External network forbidden: ' + url.origin + url.pathname);
    });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const invitationPath = '/parametres-compte?invitation=' + 'a'.repeat(64) + '#comptes';
    await page.goto(origin + (scenario === 'invitation' ? invitationPath : ['seats', 'seats-add', 'refund'].includes(scenario) ? '/parametres-compte#comptes' : '/tarifs?from=account'));
    if (scenario === 'invitation') {
      await page.locator('input[type="email"]').fill(user.email).catch(async error => { console.error(page.url(), await page.locator('body').innerText()); throw error; });
      await page.getByLabel('Mot de passe', { exact: true }).fill('fixture-password');
      await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
      await page.waitForURL(origin + invitationPath);
      await page.getByRole('button', { name: 'Accepter mon invitation à rejoindre l’entreprise' }).waitFor();
    } else if (scenario === 'refund') {
      await page.getByText(/Remboursée intégralement : 28,00/).waitFor();
    } else if (scenario === 'closed') {
      await page.getByText('Les achats réels d’abonnements et de recharges ne sont pas encore ouverts.', { exact: false }).waitFor();
      assert.equal(await page.getByRole('button', { name: /S’abonner à CarnetPass Pro/ }).count(), 0);
    } else if (['purchase', 'unapproved', 'technician'].includes(scenario)) {
      const pay = page.getByRole('button', { name: /S’abonner à CarnetPass Pro/ }); await pay.waitFor();
      assert.equal(await pay.isDisabled(), true);
      await page.getByRole('checkbox', { name: /J’accepte/ }).check();
      if (scenario === 'purchase') {
        await pay.click(); await page.waitForURL('https://checkout.stripe.com/local');
        assert.equal(requests[0].plan, 'pro'); assert.equal(requests[0].terms.accepted, true);
        assert.match(requests[0].requestId, /^[0-9a-f-]{36}$/);
      } else assert.equal(await pay.isDisabled(), true);
    } else if (scenario === 'recharge') {
      await page.getByRole('button', { name: 'Recharger CarnetPass', exact: true }).click();
      const dialog = page.getByRole('dialog'); await dialog.waitFor();
      await dialog.getByRole('button', { name: '20 € 200 crédits Shiba' }).click();
      const pay = dialog.getByRole('button', { name: 'Recharger pour 20 €' }); assert.equal(await pay.isDisabled(), true);
      await dialog.getByRole('checkbox').check(); await pay.click();
      await dialog.getByRole('alert').filter({ hasText: 'Interruption simulée' }).waitFor();
      await pay.click(); await page.waitForURL('https://checkout.stripe.com/recharge');
      assert.equal(requests[0].euros, 20); assert.equal(requests[1].requestId, requests[0].requestId);
    } else {
      await page.getByRole('heading', { name: 'Paramètres du compte', exact: true }).waitFor().catch(async error => { console.error('Account page:', await page.locator('body').innerText(), errors); throw error; });
      await page.getByRole('button', { name: 'Ajouter un compte', exact: true }).click().catch(async error => { console.error('Seat page:', page.url(), await page.locator('body').innerText(), errors); throw error; });
      const panel = page.locator('.live-additional-accounts'); await panel.waitFor();
      if (scenario === 'seats-add') {
        await panel.getByRole('spinbutton').fill('3');
        await panel.getByRole('button', { name: 'Calculer le récapitulatif sans payer' }).click();
        const confirm = panel.getByRole('button', { name: /Confirmer l’ajout/ });
        assert.equal(await confirm.isDisabled(), true);
        await panel.getByRole('checkbox', { name: /J’accepte/ }).check(); await confirm.click();
        await page.waitForURL('https://invoice.stripe.com/seat-fixture');
        assert.equal(requests.find(item => item.action === 'quote').quantity, 3);
        assert.equal(requests.find(item => item.action === 'update').terms.accepted, true);
        assert.deepEqual(errors, []); console.log('Browser verified: ' + scenario); await context.close(); continue;
      }
      await panel.getByRole('spinbutton').fill('1');
      await panel.getByRole('checkbox', { name: colleagues[0].email }).uncheck();
      await panel.getByRole('button', { name: 'Calculer le récapitulatif sans payer' }).click();
      await panel.getByText('À régler maintenant :', { exact: false }).waitFor();
      const confirm = panel.getByRole('button', { name: 'Programmer la réduction à l’échéance' }); assert.equal(await confirm.isDisabled(), true);
      await panel.getByRole('checkbox', { name: /J’accepte/ }).check(); await confirm.click();
      await panel.getByText('Réduction programmée :', { exact: false }).waitFor();
      assert.deepEqual(requests.find(item => item.action === 'quote').retainedMembers, [colleagues[1].user_id]);
      assert.equal(requests.find(item => item.action === 'update').terms.accepted, true);
      fs.mkdirSync('C:/dev/chaudiere-web3/tmp/purchases-browser', { recursive: true });
      await page.screenshot({ path: 'C:/dev/chaudiere-web3/tmp/purchases-browser/mobile-seats.png', fullPage: true });
    }
    assert.deepEqual(errors, []); console.log('Browser verified: ' + scenario); await context.close();
  }
  console.log('No Stripe or Supabase network contacted. Browser requests used local fixtures only.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
