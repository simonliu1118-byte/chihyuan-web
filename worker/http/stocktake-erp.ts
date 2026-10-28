import {parseStocktakeQuantity,STOCKTAKE_NO,STOCKTAKE_SEQ,STOCKTAKE_MAX_ROWS,
  type StocktakeSyncRow,type StocktakeSyncResult,type StocktakeWriteResult,type StocktakeWriteRow} from "../../shared/stocktake";
import {AuditService} from "../audit/audit-service";
import {RequestInputError} from "./request";

export class StocktakeInputError extends RequestInputError {
  constructor(code:string,message:string,status=400){super(code,message,status)}
}
const invalid=(text:string):never=>{throw new StocktakeInputError("INVALID_AGENT_RESULT",text)};
const record=(v:unknown,name:string):Record<string,unknown>=>{
  if(!v||typeof v!=="object"||Array.isArray(v))return invalid(name+"格式不正確");
  return v as Record<string,unknown>;
};
const list=(v:unknown,name:string,max:number):unknown[]=>{
  if(!Array.isArray(v)||v.length>max)return invalid(name+"超過上限或格式不正確");
  return v;
};
const str=(v:unknown,name:string,max:number,required=false):string=>{
  if(typeof v!=="string"||v.length>max||(required&&!v.trim()))return invalid(name+"格式不正確");
  return v;
};
const sheetNo=(v:unknown)=>{const n=str(v,"底稿編號",20,true);if(!STOCKTAKE_NO.test(n))return invalid("底稿編號只能是 1～20 位英數");return n};
const qty=(v:unknown)=>{try{parseStocktakeQuantity(v)}catch{return invalid("盤點數量必須是數字字串（至多四位小數）")}return v as string};
const seq=(v:unknown)=>{const n=str(v,"序號",5,true);if(!STOCKTAKE_SEQ.test(n))return invalid("底稿序號需為 5 位數字");return n};
const date=(v:unknown)=>{const n=str(v,"日期",10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(n)||!Number.isFinite(Date.parse(n+"T00:00:00Z"))||new Date(n+"T00:00:00Z").toISOString().slice(0,10)!==n)return invalid("盤點日期不正確");return n};
export function validateSyncResult(body:Record<string,unknown>,skip:string[],onlySheet:string|null):StocktakeSyncResult {
 const outcome=body.outcome;if(outcome!=="FOUND"&&outcome!=="NOT_FOUND"&&outcome!=="FAILED")return invalid("同步狀態不正確");
 const sheets=list(body.sheets,"盤點單清單",200).map(raw=>{const row=record(raw,"盤點單");return {sheetNo:sheetNo(row.sheetNo),date:date(row.date)}});
 const sheetKeys=new Set<string>();
 for(const sh of sheets){if(sheetKeys.has(sh.sheetNo))invalid("底稿不可重複");sheetKeys.add(sh.sheetNo)}
 const details=list(body.details,"盤點明細",200).map(raw=>{
   const x=record(raw,"底稿明細"),number=sheetNo(x.sheetNo);
   if(!sheetKeys.has(number)||skip.includes(number)&&onlySheet!==number)invalid("明細含非要求底稿");
   const keys=new Set<string>();
   const rows=list(x.rows,"底稿列",STOCKTAKE_MAX_ROWS).map(rawRow=>{
     const row=record(rawRow,"底稿列");
     const v:StocktakeSyncRow={seq:seq(row.seq),itemCode:str(row.itemCode,"品號",40,true),
       itemName:str(row.itemName,"品名",200,true),spec:str(row.spec,"規格",200),
       warehouseName:str(row.warehouseName,"庫別",80),location:str(row.location,"儲位",80),
       unit:str(row.unit,"單位",30),batch:str(row.batch,"批號",80),bookQty:qty(row.bookQty)};
     if(keys.has(v.seq))invalid("底稿序號不可重複");keys.add(v.seq);return v;
   });
   return {sheetNo:number,rows};
 });
 const detailKeys=new Set<string>();
 for(const d of details){if(detailKeys.has(d.sheetNo))invalid("同張底稿明細重複");detailKeys.add(d.sheetNo)}
 if(onlySheet){
   if(details.length!==1||details[0].sheetNo!==onlySheet||sheets.some(s=>s.sheetNo!==onlySheet))invalid("重新整理只能回傳指定的一張底稿");
 }else{
   for(const s of sheets)if(!skip.includes(s.sheetNo)&&!detailKeys.has(s.sheetNo)&&outcome==="FOUND")invalid("缺少未讀底稿明細");
 }
 if(outcome==="NOT_FOUND"&&details.length)invalid("NOT_FOUND 不可有明細");
 if(outcome==="FOUND"&&!details.length)invalid("FOUND 必須有明細");
 if(outcome==="FAILED"&&details.length)invalid("失敗不可有明細");
 return {outcome,sheets,details};
}
export function validateWriteResult(body:Record<string,unknown>,sheet:string,expected:readonly StocktakeWriteRow[]):StocktakeWriteResult{
 if(body.outcome!=="FOUND"&&body.outcome!=="FAILED")return invalid("寫回狀態不正確");
 if(sheetNo(body.sheetNo)!==sheet)invalid("寫回底稿與工作不符");
 if(typeof body.confirmed!=="boolean")invalid("confirmed 不正確");
 const ids=new Set(expected.map(x=>x.key)),seen=new Set<string>();
 const results=list(body.results,"寫回結果",STOCKTAKE_MAX_ROWS).map(raw=>{
   const v=record(raw,"逐列結果"),key=str(v.key,"列鍵",40,true);
   if(!ids.has(key)||seen.has(key))invalid("寫回列鍵未授權或重複");
   seen.add(key);
   if(typeof v.ok!=="boolean")invalid("寫回結果 ok 不正確");
   const erpSeq=v.erpSeq===null?null:seq(v.erpSeq);
   return {key,ok:v.ok as boolean,erpSeq,message:str(v.message,"結果",200)};
 });
 if(results.length!==expected.length)invalid("寫回結果列數不符");
 const mismatches=list(body.mismatches,"ERP 核對差異",STOCKTAKE_MAX_ROWS).map(raw=>{
   const m=record(raw,"核對差異"),key=str(m.key,"列鍵",40,true);
   // INVR11 checks the entire stocktake, including rows unchanged by this write.
   // A discrepancy may legally refer to a row not present in the job's write list.
   // writeResultStatements verifies each such key against the persisted sheet.
   return {key,seq:m.seq===null?null:seq(m.seq),itemCode:str(m.itemCode,"品號",40,true),
     batch:str(m.batch,"批號",80),expected:qty(m.expected),actual:qty(m.actual)};
 });
 if(body.confirmed&&(body.outcome!=="FOUND"||mismatches.length||results.some(x=>!x.ok)))invalid("確認與寫回核對結果不一致");
 return {outcome:body.outcome, sheetNo:sheet,results,confirmed:body.confirmed as boolean,mismatches};
}
type JobParams={id:string;member:number;now:string;notBefore:string|null;sheet:string|null;
 type:"STOCKTAKE_SYNC"|"STOCKTAKE_WRITE"; payload:unknown;requestId:string};
