import {requireModuleAccess} from "../auth/guard";
import {identityClient,type IdentityRuntimeEnv} from "./auth-routes";
import {success,failure} from "./response";
import {AuditService} from "../audit/audit-service";
import {parseStocktakeQuantity,stocktakeItemTotals,stocktakeWriteRows,stocktakeAggregateLines,
  stocktakeLocations,STOCKTAKE_NO,
  type StocktakeLine,type StocktakeLocationCount,type StocktakeSheet,type StocktakeStatus} from "../../shared/stocktake";
import {stocktakeJobStatements,StocktakeInputError} from "./stocktake-erp";

type Sheet={sheet_no:string;sheet_date:string|null;status:StocktakeStatus;version:number;
 detail_read_at:string|null;first_confirmed_at:string|null;second_confirmed_at:string|null;
 erp_confirmed_at:string|null;write_query_id:string|null;write_result_json:string|null;
 total_lines:number;counted_lines:number;recount_needed:number};
type Line={sheet_no:string;line_key:string;seq:string|null;item_code:string;item_name:string;spec:string;
 warehouse_name:string;location:string;unit:string;batch:string;book_qty:string;
 is_added:number;erp_seq:string|null;first_qty:string|null;first_by:number|null;first_at:string|null;
 recount_qty:string|null;recount_by:number|null;recount_at:string|null;
 first_by_name?:string|null;recount_by_name?:string|null;locked:number;version:number;rev:number};
type LocationCell={id:number;sheet_no:string;source_line_key:string;warehouse_name:string;location_code:string;erp_location_code:string;manual_verified_at:string|null;manual_verified_by:number|null;
 first_qty:string|null;first_by:number|null;first_at:string|null;
 recount_qty:string|null;recount_by:number|null;recount_at:string|null;
 first_by_name?:string|null;recount_by_name?:string|null;version:number;rev:number};
const toCell=(row:LocationCell):StocktakeLocationCount=>({
 id:row.id,sheetNo:row.sheet_no,sourceLineKey:row.source_line_key,warehouseName:row.warehouse_name,
 locationCode:row.location_code,erpLocationCode:row.erp_location_code,
 manualVerifiedAt:row.manual_verified_at,manualVerifiedBy:row.manual_verified_by,firstQty:row.first_qty,firstBy:row.first_by,firstAt:row.first_at,
 recountQty:row.recount_qty,recountBy:row.recount_by,recountAt:row.recount_at,
 firstByName:row.first_by_name??null,recountByName:row.recount_by_name??null,
 version:row.version,rev:row.rev
});
class Invalid extends Error {constructor(public code:string,message:string,public status=422){super(message)}}
const fail=(code:string,message:string,status=422):never=>{throw new Invalid(code,message,status)};
const sheetNo=(value:unknown)=>typeof value==="string"&&STOCKTAKE_NO.test(value)?value:fail("STOCKTAKE_INVALID","底稿編號必須是 1～20 位英數字");
const text=(value:unknown,name:string,max:number)=>typeof value==="string"&&value.trim().length>0&&value.length<=max?value.trim():fail("STOCKTAKE_INVALID",name+"不正確");
const json=async(request:Request)=>{const v=await request.json().catch(()=>null);
 if(!v||typeof v!=="object"||Array.isArray(v))return fail("STOCKTAKE_INVALID","資料格式不正確");return v as Record<string,unknown>};
const one=async<T>(db:D1Database,sql:string,...args:unknown[])=>db.prepare(sql).bind(...args).first<T>();
const all=async<T>(db:D1Database,sql:string,...args:unknown[])=>((await db.prepare(sql).bind(...args).all<T>()).results??[]) as T[];
const participant=(db:D1Database,sheet:string,member:number,now:string)=>db.prepare(`INSERT INTO stocktake_participants(sheet_no,member_id,first_at,last_at)
 VALUES(?,?,?,?) ON CONFLICT(sheet_no,member_id) DO UPDATE SET last_at=excluded.last_at`).bind(sheet,member,now,now);
const guard=(db:D1Database,sql:string,...args:unknown[])=>db.prepare("SELECT CASE WHEN ("+sql+") THEN 1 ELSE json('') END").bind(...args);
const audit=(db:D1Database,sheet:string,act:string,member:number,requestId:string,metadata:Record<string,unknown>)=>
 new AuditService(db).prepareRecord({entityType:"stocktake",entityKey:sheet,action:"stocktake."+act,
   actorEmployeeId:member,requestId,metadata});
