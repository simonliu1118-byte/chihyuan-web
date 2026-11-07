import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderBackupSecrets} from './render-backup-secrets.mjs';

export function renderRuntimeSecrets({env=process.env,outputPath}){
 const key=String(env.CF_BOT_PUSH_ENCRYPTION_KEY??'').trim();
 if(key&&(Buffer.from(key,'base64').length!==32||Buffer.from(key,'base64').toString('base64')!==key))throw Error('Invalid bot push encryption configuration');
 const existing=renderBackupSecrets({env,outputPath});
 if(!key)return existing;
 const secrets=existing?JSON.parse(fs.readFileSync(outputPath,'utf8')):{};
 secrets.BOT_PUSH_ENCRYPTION_KEY=key;
 if(existing)fs.writeFileSync(outputPath,JSON.stringify(secrets),{mode:0o600});
 else {const fd=fs.openSync(outputPath,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(secrets))}finally{fs.closeSync(fd)}}
 return true;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const index=process.argv.indexOf('--output');if(index<0)throw Error('Protected runtime output path required');
  const prepared=renderRuntimeSecrets({outputPath:process.argv[index+1]});
  console.log(prepared?'Protected runtime credentials prepared':'No optional runtime credentials configured');
 }catch{console.error('Runtime credential validation failed; values were not logged');process.exitCode=1}
}
