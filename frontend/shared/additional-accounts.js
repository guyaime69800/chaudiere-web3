export const ADDITIONAL_ACCOUNT_MONTHLY_EUROS = 20;
export function additionalAccountsTotal(quantity) {
 if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2147483647) throw new Error("Invalid account quantity");
 return 28 + quantity * ADDITIONAL_ACCOUNT_MONTHLY_EUROS;
}
export function accountQuotas(additional = false) {
 return additional ? { shiba: 150, documents: 15 } : { shiba: 200, documents: 20 };
}
