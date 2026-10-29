import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2]||'C:/dev/chaudiere-web3/tmp/security-clean-runtime-20261026/dist';
const names=Object.keys(process.env).filter(k=>!k.startsWith('VITE_')&&/(?:SECRET|PRIVATE_KEY|PASSWORD|TOKEN|OPENAI_API_KEY|R2_ACCESS_KEY_ID)/.test(k)&&process.env[k]?.length>=16);
const leaks=[],files=[];
function scan(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())scan(p);else if(/\.(?:js|html|json|map|css|txt|xml)$/.test(p)){files.push(p);const text=fs.readFileSync(p,'utf8');for(const name of names)if(text.includes(process.env[name]))leaks.push({file:path.relative(root,p),variable:name});if(/sk_live_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]{40,}/.test(text))leaks.push({file:path.relative(root,p),kind:'credential-pattern'});}}}scan(root);
const result={filesScanned:files.length,serverSecretsCompared:names.length,leaks,sourceMaps:files.filter(f=>f.endsWith('.map')).length};
fs.writeFileSync('C:/dev/chaudiere-web3/tmp/security-artifacts-20261026.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(leaks.length)process.exitCode=1;
