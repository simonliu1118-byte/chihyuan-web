export interface BotPushEnv { DB: D1Database; BOT_PUSH_ENCRYPTION_KEY?: string }
export type PushStatus = 'queued' | 'sending' | 'accepted' | 'failed';
export interface PushSetting { botCode: string; configured: boolean; enabled: boolean; updatedAt: string | null }
export class PushError extends Error { constructor(readonly code: string) { super(code); } }
const fail = (code: string): never => { throw new PushError(code); };
const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), x=>x.charCodeAt(0));
function keyBytes(env: BotPushEnv): Uint8Array {
  try { const key=decode(env.BOT_PUSH_ENCRYPTION_KEY??''); if(key.length===32 && b64(key)===env.BOT_PUSH_ENCRYPTION_KEY)return key; } catch {}
  return fail('PUSH_NOT_READY');
}
export function pushAvailable(env: BotPushEnv): boolean { try {keyBytes(env);return true;}catch{return false;} }
type Target = {url:string;key:string};
export function validatePushTarget(value: Target): Target {
  let url: URL;try { url=new URL(value.url); }catch{return fail('PUSH_TARGET_INVALID');}
  if(url.protocol!=='https:' || url.hostname!=='api2.cursor.sh' || url.port || url.username || url.password || url.hash || url.pathname==='/' || value.url.length>2048)
    return fail('PUSH_TARGET_INVALID');
  if(typeof value.key!=='string' || !/^[\x21-\x7e]{16,1024}$/.test(value.key))return fail('PUSH_KEY_INVALID');
  return {url:url.toString(),key:value.key};
}
async function cryptoKey(env:BotPushEnv) { return crypto.subtle.importKey('raw',keyBytes(env),{name:'AES-GCM'},false,['encrypt','decrypt']); }
export async function sealPushTarget(env:BotPushEnv,botId:number,target:Target):Promise<string> {
  const valid=validatePushTarget(target),iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('CYWEB:BOT_REVIEW_PUSH:'+botId)},await cryptoKey(env),encoder.encode(JSON.stringify(valid)));
  return 'v1.'+b64(iv)+'.'+b64(new Uint8Array(encrypted));
}
export async function openPushTarget(env:BotPushEnv,botId:number,sealed:string):Promise<Target> {
  try {
    const [version,iv,data,...extra]=sealed.split('.');if(version!=='v1'||!iv||!data||extra.length)throw Error();
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:encoder.encode('CYWEB:BOT_REVIEW_PUSH:'+botId)},await cryptoKey(env),decode(data));
    return validatePushTarget(JSON.parse(new TextDecoder().decode(plain)) as Target);
  } catch {return fail('PUSH_CONFIG_UNAVAILABLE');}
}
export type PushRow = {draft_id:number;attempts:number;bot_id:number;code:string;encrypted_target:string};
const BACKOFF_MINUTES=[5,15,60,240,1440];
/** Bounded operational delivery; 200 means the routine accepted the event, not completed work. */
export async function deliverReviewPushes(env:BotPushEnv,{now=new Date().toISOString(),limit=3,draftId,fetchImpl=fetch}:{now?:string;limit?:number;draftId?:number;fetchImpl?:typeof fetch}={}):Promise<{accepted:number;failed:number}> {
  if(!pushAvailable(env))return {accepted:0,failed:0};
  // A worker can stop after its final lease was claimed but before recording the result.
  await env.DB.prepare(`UPDATE bot_review_push_outbox SET status='failed',lease_token=NULL,lease_until=NULL,last_error_code='PUSH_LEASE_EXPIRED',updated_at=?
    WHERE status='sending' AND attempts>=6 AND lease_until<=? ${draftId===undefined?'':'AND draft_id=?'}`)
    .bind(now,now,...(draftId===undefined?[]:[draftId])).run();
  const rows=await env.DB.prepare(`SELECT o.draft_id,o.attempts,d.bot_id,b.code,s.encrypted_target
    FROM bot_review_push_outbox o JOIN bot_drafts d ON d.id=o.draft_id JOIN bot_profiles b ON b.id=d.bot_id
    JOIN bot_review_push_settings s ON s.bot_id=d.bot_id AND s.enabled=1
    WHERE o.status IN ('queued','sending') AND o.attempts<6 AND o.next_attempt_at<=? AND d.review_status IN ('approved','rejected') AND NOT EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=d.id)
      AND (o.lease_until IS NULL OR o.lease_until<=?) ${draftId===undefined?'':'AND o.draft_id=?'}
    ORDER BY o.next_attempt_at,o.draft_id LIMIT ?`).bind(now,now,...(draftId===undefined?[]:[draftId]),Math.max(1,Math.min(limit,3))).all<PushRow>();
  let accepted=0,failed=0;
  for(const row of rows.results??[]){
    const lease=crypto.randomUUID(),until=new Date(Date.parse(now)+60_000).toISOString();
    const claim=await env.DB.prepare(`UPDATE bot_review_push_outbox SET status='sending',attempts=attempts+1,lease_token=?,lease_until=?,updated_at=?
      WHERE draft_id=? AND status IN ('queued','sending') AND attempts=? AND attempts<6 AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<=?)
      AND EXISTS (SELECT 1 FROM bot_review_push_settings WHERE bot_id=? AND enabled=1)`)
      .bind(lease,until,now,row.draft_id,row.attempts,now,now,row.bot_id).run();
    if(claim.meta.changes!==1)continue;
    let success=false,permanent=false,errorCode='PUSH_NETWORK',retryMs:number|undefined;
    try{
      const target=await openPushTarget(env,row.bot_id,row.encrypted_target);
      const response=await fetchImpl(target.url,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(7000),headers:{authorization:'Bearer '+target.key,'content-type':'application/json'},body:JSON.stringify({type:'cyweb.review_result',eventId:'bot-review-'+row.draft_id,botCode:row.code,draftId:row.draft_id})});
      success=response.status===200;
      errorCode=success?'':'PUSH_HTTP_'+response.status;
      permanent=!success&&response.status>=300&&response.status<500&&response.status!==408&&response.status!==429;
      const retry=response.headers.get('retry-after');if(response.status===429&&retry&&/^\d{1,6}$/.test(retry))retryMs=Math.min(86_400_000,Math.max(300_000,Number(retry)*1000));
      await response.body?.cancel().catch(()=>{});
    }catch(error){errorCode=error instanceof PushError?error.code:'PUSH_NETWORK';}
    const attempts=row.attempts+1,terminal=!success&&(permanent||attempts>=6);
    const delay=retryMs??(BACKOFF_MINUTES[Math.min(attempts-1,4)]*60_000);
    const updated=await env.DB.prepare(`UPDATE bot_review_push_outbox SET status=?,next_attempt_at=?,lease_token=NULL,lease_until=NULL,last_error_code=?,accepted_at=?,updated_at=?
      WHERE draft_id=? AND lease_token=? AND status='sending'`)
      .bind(success?'accepted':terminal?'failed':'queued',new Date(Date.parse(now)+delay).toISOString(),success?null:errorCode,success?now:null,now,row.draft_id,lease).run();
    if(updated.meta.changes===1){if(success)accepted++;else failed++;}
  }
  return {accepted,failed};
}
export async function cleanupReviewPushes(env:BotPushEnv,now:string):Promise<void>{
  const cutoff=new Date(Date.parse(now)-30*86_400_000).toISOString();
  await env.DB.prepare(`DELETE FROM bot_review_push_outbox WHERE draft_id IN (SELECT draft_id FROM bot_review_push_outbox WHERE updated_at<? ORDER BY updated_at LIMIT 100)`).bind(cutoff).run();
}
