import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {preparePushKey} from './prepare-bot-push-key.mjs';
import {renderRuntimeSecrets} from './render-runtime-secrets.mjs';

test('protected setup is read-only by default and never replaces an existing master key',()=>{
 const input={repo:'synthetic/project',environment:'development',makeKey:()=>{throw Error('must not generate')}};
 const calls=[];
 const runCli=(args,value)=>{calls.push({args,value});return JSON.stringify([{name:'CF_BOT_PUSH_ENCRYPTION_KEY'}])};
 assert.deepEqual(preparePushKey({...input,runCli,create:true}),{configured:true,created:false});
 assert.equal(calls.length,1); assert.equal(calls[0].args[0],'secret'); assert.equal(calls[0].value,undefined);
 assert.deepEqual(preparePushKey({...input,runCli:()=> '[]'}),{configured:false,created:false});
});
test('new master key uses stdin only and operator failures never reveal provider output',()=>{
 const key=randomBytes(32).toString('base64'),calls=[];
 const runCli=(args,input)=>{calls.push({args,input});return args[1]==='list'?'[]':''};
 assert.deepEqual(preparePushKey({repo:'synthetic/project',environment:'development',create:true,makeKey:()=>key,runCli}),{configured:true,created:true});
 assert.equal(calls[1].input,key);assert.equal(JSON.stringify(calls[1].args).includes(key),false);
 assert.throws(()=>preparePushKey({repo:'synthetic/project',environment:'development',runCli:()=>{throw Error(key)}}),e=>!e.message.includes(key));
});
test('protected runtime bundle merges backup, usage and push secrets; invalid key produces no file',t=>{
 const parent=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(parent,'cyweb-push-secret-test-'));
 t.after(()=>{assert.equal(path.dirname(dir),parent);assert.match(path.basename(dir),/^cyweb-push-secret-test-/);fs.rmSync(dir,{recursive:true,force:true})});
 const outputPath=path.join(dir,'secrets.json'),key=randomBytes(32).toString('base64');
 assert.equal(renderRuntimeSecrets({env:{},outputPath}),false);assert.equal(fs.existsSync(outputPath),false);
 assert.throws(()=>renderRuntimeSecrets({env:{CF_BOT_PUSH_ENCRYPTION_KEY:'invalid',CF_USAGE_API_TOKEN:'synthetic-usage'},outputPath}));
 assert.equal(fs.existsSync(outputPath),false);
 const rsa=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
 const account={type:'service_account',client_email:'synthetic@synthetic.iam.gserviceaccount.com',private_key:rsa};
 assert.equal(renderRuntimeSecrets({env:{CF_BACKUP_ENABLED:'true',GCS_SERVICE_ACCOUNT_JSON:JSON.stringify(account),CF_USAGE_API_TOKEN:'synthetic-usage',CF_BOT_PUSH_ENCRYPTION_KEY:key},outputPath}),true);
 assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)),{GCS_SERVICE_ACCOUNT_JSON:JSON.stringify(account),CF_USAGE_API_TOKEN:'synthetic-usage',BOT_PUSH_ENCRYPTION_KEY:key});
 if(process.platform!=='win32')assert.equal(fs.statSync(outputPath).mode&0o777,0o600);
 const pushOnly=path.join(dir,'push-only.json');assert.equal(renderRuntimeSecrets({env:{CF_BOT_PUSH_ENCRYPTION_KEY:key},outputPath:pushOnly}),true);
 assert.deepEqual(JSON.parse(fs.readFileSync(pushOnly)),{BOT_PUSH_ENCRYPTION_KEY:key});
 assert.throws(()=>renderRuntimeSecrets({env:{CF_BOT_PUSH_ENCRYPTION_KEY:key},outputPath:pushOnly}),/EEXIST/);
});
