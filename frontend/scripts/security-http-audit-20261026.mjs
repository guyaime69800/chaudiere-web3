import fs from 'node:fs';
const origin=process.argv[2]||'https://www.carnetpass.fr';
const report={origin,at:new Date().toISOString(),checks:[]};
async function check(path,options={},allowed=[401,403,404,405]){
 const r=await fetch(origin+path,{...options,redirect:'manual',signal:AbortSignal.timeout(15000)}),text=await r.text();
 const safe=!/sb_secret_[A-Za-z0-9_-]{15,}|sk_live_[A-Za-z0-9]{20,}|BEGIN (?:RSA )?PRIVATE KEY|SUPABASE_SECRET_KEY\s*=/.test(text);
 report.checks.push({path,method:options.method||'GET',status:r.status,passed:allowed.includes(r.status)&&safe});
}
for(const path of ['/api/platform-admin-documents','/api/platform-catalog-documents','/api/platform-document-submissions','/api/account','/api/billing?action=invoices','/api/technical-document?pathname=audit.pdf','/api/equipment-attachments?equipmentId=11111111-1111-4111-8111-111111111111','/api/thermodynamic-documents','/administration-interne','/administration-maintenance','/api/verify-company?platform_admin_route=1','/api/verify-company?maintenance_control_route=1'])await check(path);
const sessionResponse=await fetch(origin+'/api/access-session',{signal:AbortSignal.timeout(15000)}),session=await sessionResponse.json();
report.checks.push({path:'/api/access-session',method:'GET',status:sessionResponse.status,passed:sessionResponse.status===200&&session.authenticated===false&&session.role===null});
for(const path of ['/api/ai','/api/ai-web','/api/carnetpass','/api/interventions','/api/platform-admin-documents'])await check(path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},[400,401,403,404]);
await check('/api/stripe-webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},[400,401,403]);
for(const path of ['/.env','/.env.local','/.env.production.local','/.git/config','/package-lock.json','/src/main.jsx','/server/lib/internal-access.js'])await check(path,{},[401,403,404]);
const qr=await fetch(origin+'/api/interventions?carnetPassId=CP-2026-000033',{signal:AbortSignal.timeout(15000)}),data=await qr.json();
const privateKeys=new Set(['notes','diagnostic','serial_number','serialNumber','company_id','technician_id','customer','client','measurements','blob_url']);
const leaks=[];function walk(value){if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){if(privateKeys.has(key))leaks.push(key);walk(item);}}walk(data);
report.publicHistory={status:qr.status,privateKeysFound:leaks,passed:qr.ok&&leaks.length===0};
const home=await fetch(origin,{signal:AbortSignal.timeout(15000)});await home.body.cancel();report.headers=Object.fromEntries(['content-security-policy','x-frame-options','x-content-type-options','strict-transport-security','referrer-policy','permissions-policy'].map(k=>[k,home.headers.get(k)]));
const target='C:/dev/chaudiere-web3/tmp/security-http-20261026'+(origin.includes('vercel.app')?'-staged':'')+'.json';fs.writeFileSync(target,JSON.stringify(report,null,2));
console.log(JSON.stringify({checks:report.checks.length,failures:report.checks.filter(c=>!c.passed),publicHistory:report.publicHistory,headers:report.headers,target}));
if(report.checks.some(c=>!c.passed)||!report.publicHistory.passed)process.exitCode=1;