export function stocktakeJobStatements(db:D1Database,input:JobParams):D1PreparedStatement[] {
 const expires=new Date((input.notBefore?Date.parse(input.notBefore):Date.parse(input.now))+60*60000).toISOString();
 const payload=JSON.stringify(input.payload);
 return [
  db.prepare(`SELECT CASE WHEN
    (SELECT COUNT(*) FROM erp_item_queries WHERE owner_member_id=?1 AND status IN ('QUEUED','RUNNING'))<3
    THEN 1 ELSE json('') END`).bind(input.member),
  db.prepare(`INSERT INTO erp_item_queries(id,owner_member_id,item_no,status,created_at,expires_at,include_history,
    query_type,keyword,target_code,include_cost,not_before)
    VALUES(?,?,?,'QUEUED',?,?,0,?,?,?,0,?)`)
    .bind(input.id,input.member,input.type,input.now,expires,input.type,payload,input.sheet,input.notBefore),
  new AuditService(db).prepareRecord({
    entityType:"erp_item_query",entityKey:input.id,action:"erp_item_query.created",actorEmployeeId:input.member,
    requestId:input.requestId,statusTo:"QUEUED",metadata:{queryType:input.type,sheetNo:input.sheet}
  })
 ];
}
export type SyncSheetRow={sheet_no:string;status:string;detail_read_at:string|null};
export async function syncStatements(db:D1Database,body:StocktakeSyncResult,onlySheet:string|null,now:string):Promise<D1PreparedStatement[]>{
 const out:D1PreparedStatement[]=[];
 for(const d of body.details){
   const current=await db.prepare("SELECT sheet_no,status,detail_read_at FROM stocktake_sheets WHERE sheet_no=?")
     .bind(d.sheetNo).first<SyncSheetRow>();
   if(current&&current.status!=="COUNTING")invalid("非初盤底稿不得重新整理");
   if(current&&!onlySheet&&current.detail_read_at)invalid("已讀底稿不能覆寫");
   if(current&&onlySheet){
     const filled=await db.prepare("SELECT 1 AS yes FROM stocktake_lines WHERE sheet_no=? AND (first_qty IS NOT NULL OR recount_qty IS NOT NULL) LIMIT 1").bind(d.sheetNo).first();
     if(filled)invalid("已有填寫資料的底稿不得重新整理");
   }
   if(current){
     out.push(db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM stocktake_sheets WHERE sheet_no=? AND status='COUNTING') AND NOT EXISTS (SELECT 1 FROM stocktake_lines WHERE sheet_no=? AND (first_qty IS NOT NULL OR recount_qty IS NOT NULL)) THEN 1 ELSE json('') END").bind(d.sheetNo,d.sheetNo));
     out.push(db.prepare("DELETE FROM stocktake_lines WHERE sheet_no=?").bind(d.sheetNo));
     out.push(db.prepare("UPDATE stocktake_sheets SET sheet_date=?,detail_read_at=?,version=version+1,updated_at=? WHERE sheet_no=?").bind(body.sheets.find(s=>s.sheetNo===d.sheetNo)!.date,now,now,d.sheetNo));
   }else{
     out.push(db.prepare("INSERT INTO stocktake_sheets(sheet_no,sheet_date,detail_read_at,status,created_at,updated_at) VALUES(?,?,?,'COUNTING',?,?)")
       .bind(d.sheetNo,body.sheets.find(s=>s.sheetNo===d.sheetNo)!.date,now,now,now));
   }
   // One indexed, transactional INSERT per sheet, not 3,000 individual D1
   // statements. Rows are already validated and normalized above.
   // This reduces Worker/D1 CPU, subrequest payload and batch execution time.
   if(d.rows.length)out.push(db.prepare(`INSERT INTO stocktake_lines(
     sheet_no,line_key,seq,item_code,item_name,spec,warehouse_name,location,unit,batch,book_qty)
     SELECT ?1,json_extract(value,'$.seq'),json_extract(value,'$.seq'),
       json_extract(value,'$.itemCode'),json_extract(value,'$.itemName'),
       json_extract(value,'$.spec'),json_extract(value,'$.warehouseName'),
       json_extract(value,'$.location'),json_extract(value,'$.unit'),
       json_extract(value,'$.batch'),json_extract(value,'$.bookQty')
     FROM json_each(?2)`).bind(d.sheetNo,JSON.stringify(d.rows)));
   out.push(new AuditService(db).prepareRecord({entityType:"stocktake",entityKey:d.sheetNo,
     action:"stocktake.sheet_synced",actorEmployeeId:null,statusTo:"COUNTING",
     metadata:{lines:d.rows.length,refresh:!!onlySheet}}));
 }
 return out;
}
export async function writeResultStatements(db:D1Database,body:StocktakeWriteResult,jobId:string,now:string):Promise<D1PreparedStatement[]>{
 // Check INVR11 mismatches against the complete sheet, not just changed rows.
 // Validation must finish before the atomic job-completion batch.
 if(body.mismatches.length){
   const lines=await db.prepare(`SELECT line_key,seq,erp_seq,is_added,item_code,batch FROM stocktake_lines
     WHERE sheet_no=? LIMIT 3001`).bind(body.sheetNo).all<{
       line_key:string;seq:string|null;erp_seq:string|null;is_added:number;item_code:string;batch:string
     }>();
   const byKey=new Map((lines.results??[]).map(l=>[l.line_key,l]));
   const seen=new Set<string>();
   const resultSeq=new Map(body.results.map(row=>[row.key,row.erpSeq]));
   for(const m of body.mismatches){
     const line=byKey.get(m.key);
     // An added batch can acquire its ERP sequence during this very completion.
     const acceptedSeq=line && (m.seq===line.seq || m.seq===line.erp_seq ||
       (line.is_added===1 && m.seq===resultSeq.get(m.key)));
     if(!line || seen.has(m.key) || !acceptedSeq ||
       line.item_code!==m.itemCode || line.batch!==m.batch)
       invalid("ERP 核對差異與底稿逐列資料不符");
     seen.add(m.key);
   }
 }
 const out:D1PreparedStatement[]=[
   db.prepare("SELECT CASE WHEN EXISTS (SELECT 1 FROM stocktake_sheets WHERE sheet_no=? AND status='WRITING' AND write_query_id=?) THEN 1 ELSE json('') END")
    .bind(body.sheetNo,jobId),
   db.prepare("UPDATE stocktake_sheets SET status=?,write_result_json=?,erp_confirmed_at=?,updated_at=?,version=version+1 WHERE sheet_no=? AND status='WRITING' AND write_query_id=?")
    .bind(body.confirmed?"ERP_CONFIRMED":"WRITE_FAILED",JSON.stringify({results:body.results,mismatches:body.mismatches}),body.confirmed?now:null,now,body.sheetNo,jobId),
 ];
 for(const row of body.results)if(row.erpSeq)out.push(db.prepare("UPDATE stocktake_lines SET erp_seq=? WHERE sheet_no=? AND line_key=? AND is_added=1").bind(row.erpSeq,body.sheetNo,row.key));
 out.push(new AuditService(db).prepareRecord({entityType:"stocktake",entityKey:body.sheetNo,
   action:body.confirmed?"stocktake.erp_confirmed":"stocktake.write_failed",
   actorEmployeeId:null,statusFrom:"WRITING",statusTo:body.confirmed?"ERP_CONFIRMED":"WRITE_FAILED",
   metadata:{jobId,mismatches:body.mismatches.length,failures:body.results.filter(r=>!r.ok).length}
 }));
 return out;
}
