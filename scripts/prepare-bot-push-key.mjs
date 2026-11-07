import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

/** Operator-only setup. Existing write-only secrets must never be replaced automatically. */
export function preparePushKey({repo,environment,create=false,runCli=(args,input)=>execFileSync('gh',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true}),makeKey=()=>randomBytes(32).toString('base64')}){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo??'')||!/^[A-Za-z0-9_-]+$/.test(environment??''))throw Error('Explicit repository and environment required');
 try{
  const names=JSON.parse(runCli(['secret','list','--repo',repo,'--env',environment,'--json','name']));
  if(!Array.isArray(names)||names.some(item=>typeof item.name!=='string'))throw Error();
  if(names.some(item=>item.name==='CF_BOT_PUSH_ENCRYPTION_KEY'))return {configured:true,created:false};
  if(!create)return {configured:false,created:false};
  const key=makeKey();
  if(Buffer.from(key,'base64').length!==32||Buffer.from(key,'base64').toString('base64')!==key)throw Error();
  runCli(['secret','set','CF_BOT_PUSH_ENCRYPTION_KEY','--repo',repo,'--env',environment],key);
  return {configured:true,created:true};
 }catch{throw Error('Could not confirm or create protected push configuration; no values logged')}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 try{
  const arg=name=>process.argv[process.argv.indexOf(name)+1];
  if(!process.argv.includes('--repo')||!process.argv.includes('--environment'))throw Error();
  const result=preparePushKey({repo:arg('--repo'),environment:arg('--environment'),create:process.argv.includes('--create')});
  console.log(JSON.stringify(result));
 }catch{console.error('Protected push setup failed; no credential value logged');process.exitCode=1}
}
