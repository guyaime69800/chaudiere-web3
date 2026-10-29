import { HeadBucketCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';
import { r2Configuration,r2Client } from '../server/lib/r2-document-storage.js';
console.log(JSON.stringify({dedicatedUploadConfigured:Boolean(process.env.R2_UPLOAD_ACCESS_KEY_ID&&process.env.R2_UPLOAD_SECRET_ACCESS_KEY),fallbackMigrationConfigured:Boolean(process.env.R2_MIGRATION_ACCESS_KEY_ID&&process.env.R2_MIGRATION_SECRET_ACCESS_KEY)}));
try{const config=r2Configuration(process.env,'upload'),client=r2Client(config);
for(const [name,command] of [['headBucket',new HeadBucketCommand({Bucket:config.bucket})],['cors',new GetBucketCorsCommand({Bucket:config.bucket})]]){try{const result=await client.send(command,{abortSignal:AbortSignal.timeout(15000)});console.log(JSON.stringify({operation:name,status:result.$metadata.httpStatusCode,cors:result.CORSRules}));}catch(e){console.log(JSON.stringify({operation:name,error:e.name,status:e.$metadata?.httpStatusCode}));}}client.destroy();
}catch(e){console.log(JSON.stringify({configurationError:e.message}));process.exitCode=1;}
