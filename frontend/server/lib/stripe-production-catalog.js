// This catalog grants no rights and does not enable checkout.
export const productionPrices = Object.freeze({
  pro: Object.freeze({ id: 'price_1USeYn6m8GCMolJNXnxiymPF', amount: 2800, interval: 'month' }),
  additionalAccount: Object.freeze({ id: 'price_1USeYn6m8GCMolJNMJZbvs0I', amount: 2000, interval: 'month' }),
  recharge100: Object.freeze({ id: 'price_1USetc6m8GCMolJNEhGUWZSY', amount: 1000, interval: null }),
  recharge200: Object.freeze({ id: 'price_1USetp6m8GCMolJNywgq8Mdf', amount: 2000, interval: null }),
});

export function validateProductionPrice(name, price) {
  const expected = productionPrices[name];
  if (!expected || price?.id !== expected.id || price.livemode !== true || price.active !== true
    || price.currency !== 'eur' || price.unit_amount !== expected.amount
    || price.billing_scheme !== 'per_unit' || price.custom_unit_amount || price.transform_quantity
    || price.tax_behavior === 'exclusive') throw new Error(`Tarif production invalide : ${name}`);
  if (expected.interval) {
    if (price.type !== 'recurring' || price.recurring?.interval !== expected.interval
      || price.recurring.interval_count !== 1 || price.recurring.usage_type !== 'licensed') {
      throw new Error(`Périodicité invalide : ${name}`);
    }
  } else if (price.type !== 'one_time' || price.recurring) throw new Error(`Tarif ponctuel invalide : ${name}`);
  if (name === 'additionalAccount' && price.metadata?.carnetpass_additional_accounts !== 'v1') {
    throw new Error('Métadonnée des comptes supplémentaires absente');
  }
  if (!price.product || typeof price.product !== 'object' || price.product.deleted
    || price.product.active !== true || price.product.livemode !== true) throw new Error(`Produit invalide : ${name}`);
  return true;
}

export async function auditProductionCatalog({ key, expectedAccount, fetcher = fetch }) {
  if (!/^(?:sk|rk)_live_[A-Za-z0-9]+$/.test(key || '')) throw new Error('Clé Stripe live manquante (variable serveur uniquement).');
  if (!/^acct_[A-Za-z0-9]+$/.test(expectedAccount || '')) throw new Error('STRIPE_EXPECTED_ACCOUNT_ID manquant.');
  async function get(path) {
    let response;
    try {
      response = await fetcher(`https://api.stripe.com/v1/${path}`, {
        method: 'GET', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${key}` },
      });
    } catch { throw new Error('Connexion Stripe indisponible.'); }
    if (!response.ok) throw new Error(`Lecture Stripe refusée (HTTP ${response.status}).`);
    try { return await response.json(); } catch { throw new Error('Réponse Stripe illisible.'); }
  }
  const account = await get('account');
  if (account.id !== expectedAccount) throw new Error('Le compte Stripe ne correspond pas au compte attendu.');
  if (account.charges_enabled !== true || account.payouts_enabled !== true || account.details_submitted !== true) {
    throw new Error('Activation ou vérification du compte Stripe incomplète.');
  }
  const prices = {};
  for (const [name, expected] of Object.entries(productionPrices)) {
    const price = await get(`prices/${expected.id}?expand%5B%5D=product`);
    validateProductionPrice(name, price);
    prices[name] = price;
  }
  if (prices.pro.product.id !== prices.additionalAccount.product.id) throw new Error('Le compte supplémentaire doit appartenir au produit Pro.');
  return { ok: true, checkedPrices: Object.keys(prices), paymentsEnabled: false,
    invoiceTaxVerificationRequired: true, subscriptionAndCreditReconciliationRequired: true };
}