const toLine=(row:Line,status:StocktakeStatus):StocktakeLine=>{
 // The blind-counting boundary lives here, never in the front-end.
 const open=status!=="COUNTING"&&status!=="IGNORED";
 const base:StocktakeLine={sheetNo:row.sheet_no,lineKey:row.line_key,seq:row.seq,itemCode:row.item_code,
 itemName:row.item_name,spec:row.spec,warehouseName:row.warehouse_name,location:row.location,
 unit:row.unit,batch:row.batch,isAdded:!!row.is_added,erpSeq:row.erp_seq,
 firstQty:row.first_qty,firstBy:row.first_by,firstAt:row.first_at,
 recountQty:row.recount_qty,recountBy:row.recount_by,recountAt:row.recount_at,
 firstByName:row.first_by_name??null,recountByName:row.recount_by_name??null,
 locked:!!row.locked,version:row.version};
 if(open)base.bookQty=row.book_qty;
 return base;
};
const sheetJson=(sheet:Sheet,lines:Line[]):StocktakeSheet=>({
 sheetNo:sheet.sheet_no,sheetDate:sheet.sheet_date,status:sheet.status,version:sheet.version,
 detailReadAt:sheet.detail_read_at,firstConfirmedAt:sheet.first_confirmed_at,
 secondConfirmedAt:sheet.second_confirmed_at,erpConfirmedAt:sheet.erp_confirmed_at,
 writeQueryId:sheet.write_query_id,writeResult:sheet.write_result_json?JSON.parse(sheet.write_result_json):null,
 total:sheet.total_lines,counted:sheet.counted_lines,
 recountNeeded:sheet.recount_needed,
});
async function detail(db:D1Database,sheet:string,since?:number,existing?:Sheet){
 const sh=existing??await one<Sheet>(db,"SELECT * FROM stocktake_sheets WHERE sheet_no=?",sheet);
 if(!sh)return fail("STOCKTAKE_NOT_FOUND","盤點單不存在",404);
 if(since!==undefined&&sh.version===since)return {sheet:sheetJson(sh,[]),lines:[],locationCounts:[],removedKeys:[]};
 const lines=await all<Line>(db,`SELECT l.*,
   COALESCE(f.display_name,f.employee_no) AS first_by_name,
   COALESCE(rc.display_name,rc.employee_no) AS recount_by_name
   FROM stocktake_lines l LEFT JOIN app_members f ON f.id=l.first_by
   LEFT JOIN app_members rc ON rc.id=l.recount_by
   WHERE l.sheet_no=? ${since===undefined?"":"AND l.rev>?"} ORDER BY l.location,l.item_code,l.batch,l.line_key LIMIT 3001`,...(since===undefined?[sheet]:[sheet,since]));
 if(lines.length>3000)fail("STOCKTAKE_LIMIT","盤點列數超過 3000",409);
 const cells=await all<LocationCell>(db,`SELECT c.*,
   COALESCE(f.display_name,f.employee_no) AS first_by_name,
   COALESCE(rc.display_name,rc.employee_no) AS recount_by_name
   FROM stocktake_location_counts c LEFT JOIN app_members f ON f.id=c.first_by
   LEFT JOIN app_members rc ON rc.id=c.recount_by
   WHERE c.sheet_no=? ${since===undefined?"":"AND c.rev>?"}
   ORDER BY c.warehouse_name,c.location_code,c.id LIMIT 3001`,...(since===undefined?[sheet]:[sheet,since]));
 if(cells.length>3000)fail("STOCKTAKE_LIMIT","儲位盤點格超過 3000",409);
 const removedKeys=since===undefined?[]:(await all<{line_key:string}>(db,"SELECT line_key FROM stocktake_line_history WHERE sheet_no=? AND removed_rev>? ORDER BY id LIMIT 3001",sheet,since)).map(r=>r.line_key);
 return {sheet:sheetJson(sh,lines),lines:lines.map(l=>toLine(l,sh.status)),
   locationCounts:cells.map(toCell),removedKeys};
}
const version=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=1?Number(v):fail("STOCKTAKE_INVALID","版本不正確");
const safeQty=(value:unknown)=>{try{parseStocktakeQuantity(value);return value as string}catch{return fail("STOCKTAKE_INVALID","數量需為數字字串，最多四位小數且小於十億")}};
/** A counted quantity is what is on the shelf: never below zero (the ERP book may be). */
const countQty=(value:unknown)=>{const v=safeQty(value);if(parseStocktakeQuantity(v)<0n)fail("STOCKTAKE_INVALID","盤點數量不可小於 0");return v};
const requireAdmin=(role:string)=>{if(role!=="ADMIN"&&role!=="SUPER_ADMIN")fail("ACCESS_DENIED","僅管理員可以執行此操作",403)};
const nowIso=()=>new Date().toISOString();
async function verifyJobQuota(db:D1Database,member:number){
 const count=await one<{n:number}>(db,
   "SELECT COUNT(*) AS n FROM erp_item_queries WHERE owner_member_id=? AND status IN ('QUEUED','RUNNING')",member);
 if((count?.n??0)>=3)fail("ERP_QUEUE_LIMIT","每人同時最多三筆 ERP 查詢或寫回工作，請等待完成後再送出。",409);
}
async function createJob(db:D1Database,actor:number,requestId:string,type:"STOCKTAKE_SYNC"|"STOCKTAKE_WRITE",payload:unknown,sheet:string|null,
 extras:D1PreparedStatement[]=[]){
 const control=await one<{hold_until:string|null}>(db,"SELECT hold_until FROM erp_item_agent_control WHERE id=1");
 const now=nowIso(),id=crypto.randomUUID(),notBefore=control?.hold_until&&Date.parse(control.hold_until)>Date.now()?control.hold_until:null;
 await verifyJobQuota(db,actor);
 const stm=stocktakeJobStatements(db,{id,member:actor,now,notBefore,sheet,type,payload,requestId});
 await db.batch([...stm,...extras]);
 return {id,queryType:type,status:"QUEUED",notBefore};
}
export async function handleStoreStocktakeRoute(request:Request,env:IdentityRuntimeEnv,requestId:string):Promise<Response|null>{
 const url=new URL(request.url),root="/api/business/store/stocktake";
 if(!url.pathname.startsWith(root))return null;
 const provider=identityClient(env);
 if(!provider)return failure({code:"IDENTITY_UNAVAILABLE",message:"身分服務無法使用"},requestId,503);
 const gate=await requireModuleAccess(provider,env.DB,request,"STORE_STOCKTAKE");
 if(!gate.ok)return failure({code:gate.code,message:"沒有門市庫存盤點權限"},requestId,gate.status);
 const member=gate.member.id,role=gate.principal.workspaceRole,admin=role==="ADMIN"||role==="SUPER_ADMIN";
 const method=request.method,path=url.pathname.slice(root.length).replace(/^\//,""),db=env.DB,now=nowIso();
 try{
  if(!path&&method==="GET"){
   const ignored=url.searchParams.get("ignored")==="true";
   if(ignored){
    requireAdmin(role);
    const entries=await all<{sheet_no:string;created_at:string}>(db,"SELECT sheet_no,created_at FROM stocktake_sync_ignored ORDER BY sheet_no LIMIT 501");
    if(entries.length>500)fail("STOCKTAKE_LIMIT","忽略清單超過 500 筆",409);
    return success(entries.map(e=>({sheetNo:e.sheet_no,createdAt:e.created_at})),requestId);
   }
   const sheets=await all<Sheet>(db,"SELECT * FROM stocktake_sheets WHERE status<>'IGNORED' ORDER BY sheet_date DESC,sheet_no DESC LIMIT 501");
   if(sheets.length>500)fail("STOCKTAKE_LIMIT","底稿超過 500 張",409);
   return success(sheets.map(sh=>sheetJson(sh,[])),requestId);
  }
  if(path==="ignore"&&method==="POST"){
   requireAdmin(role);const v=await json(request),sheet=sheetNo(v.sheetNo);
   // A duplicate fails the batch (UNIQUE → 409), so the Audit only records a real addition.
   await db.batch([db.prepare("INSERT INTO stocktake_sync_ignored(sheet_no,created_at,updated_at) VALUES(?,?,?)").bind(sheet,now,now),
    audit(db,sheet,"sync_ignored",member,requestId,{})]);
   return success({sheetNo:sheet,ignored:true},requestId);
  }
  if(path==="ignore"&&method==="DELETE"){
   requireAdmin(role);const v=await json(request),sheet=sheetNo(v.sheetNo);
   const removed=await db.prepare("DELETE FROM stocktake_sync_ignored WHERE sheet_no=?").bind(sheet).run();
   if(removed.meta.changes)await audit(db,sheet,"sync_unignored",member,requestId,{}).run();
   return success({sheetNo:sheet,ignored:false},requestId);
  }
  if(path==="sync"&&method==="POST"){
   const sheets=await all<{sheet_no:string;detail_read_at:string|null}>(db,"SELECT sheet_no,detail_read_at FROM stocktake_sheets ORDER BY sheet_no LIMIT 501");
   const ignored=await all<{sheet_no:string}>(db,"SELECT sheet_no FROM stocktake_sync_ignored ORDER BY sheet_no LIMIT 501");
   if(sheets.length>500||ignored.length>500)fail("STOCKTAKE_LIMIT","底稿或忽略清單超過 500 筆",409);
   const skip=[...new Set([...sheets.filter(s=>s.detail_read_at!==null).map(s=>s.sheet_no),...ignored.map(s=>s.sheet_no)])];
   return success(await createJob(db,member,requestId,"STOCKTAKE_SYNC",{skipSheets:skip,onlySheet:null},null),requestId);
  }
  const match=/^([A-Za-z0-9]{1,20})(?:\/(.*))?$/.exec(path);
  if(!match)return failure({code:"NOT_FOUND",message:"盤點路徑不存在"},requestId,404);
  const sheet=sheetNo(match[1]),action=match[2]??"";
  const sh=await one<Sheet>(db,"SELECT * FROM stocktake_sheets WHERE sheet_no=?",sheet);
  if(!sh)throw new Invalid("STOCKTAKE_NOT_FOUND","盤點單不存在",404);
  if(!action&&method==="GET"){
    const raw=url.searchParams.get("since");
    if(raw!==null&&!/^(0|[1-9][0-9]{0,9})$/.test(raw))fail("STOCKTAKE_INVALID","since 版本格式不正確");
    const since=raw===null?undefined:Number(raw);
    return success(await detail(db,sheet,since!==undefined&&since<=sh.version?since:undefined,sh),requestId);
  }
  if(action==="history"&&method==="GET"){
    const line=text(url.searchParams.get("lineKey"),"列鍵",40);
    const rawCell=url.searchParams.get("locationCountId");
    const cellId=rawCell===null?null:Number(rawCell);
    if(cellId!==null&&(!Number.isSafeInteger(cellId)||cellId<1))fail("STOCKTAKE_INVALID","儲位盤點格編號不正確");
    return success(await all(db,`SELECT h.id,h.field,h.location_count_id AS locationCountId,h.before_value AS beforeValue,h.after_value AS afterValue,
      h.actor_member_id AS memberId,h.changed_at AS at,COALESCE(m.display_name,m.employee_no) AS actorName
      FROM stocktake_line_history h JOIN app_members m ON m.id=h.actor_member_id
      WHERE h.sheet_no=? AND h.line_key=? AND (? IS NULL OR h.location_count_id=?) ORDER BY h.id DESC LIMIT 101`,sheet,line,cellId,cellId),requestId);
  }
  if(action==="refresh"&&method==="POST"){
    requireAdmin(role);if(sh.status!=="COUNTING"||!sh.detail_read_at)fail("STOCKTAKE_STATUS","只有已讀明細的初盤底稿可重新整理",409);
    const filled=await one(db,"SELECT 1 FROM stocktake_location_counts WHERE sheet_no=? AND (first_qty IS NOT NULL OR recount_qty IS NOT NULL) LIMIT 1",sheet);
    if(filled)fail("STOCKTAKE_STATUS","已有填寫的底稿不可重新整理",409);
    return success(await createJob(db,member,requestId,"STOCKTAKE_SYNC",{skipSheets:[],onlySheet:sheet},sheet),requestId);
  }
  if(action==="line"&&method==="PATCH"){
    const v=await json(request),expected=version(v.expectedVersion);
    const id=v.locationCountId;
    if(!Number.isSafeInteger(id)||Number(id)<1)fail("STOCKTAKE_INVALID","必須指定有效儲位盤點格");
    const cell=await one<LocationCell>(db,
      "SELECT c.* FROM stocktake_location_counts c WHERE c.sheet_no=? AND c.id=?",sheet,id);
    if(!cell)throw new Invalid("STOCKTAKE_NOT_FOUND","儲位盤點格不存在",404);
    if(cell.version!==expected)fail("STOCKTAKE_VERSION_CONFLICT","這個儲位剛被其他人修改，請核對最新數量",409);
    const parent=await one<Line>(db,"SELECT * FROM stocktake_lines WHERE sheet_no=? AND line_key=?",sheet,cell.source_line_key);
    if(!parent)throw new Invalid("STOCKTAKE_NOT_FOUND","對應 ERP 底稿列不存在",404);
    const field=sh.status==="COUNTING"?"first_qty":sh.status==="RECOUNTING"?"recount_qty":null;
    if(!field||parent.locked)fail("STOCKTAKE_STATUS","目前狀態不可修改這個儲位",409);
    const value=v.quantity===null?null:countQty(v.quantity),before=field==="first_qty"?cell.first_qty:cell.recount_qty;
    await db.batch([
      guard(db,"EXISTS(SELECT 1 FROM stocktake_sheets WHERE sheet_no=? AND status=?)",sheet,sh.status),
      guard(db,"EXISTS(SELECT 1 FROM stocktake_location_counts WHERE sheet_no=? AND id=? AND version=?)",sheet,id,expected),
      guard(db,"EXISTS(SELECT 1 FROM stocktake_lines WHERE sheet_no=? AND line_key=? AND locked=0)",sheet,parent.line_key),
      db.prepare("UPDATE stocktake_location_counts SET "+field+"=?, "+
        (field==="first_qty"?"first_by":"recount_by")+"=?, "+
        (field==="first_qty"?"first_at":"recount_at")+"=?,version=version+1,"+
        "rev=(SELECT version+1 FROM stocktake_sheets WHERE sheet_no=?) WHERE sheet_no=? AND id=?")
        .bind(value,member,now,sheet,sheet,id),
      db.prepare("UPDATE stocktake_sheets SET version=version+1,counted_lines=counted_lines+?,updated_at=? WHERE sheet_no=?")
        .bind(field==="first_qty"?(before===null&&value!==null?1:before!==null&&value===null?-1:0):0,now,sheet),
      db.prepare("INSERT INTO stocktake_line_history(sheet_no,line_key,location_count_id,field,before_value,after_value,actor_member_id,changed_at) VALUES(?,?,?,?,?,?,?,?)")
        .bind(sheet,parent.line_key,id,field,before,value,member,now),
      participant(db,sheet,member,now)
    ]);
    const updated=await detail(db,sheet,sh.version);
    return success({sheet:updated.sheet,locationCount:updated.locationCounts.find(cell=>cell.id===id)},requestId);
  }
  if(action==="batches"&&method==="POST"){
    const v=await json(request),code=text(v.itemCode,"品號",40),batch=text(v.batch,"批號",80);
    const warehouse=typeof v.warehouseName==="string"?v.warehouseName:"";
    const location=typeof v.locationCode==="string"?v.locationCode:"";
    if(!/^(?:[0-9]{4})?$/.test(location))fail("STOCKTAKE_LOCATION_INVALID","儲位必須是四碼或未指定",422);
    if(sh.status!=="COUNTING"&&sh.status!=="RECOUNTING")fail("STOCKTAKE_STATUS","目前不能新增批號",409);
    const same=await all<Line>(db,"SELECT * FROM stocktake_lines WHERE sheet_no=? AND item_code=? LIMIT 3001",sheet,code);
    if(!same.some(l=>!l.is_added&&l.batch))fail("STOCKTAKE_INVALID","此品號原本沒有批號，不能新增批號");
    const bases=same.filter(l=>l.warehouse_name===warehouse);
    if(!bases.length)fail("STOCKTAKE_INVALID","品號不在選定的庫別");
    if(sh.status==="RECOUNTING"&&same.some(l=>l.locked))
      fail("STOCKTAKE_STATUS","此品號合計已核對並鎖定，不能增加新批號",409);
    const matching=bases.filter(l=>l.batch===batch);
    if(matching.length>1)fail("STOCKTAKE_AMBIGUOUS","同批號有多個 ERP 序號，禁止自動選擇",409);
    const qty=v.quantity===undefined?null:countQty(v.quantity),recount=sh.status==="RECOUNTING";
    const phase=recount?"recount_qty":"first_qty",by=recount?"recount_by":"first_by",at=recount?"recount_at":"first_at";
    if(matching.length){
      const parent=matching[0];
      // A locked (book-matched) item is not recounted, so a new cell there would be lost on write.
      if(parent.locked)fail("STOCKTAKE_STATUS","已核對鎖定的品號不能新增儲位",409);
      const duplicate=await one<LocationCell>(db,"SELECT * FROM stocktake_location_counts WHERE sheet_no=? AND source_line_key=? AND warehouse_name=? AND location_code=?",sheet,parent.line_key,warehouse,location);
      if(duplicate)fail("STOCKTAKE_DUPLICATE","這個儲位已經有此批號",409);
      await db.batch([
        guard(db,"EXISTS(SELECT 1 FROM stocktake_sheets WHERE sheet_no=? AND status=?)",sheet,sh.status),
        guard(db,"NOT EXISTS(SELECT 1 FROM stocktake_location_counts WHERE sheet_no=? AND source_line_key=? AND warehouse_name=? AND location_code=?)",sheet,parent.line_key,warehouse,location),
        db.prepare(`INSERT INTO stocktake_location_counts(sheet_no,source_line_key,warehouse_name,location_code,erp_location_code,${phase},${by},${at},rev)
          VALUES(?,?,?,?,'',?,?,?,(SELECT version+1 FROM stocktake_sheets WHERE sheet_no=?))`)
          .bind(sheet,parent.line_key,warehouse,location,qty,qty===null?null:member,qty===null?null:now,sheet),
        ...(recount?[db.prepare("UPDATE stocktake_location_counts SET first_qty='0' WHERE sheet_no=? AND source_line_key=? AND location_code=?").bind(sheet,parent.line_key,location)]:[]),
        db.prepare("UPDATE stocktake_sheets SET version=version+1,total_lines=total_lines+1,counted_lines=counted_lines+?,recount_needed=recount_needed+?,updated_at=? WHERE sheet_no=?")
          .bind(recount?1:qty!==null?1:0,parent.locked?0:1,now,sheet),
        db.prepare("INSERT INTO stocktake_line_history(sheet_no,line_key,field,before_value,after_value,actor_member_id,changed_at) VALUES(?,?,'location_cell_added',NULL,?,?,?)")
          .bind(sheet,parent.line_key,JSON.stringify({warehouse,location,batch,qty}),member,now),
        participant(db,sheet,member,now)
      ]);
      return success(await detail(db,sheet),requestId);
    }
    const base=bases[0],id="N"+crypto.randomUUID().replaceAll("-","").slice(0,12);
    await db.batch([
      guard(db,"EXISTS(SELECT 1 FROM stocktake_sheets WHERE sheet_no=? AND status=?)",sheet,sh.status),
      db.prepare(`INSERT INTO stocktake_lines(sheet_no,line_key,seq,item_code,item_name,spec,warehouse_name,location,unit,batch,book_qty,is_added,rev)
         VALUES(?,?,NULL,?,?,?,?,?, ?,?,'0',1,(SELECT version+1 FROM stocktake_sheets WHERE sheet_no=?))`)
        .bind(sheet,id,code,base.item_name,base.spec,warehouse,location,base.unit,batch,sheet),
      db.prepare(`INSERT INTO stocktake_location_counts(sheet_no,source_line_key,warehouse_name,location_code,erp_location_code,${phase},${by},${at},rev)
        VALUES(?,?,?,?,'',?,?,?,(SELECT version+1 FROM stocktake_sheets WHERE sheet_no=?))`)
        .bind(sheet,id,warehouse,location,qty,qty===null?null:member,qty===null?null:now,sheet),
      ...(recount?[db.prepare("UPDATE stocktake_location_counts SET first_qty='0' WHERE sheet_no=? AND source_line_key=?").bind(sheet,id)]:[]),
      db.prepare("UPDATE stocktake_sheets SET version=version+1,total_lines=total_lines+1,counted_lines=counted_lines+?,recount_needed=recount_needed+1,updated_at=? WHERE sheet_no=?")
        .bind(recount?1:qty!==null?1:0,now,sheet),
      db.prepare("INSERT INTO stocktake_line_history(sheet_no,line_key,field,before_value,after_value,actor_member_id,changed_at) VALUES(?,?,'added',NULL,?,?,?)")
        .bind(sheet,id,JSON.stringify({itemCode:code,batch,warehouse,location,qty}),member,now),
      participant(db,sheet,member,now)
    ]);
    const result=await detail(db,sheet);
    return success({...result,line:result.lines.find(l=>l.lineKey===id)},requestId);
  }
  if(action==="batches"&&method==="DELETE"){
    const v=await json(request),key=text(v.lineKey,"列鍵",40),expected=version(v.expectedVersion);
    const line=await one<Line>(db,"SELECT * FROM stocktake_lines WHERE sheet_no=? AND line_key=?",sheet,key);
    if(!line||!line.is_added)throw new Invalid("STOCKTAKE_INVALID","只能刪除尚未寫回的新增批號列");
    if(sh.status!=="COUNTING"&&sh.status!=="RECOUNTING")fail("STOCKTAKE_STATUS","目前不能刪新增列",409);
    if(line.version!==expected)fail("STOCKTAKE_VERSION_CONFLICT","新增列已被其他人修改",409);
    const expectedSheet=version(v.expectedSheetVersion);
    if(sh.version!==expectedSheet)fail("STOCKTAKE_VERSION_CONFLICT","盤點單已有新的數量或儲位異動，請重整後再刪除",409);
    const cells=await all<LocationCell>(db,"SELECT * FROM stocktake_location_counts WHERE sheet_no=? AND source_line_key=?",sheet,key);
    if(cells.some(c=>c.first_qty!==null||c.recount_qty!==null)&&v.confirmNonEmpty!==true)
      fail("STOCKTAKE_CONFIRM_REQUIRED","已填數量的新增批號列，請確認刪除",409);
    await db.batch([
      guard(db,"EXISTS(SELECT 1 FROM stocktake_sheets WHERE sheet_no=? AND version=? AND status=?)",sheet,expectedSheet,sh.status),
      guard(db,"EXISTS(SELECT 1 FROM stocktake_lines WHERE sheet_no=? AND line_key=? AND version=? AND is_added=1)",sheet,key,expected),
      db.prepare("DELETE FROM stocktake_lines WHERE sheet_no=? AND line_key=?").bind(sheet,key),
      db.prepare("UPDATE stocktake_sheets SET version=version+1,total_lines=total_lines-?,counted_lines=counted_lines-?,recount_needed=recount_needed-?,updated_at=? WHERE sheet_no=?")
        .bind(cells.length,cells.filter(c=>c.first_qty!==null).length,line.locked?0:cells.length,now,sheet),
      db.prepare("INSERT INTO stocktake_line_history(sheet_no,line_key,field,before_value,after_value,actor_member_id,changed_at,removed_rev) VALUES(?,?,'deleted',?,?,?,?,?)")
        .bind(sheet,key,JSON.stringify({batch:line.batch,locations:cells.map(c=>({location:c.location_code,first:c.first_qty,recount:c.recount_qty}))}),null,member,now,sh.version+1)
    ]);
    return success({sheet:sheetJson((await one<Sheet>(db,"SELECT * FROM stocktake_sheets WHERE sheet_no=?",sheet))!,[]),removedKey:key},requestId);
  }
  if(action==="locations"&&method==="PATCH"){
    const v=await json(request),itemCode=text(v.itemCode,"品號",40),warehouse=typeof v.warehouseName==="string"?v.warehouseName:"",
      from=typeof v.fromLocation==="string"?v.fromLocation:"",
      to=typeof v.toLocation==="string"?v.toLocation:"",expected=version(v.expectedVersion);
    if(!/^[0-9]{4}$/.test(to)||!(/^[0-9]{4}$/.test(from)||from===""))
      fail("STOCKTAKE_LOCATION_INVALID","儲位必須是四碼");
    if(from===to)fail("STOCKTAKE_INVALID","新儲位必須不同於原儲位");
    if(sh.status!=="COUNTING"&&sh.status!=="RECOUNTING")fail("STOCKTAKE_STATUS","目前狀態不可修改儲位",409);
    if(sh.version!==expected)fail("STOCKTAKE_VERSION_CONFLICT","盤點單已更新，請重新整理後再試",409);
    const target=await all<LocationCell & {locked:number}>(db,`SELECT c.*,l.locked FROM stocktake_location_counts c
      JOIN stocktake_lines l ON l.sheet_no=c.sheet_no AND l.line_key=c.source_line_key
      WHERE c.sheet_no=? AND l.item_code=? AND c.warehouse_name=? AND c.location_code=? LIMIT 3001`,sheet,itemCode,warehouse,from);
    if(!target.length||target.length>3000)fail("STOCKTAKE_NOT_FOUND","所選儲位不存在",404);
    if(target.some(c=>c.locked))fail("STOCKTAKE_STATUS","已核對鎖定的品號不能修改儲位",409);
    const conflicts=await all<{source_line_key:string}>(db,`SELECT c.source_line_key FROM stocktake_location_counts c
      JOIN stocktake_lines l ON l.sheet_no=c.sheet_no AND l.line_key=c.source_line_key
      WHERE c.sheet_no=? AND l.item_code=? AND c.warehouse_name=? AND c.location_code=? LIMIT 3001`,sheet,itemCode,warehouse,to);
    if(conflicts.length)fail("STOCKTAKE_DUPLICATE","這個品號已使用目標儲位；不可自動合併批號數量",409);
    const stm:D1PreparedStatement[]=[
      guard(db,"EXISTS(SELECT 1 FROM stocktake_sheets WHERE sheet_no=? AND version=? AND status=?)",sheet,expected,sh.status)
    ];
    for(const cell of target){
      stm.push(guard(db,"EXISTS(SELECT 1 FROM stocktake_location_counts WHERE sheet_no=? AND id=? AND version=?)",sheet,cell.id,cell.version),
        db.prepare("UPDATE stocktake_location_counts SET location_code=?,manual_verified_at=NULL,manual_verified_by=NULL,version=version+1,rev=? WHERE sheet_no=? AND id=?")
          .bind(to,sh.version+1,sheet,cell.id),
        db.prepare("INSERT INTO stocktake_line_history(sheet_no,line_key,location_count_id,field,before_value,after_value,actor_member_id,changed_at) VALUES(?,?,?,'location_code',?,?,?,?)")
          .bind(sheet,cell.source_line_key,cell.id,from,to,member,now));
    }
    stm.push(db.prepare("UPDATE stocktake_sheets SET version=version+1,updated_at=? WHERE sheet_no=?").bind(now,sheet),
      audit(db,sheet,"location_changed",member,requestId,{itemCode,warehouse,from,to,affected:target.length}));
    await db.batch(stm);
    return success(await detail(db,sheet),requestId);
  }
  if(action==="manual-locations"&&method==="GET"){
    requireAdmin(role);
    return success(await all(db,`SELECT c.id AS locationCountId,c.source_line_key AS lineKey,
      l.item_code AS itemCode,l.batch,l.is_added AS isAdded,c.warehouse_name AS warehouseName,
      c.erp_location_code AS erpLocationCode,c.location_code AS locationCode,
      c.manual_verified_at AS verifiedAt,c.manual_verified_by AS verifiedBy
      FROM stocktake_location_counts c JOIN stocktake_lines l
        ON l.sheet_no=c.sheet_no AND l.line_key=c.source_line_key
      WHERE c.sheet_no=? AND (c.erp_location_code<>c.location_code OR (l.is_added=1 AND c.location_code<>''))
      ORDER BY l.item_code,c.location_code,l.batch LIMIT 3001`,sheet),requestId);
  }
  if(action==="manual-locations"&&method==="PATCH"){
    requireAdmin(role);
    const v=await json(request),id=v.locationCountId;
    if(!Number.isSafeInteger(id)||Number(id)<1)fail("STOCKTAKE_INVALID","儲位明細 ID 不正確");
    const expected=version(v.expectedVersion);
    const cell=await one<LocationCell>(db,"SELECT * FROM stocktake_location_counts WHERE sheet_no=? AND id=?",sheet,id);
    if(!cell)throw new Invalid("STOCKTAKE_NOT_FOUND","儲位格不存在",404);
    if(cell.version!==expected)fail("STOCKTAKE_VERSION_CONFLICT","儲位已被修改，請重新載入",409);
    const parent=await one<Line>(db,"SELECT * FROM stocktake_lines WHERE sheet_no=? AND line_key=?",sheet,cell.source_line_key);
    if(!parent)throw new Invalid("STOCKTAKE_NOT_FOUND","ERP 原始盤點列不存在",404);
    if(!(cell.erp_location_code!==cell.location_code||(parent.is_added&&cell.location_code!=="")))
      fail("STOCKTAKE_INVALID","此列不需要人工 ERP 儲位核對");
    const checked=v.verified===true;
    if(checked&&parent.is_added&&!parent.erp_seq)
      fail("STOCKTAKE_STATUS","新增批號尚未取得 ERP 序號，不能標記 ERP 已人工修改",409);
    await db.batch([
      guard(db,"EXISTS(SELECT 1 FROM stocktake_location_counts WHERE sheet_no=? AND id=? AND version=?)",sheet,id,expected),
      db.prepare("UPDATE stocktake_location_counts SET manual_verified_at=?,manual_verified_by=?,version=version+1,rev=? WHERE sheet_no=? AND id=?")
        .bind(checked?now:null,checked?member:null,sh.version+1,sheet,id),
      db.prepare("UPDATE stocktake_sheets SET version=version+1,updated_at=? WHERE sheet_no=?").bind(now,sheet),
      audit(db,sheet,checked?"manual_location_verified":"manual_location_reopened",member,requestId,{locationCountId:id,sourceLineKey:cell.source_line_key,erpLocation:cell.erp_location_code,webLocation:cell.location_code})
    ]);
    return success(await detail(db,sheet),requestId);
  }
  if(action==="first-confirm"&&method==="POST"){
    requireAdmin(role);if(sh.status!=="COUNTING")fail("STOCKTAKE_STATUS","目前不能初盤確認",409);
    const v=await json(request),expected=version(v.expectedVersion);
    if(sh.version!==expected)fail("STOCKTAKE_VERSION_CONFLICT","盤點單已被其他人修改，請重新載入",409);
    const lines=await all<Line>(db,"SELECT * FROM stocktake_lines WHERE sheet_no=? ORDER BY item_code,batch LIMIT 3001",sheet);
    const cells=await all<LocationCell>(db,"SELECT * FROM stocktake_location_counts WHERE sheet_no=? LIMIT 3001",sheet);
    if(lines.length>3000||cells.length>3000)fail("STOCKTAKE_LIMIT","盤點超出上限",409);
    const resolved=stocktakeAggregateLines(lines.map(l=>toLine(l,"RECOUNTING")),cells.map(toCell));
    if(!resolved.length||!cells.length||resolved.some(l=>l.firstQty===null))
      fail("STOCKTAKE_INCOMPLETE","還有 "+resolved.filter(l=>l.firstQty===null).length+" 個原始列尚未完成所有儲位",409);
    const totals=stocktakeItemTotals(resolved);
    const lockedKeys=new Set(lines.filter(l=>totals.get(l.item_code)!.book===totals.get(l.item_code)!.counted).map(l=>l.line_key));
    const stm:D1PreparedStatement[]=[guard(db,"EXISTS(SELECT 1 FROM stocktake_sheets WHERE sheet_no=? AND version=? AND status='COUNTING')",sheet,expected)];
    for(const l of lines)stm.push(db.prepare("UPDATE stocktake_lines SET locked=?,rev=(SELECT version+1 FROM stocktake_sheets WHERE sheet_no=?) WHERE sheet_no=? AND line_key=?")
      .bind(lockedKeys.has(l.line_key)?1:0,sheet,sheet,l.line_key));
    const needed=cells.filter(cell=>!lockedKeys.has(cell.source_line_key)).length;
    stm.push(db.prepare("UPDATE stocktake_sheets SET status='RECOUNTING',recount_needed=?,first_confirmed_by=?,first_confirmed_at=?,version=version+1,updated_at=? WHERE sheet_no=?")
      .bind(needed,member,now,now,sheet),
      audit(db,sheet,"first_confirmed",member,requestId,{sourceLines:lines.length,locationCells:cells.length,lockedSourceLines:lockedKeys.size}));
    await db.batch(stm);return success(await detail(db,sheet),requestId);
  }
  if((action==="second-confirm"||action==="retry-write")&&method==="POST"){
    requireAdmin(role);
    const second=action==="second-confirm",needed=second?"RECOUNTING":"WRITE_FAILED";
    if(sh.status!==needed)fail("STOCKTAKE_STATUS","盤點單尚未進入可寫回狀態",409);
    const v=await json(request),expected=version(v.expectedVersion);
    if(expected!==sh.version)fail("STOCKTAKE_VERSION_CONFLICT","盤點單已被他人更新",409);
    const lines=await all<Line>(db,"SELECT * FROM stocktake_lines WHERE sheet_no=? ORDER BY line_key LIMIT 3001",sheet);
    const cells=await all<LocationCell>(db,"SELECT * FROM stocktake_location_counts WHERE sheet_no=? LIMIT 3001",sheet);
    if(lines.length>3000||cells.length>3000)fail("STOCKTAKE_LIMIT","盤點超過 3000 格",409);
    const parentKeys=new Set(lines.map(l=>l.line_key));
    if(cells.some(cell=>!parentKeys.has(cell.source_line_key)))fail("STOCKTAKE_INVALID","儲位格遺失 ERP 原始列",409);
    const unresolved=cells.filter(cell=>!lines.find(l=>l.line_key===cell.source_line_key)?.locked&&cell.recount_qty===null);
    if(second&&unresolved.length)
      fail("STOCKTAKE_INCOMPLETE","還有 "+unresolved.length+" 個儲位批號尚未複盤",409);
    const resolved=stocktakeAggregateLines(lines.map(l=>toLine(l,"RECOUNTING")),cells.map(toCell));
    if(resolved.some(l=>l.firstQty===null||(!l.locked&&l.recountQty===null)))
      fail("STOCKTAKE_INCOMPLETE","仍有原始 ERP 列缺少完整數量",409);
    const rows=stocktakeWriteRows(resolved);
    const seqs=rows.map(row=>row.seq).filter((seq):seq is string=>seq!==null);
    if(new Set(seqs).size!==seqs.length)fail("STOCKTAKE_DUPLICATE","ERP 寫回序號不可重複",409);
    if(rows.length>3000)fail("STOCKTAKE_LIMIT","寫回列數超過 3000",409);
    await verifyJobQuota(db,member);
    const id=crypto.randomUUID(),control=await one<{hold_until:string|null}>(db,"SELECT hold_until FROM erp_item_agent_control WHERE id=1");
    const notBefore=control?.hold_until&&Date.parse(control.hold_until)>Date.now()?control.hold_until:null;
    await db.batch([
      guard(db,"EXISTS(SELECT 1 FROM stocktake_sheets WHERE sheet_no=? AND version=? AND status=?)",sheet,expected,needed),
      ...stocktakeJobStatements(db,{id,member,now,notBefore,sheet,type:"STOCKTAKE_WRITE",payload:{sheetNo:sheet,rows},requestId}),
      db.prepare("UPDATE stocktake_sheets SET status='WRITING',write_query_id=?,write_result_json=NULL,version=version+1,updated_at=?,second_confirmed_by=CASE WHEN ? THEN ? ELSE second_confirmed_by END,second_confirmed_at=CASE WHEN ? THEN ? ELSE second_confirmed_at END WHERE sheet_no=?")
        .bind(id,now,second?1:0,member,second?1:0,now,sheet),
      audit(db,sheet,second?"second_confirmed":"write_requested",member,requestId,{jobId:id,rows:rows.length,retry:!second})
    ]);
    return success({id,queryType:"STOCKTAKE_WRITE",status:"QUEUED",rows:rows.length},requestId);
  }
  return failure({code:"NOT_FOUND",message:"盤點功能不支援這個方法"},requestId,404);
 }catch(e){
  if(e instanceof Invalid||e instanceof StocktakeInputError)
    return failure({code:e.code,message:e.message},requestId,e.status);
  if(String(e).includes("UNIQUE constraint"))return failure({code:"STOCKTAKE_DUPLICATE",message:"底稿或批號已存在"},requestId,409);
  if(String(e).includes("malformed JSON"))return failure({code:"STOCKTAKE_VERSION_CONFLICT",message:"盤點資料已被其他人更新，請重新載入"},requestId,409);
  return failure({code:"STOCKTAKE_UNAVAILABLE",message:"門市盤點操作無法完成，請更新畫面核對，不要重複送出"},requestId,500);
 }
}
