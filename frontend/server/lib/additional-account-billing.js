import { additionalAccountsTotal } from "../../shared/additional-accounts.js";
export function additionalAccountItem(subscription) {
 const items=subscription.items?.data || [];
 const extra=items.filter(item=>item.price?.metadata?.carnetpass_additional_accounts === "v1");
 if(extra.length>1)throw new Error("Ambiguous additional account price");
 const item=extra[0];
 if(item && (item.price.livemode || item.price.currency!=="eur" || item.price.unit_amount!==2000 || item.price.recurring?.interval!=="month" || item.price.tax_behavior==="exclusive" || !Number.isSafeInteger(item.quantity) || item.quantity<1))throw new Error("Invalid additional account item");
 return item || null;
}
export function additionalAccountUpdate(subscription,priceId,quantity) {
 additionalAccountsTotal(quantity);
 const existing=additionalAccountItem(subscription);
 const base=subscription.items?.data?.filter(item=>item!==existing);
 if(base?.length!==1 || base[0].quantity!==1)throw new Error("Unsupported base subscription");
 const params={payment_behavior:"pending_if_incomplete",proration_behavior:"always_invoice","expand[0]":"latest_invoice"};
 if(existing){params["items[0][id]"]=existing.id;if(quantity===0)params["items[0][deleted]"]="true";else params["items[0][quantity]"]=String(quantity);}
 else {if(quantity===0)throw new Error("No additional accounts to remove");params["items[0][price]"]=priceId;params["items[0][quantity]"]=String(quantity);}
 return params;
}
