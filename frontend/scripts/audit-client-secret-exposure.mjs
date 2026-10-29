import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('dist');
const secrets=Object.entries(process.env).filter(([name,value])=>!name.startsWith('VITE_')&&/(?:SECRET|PRIVATE_KEY|PASSWORD|TOKEN|API_KEY|ACCESS_KEY_ID)/.test(name)&&value.length>=16);
let checked=0;const leaks=[];
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(/\.(?:js|html|json|map|css|txt|xml)$/.test(file)){checked++;const text=fs.readFileSync(file,'utf8');for(const [name,value]of secrets)if(text.includes(value))leaks.push({file:path.relative(root,file),variable:name});}}}
walk(root);
if(leaks.length){console.error(JSON.stringify({clientSecretAudit:'failed',leaks}));process.exitCode=1;}
else console.log(JSON.stringify({clientSecretAudit:'passed',filesChecked:checked,serverCredentialsCompared:secrets.length}));
