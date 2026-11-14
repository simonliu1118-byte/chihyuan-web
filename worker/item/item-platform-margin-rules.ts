import {needsFeeCategory} from '../../shared/item-platform-fee-categories';
import {parseScaled4} from '../../shared/fixed-point';
import {emptyPlatformMarginRules,type PlatformMarginRules,type PlatformFee,type MarginCoupon} from '../../shared/item-online-margin';
import {FieldValidationError} from '../validation/fields';
import {AuditService} from '../audit/audit-service';
import {ItemServiceError} from './item-service';
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new FieldValidationError({_request:'格式錯誤'});return v as Record<string,unknown>};
export function normalizePlatformMarginRules(platformId:number,raw:unknown):PlatformMarginRules {
 const input=object(raw),errors:Record<string,string>={};
 const text=(v:unknown,key:string)=>{if(typeof v!=='string'||!v.trim()){errors[key]='必填';return ''}return v.trim()};
 const decimal=(v:unknown,key:string,optional=false):string|null=>{
  if(optional&&(v==null||v===''))return null;
  if(typeof v!=='string'){errors[key]='請輸入數值';return '0'}
  try{if(parseScaled4(v)<0)throw Error();return v.trim()}catch{errors[key]='請輸入0以上、最多4位小數';return '0'}
 };
 const list=(key:string)=>{const v=key==='categoryFees'?(input[key]??[]):input[key];if(!Array.isArray(v)){errors[key]='必須是清單';return []}const limit=key==='coupons'?500:100;if(v.length>limit){errors[key]=`最多${limit}筆`;return []}return v};
 const fees=(key:string):PlatformFee[]=>list(key).map((v,i)=>{
  const row=object(v),path=key+'.'+i;const method=row.method==='fixed'?'fixed':'percent';if(row.method!=='fixed'&&row.method!=='percent')errors[path+'.method']='請選計算方式';
  const result:PlatformFee={name:text(row.name,path+'.name'),method,value:decimal(row.value,path+'.value')!,minimum:decimal(row.minimum,path+'.minimum',true),maximum:decimal(row.maximum,path+'.maximum',true)};
  if(result.minimum!=null&&result.maximum!=null&&parseScaled4(result.minimum)>parseScaled4(result.maximum))errors[path+'.maximum']='最高收費不可低於最低';return result;
 });
 const fold=(v:unknown,key:string)=>{const n=decimal(v,key)!;if(parseScaled4(n)>100000)errors[key]='折數須介於0至10';return n};
 const basicFees=fees('basicFees'),activityFees=fees('activityFees');
 const ids=new Set<string>(),names=new Set<string>();
 const categoryFees=fees('categoryFees').map((fee,i)=>{
  const row=object((input.categoryFees as unknown[])[i]);const id=text(row.id,'categoryFees.'+i+'.id');
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||ids.has(id))errors['categoryFees.'+i+'.id']='品類識別無效或重複';
  if(names.has(fee.name))errors['categoryFees.'+i+'.name']='同平台品類名稱不可重複';ids.add(id);names.add(fee.name);
  return {...fee,id};
 });
 if(categoryFees.length&&!needsFeeCategory(platformId))errors.categoryFees='此平台沒有商品品類欄位';
 if(!basicFees.length)errors.basicFees='請至少填一項基本費率，零費用請明確填0';
 if(!activityFees.length)errors.activityFees='請至少填一項活動費率，零費用請明確填0';
 const seen=new Set<number>();
 const tiers=list('tiers').map((v,i)=>{const row=object(v),key='tiers.'+i;const quantity=Number(row.quantity);if(!Number.isSafeInteger(quantity)||quantity<2||seen.has(quantity))errors[key+'.quantity']='請輸入不重複且至少2件的門檻';seen.add(quantity);return {quantity,discount:fold(row.discount,key+'.discount')}}).sort((a,b)=>a.quantity-b.quantity);
 const coupons:MarginCoupon[]=list('coupons').map((v,i)=>{const row=object(v),key='coupons.'+i;const method=row.method==='fixed'?'fixed':'percent';if(row.method!=='fixed'&&row.method!=='percent')errors[key+'.method']='請選折數或金額';const threshold=decimal(row.threshold,key+'.threshold')!;const thresholdValue=parseScaled4(threshold);if(thresholdValue<=0||thresholdValue%10000!==0)errors[key+'.threshold']='滿額門檻須為正整數元';return {name:text(row.name,key+'.name'),method,value:method==='percent'?fold(row.value,key+'.value'):decimal(row.value,key+'.value')!,threshold,cap:decimal(row.cap,key+'.cap',true)}});
 const shippingInput=object(input.shipping);if(typeof shippingInput.enabled!=='boolean')errors.shipping='請選是否負擔運費';const enabled=shippingInput.enabled===true;
 const shipping={enabled,carrier:enabled?text(shippingInput.carrier,'shipping.carrier'):'',amount:enabled?decimal(shippingInput.amount,'shipping.amount')!:'0'};
 const revision=Number(input.revision);if(!Number.isSafeInteger(revision)||revision<0)errors.revision='版本格式錯誤';
 if(Object.keys(errors).length)throw new FieldValidationError(errors);
 return {platformId,revision,basicFees,categoryFees,activityFees,shipping,tiers,coupons};
}
export class ItemPlatformMarginRulesService {
 constructor(private readonly db:D1Database){}
 async get(platformId:number):Promise<PlatformMarginRules>{const result=await this.list([platformId]);if(result[0])return result[0];const found=await this.db.prepare('SELECT id FROM item_web_platforms WHERE id=?').bind(platformId).first();if(!found)throw new ItemServiceError('ITEM_NOT_FOUND',404,'Platform not found');return emptyPlatformMarginRules(platformId)}
 async list(platformIds:readonly number[]):Promise<PlatformMarginRules[]>{if(!platformIds.length)return [];const rows=await this.db.prepare('SELECT rules_json FROM item_platform_margin_rules WHERE platform_id IN (SELECT value FROM json_each(?)) ORDER BY platform_id').bind(JSON.stringify(platformIds)).all<{rules_json:string}>();return (rows.results??[]).map(row=>{const r=JSON.parse(row.rules_json) as PlatformMarginRules;return {...r,categoryFees:r.categoryFees??[]}})}
 async save(platformId:number,raw:unknown,context:{actorMemberId:number;now:string;requestId?:string}):Promise<PlatformMarginRules>{
  const rules=normalizePlatformMarginRules(platformId,raw);await this.get(platformId);const next={...rules,revision:rules.revision+1},json=JSON.stringify(next);
  const audit=new AuditService(this.db);
  const before=await this.db.prepare('SELECT revision FROM item_platform_margin_rules WHERE platform_id=?').bind(platformId).first<{revision:number}>();
  try{await this.db.batch([
   this.db.prepare(`INSERT INTO item_platform_margin_rules(platform_id,revision,rules_json,updated_at,updated_by) SELECT ?1,?2,?3,?4,?5 WHERE ?6=0 OR EXISTS(SELECT 1 FROM item_platform_margin_rules WHERE platform_id=?1 AND revision=?6)
    ON CONFLICT(platform_id) DO UPDATE SET revision=excluded.revision,rules_json=excluded.rules_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by WHERE item_platform_margin_rules.revision=?6`).bind(platformId,next.revision,json,context.now,context.actorMemberId,rules.revision),
   this.db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('MARGIN_RULE_REVISION_CONFLICT') END"),
   this.db.prepare(`INSERT INTO item_platform_fee_categories(platform_id,category_id)
    SELECT ?1,json_extract(value,'$.id') FROM json_each(?2) WHERE true ON CONFLICT(platform_id,category_id) DO NOTHING`).bind(platformId,JSON.stringify(rules.categoryFees)),
   this.db.prepare(`DELETE FROM item_platform_fee_categories WHERE platform_id=? AND category_id NOT IN (SELECT json_extract(value,'$.id') FROM json_each(?))`).bind(platformId,JSON.stringify(rules.categoryFees)),
   this.db.prepare('INSERT INTO item_platform_margin_rule_versions(platform_id,revision,rules_json,updated_at,updated_by) VALUES(?,?,?,?,?)').bind(platformId,next.revision,json,context.now,context.actorMemberId),
   audit.prepareRecord({entityType:'item_margin_rules',entityKey:String(platformId),action:'item_margin_rules.changed',actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,before:{revision:before?.revision??0},after:{revision:next.revision}}),
  ])}catch(error){if(error instanceof Error&&/FOREIGN KEY constraint/i.test(error.message))throw new FieldValidationError({categoryFees:'品類仍有商品使用，請先調整商品品類後再移除'});if(error instanceof Error&&/malformed JSON|UNIQUE constraint/i.test(error.message))throw new ItemServiceError('ITEM_REVISION_CONFLICT',409,'平台費用已更新，請重新載入');throw error}
  return next;
 }
}
