import test from "node:test";
import assert from "node:assert/strict";
import {additionalAccountItem,additionalAccountUpdate} from "./additional-account-billing.js";
import {additionalAccountsTotal} from "../../shared/additional-accounts.js";
import {shibaQuotaLimit,readShibaUsage} from "./shiba-quota.js";
import {consultationLimit} from "./document-consultation-quota.js";
const base={id:"si_main",quantity:1,price:{id:"price_main"}};
const addon={id:"si_extra",quantity:3,price:{id:"price_extra",metadata:{carnetpass_additional_accounts:"v1"},livemode:false,currency:"eur",unit_amount:2000,recurring:{interval:"month"}}};
test("extra accounts retain their independent 150/15 quotas and existing monthly user key",async()=>{
 assert.equal(shibaQuotaLimit("pro"),200);assert.equal(shibaQuotaLimit("pro",true),150);assert.equal(consultationLimit("pro"),20);assert.equal(consultationLimit("pro",true),15);
 const keys=[];const usage=await readShibaUsage({companyId:"company",userId:"extra",additionalAccount:true},"pro",{now:new Date("2026-10-12"),redis:{get:async key=>{keys.push(key);return 0;}}});assert.equal(usage.limit,150);assert.equal(usage.remaining,150);assert.ok(keys.includes("carnetpass:shiba:monthly:v1:company:extra:2026-10"));
});
test("pricing accepts arbitrary purchased quantities without a commercial cap but rejects unsafe input",()=>{assert.equal(additionalAccountsTotal(3),88);assert.equal(additionalAccountsTotal(10000),200028);for(const x of [-1,1.5,"2",NaN,Infinity,2147483648])assert.throws(()=>additionalAccountsTotal(x));});
test("Stripe modifies only the extra item and holds access until successful payment",()=>{
 const p=additionalAccountUpdate({items:{data:[base,addon]}},"price_extra",5);assert.equal(p["items[0][id]"],"si_extra");assert.equal(p["items[0][quantity]"],"5");assert.equal(p.payment_behavior,"pending_if_incomplete");assert.equal(p.proration_behavior,"always_invoice");assert.equal(additionalAccountItem({items:{data:[addon,base]}}),addon);
 assert.throws(()=>additionalAccountItem({items:{data:[addon,addon]}}));assert.throws(()=>additionalAccountItem({items:{data:[{...addon,price:{...addon.price,unit_amount:2800}}]}}));assert.throws(()=>additionalAccountUpdate({items:{data:[{...base,quantity:2}]}},"x",1));
});
