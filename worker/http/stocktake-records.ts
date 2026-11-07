import {AuditService} from "../audit/audit-service";
import {decimalStocktake,type StocktakeKnownSheet,type StocktakeRecord,type StocktakeRecordPage,
 type StocktakeRecordDifferencePage} from "../../shared/stocktake";
import {StocktakeInputError} from "./stocktake-erp";

// Quantities have at most four decimals. All arithmetic stays in SQLite integers,
// and persisted totals are TEXT so D1 JSON never rounds values above 2^53.
const units=(column:string)=>`(CAST(${column} AS INTEGER)*10000 +
 CASE WHEN substr(${column},1,1)='-' THEN -1 ELSE 1 END *
 CAST(substr((CASE WHEN instr(${column},'.')>0 THEN substr(${column},instr(${column},'.')+1) ELSE '' END)||'0000',1,4) AS INTEGER))`;
const person="COALESCE(NULLIF(m.display_name,''),m.employee_no,CAST(m.id AS TEXT))";

/** Called only after a successful, explicitly complete full-list sync, in its completion batch. */
export function stocktakeArchiveStatements(db:D1Database,known:readonly StocktakeKnownSheet[],present:readonly string[],jobId:string,now:string):D1PreparedStatement[]{
 if(!known.length)return [];
 const join="FROM stocktake_records r JOIN stocktake_sheets s ON s.sheet_no=r.sheet_no AND s.created_at=r.source_created_at";
 const selected="r.sync_job_id=?1 AND r.archived_at=?2";
 return [
  db.prepare(`INSERT INTO stocktake_records(sheet_no,sheet_date,source_created_at,source_status,sync_job_id,archived_at,
    first_confirmed_by,first_confirmed_name,first_confirmed_at,second_confirmed_by,second_confirmed_name,second_confirmed_at,erp_confirmed_at)
   SELECT s.sheet_no,s.sheet_date,s.created_at,s.status,?1,?2,s.first_confirmed_by,
    COALESCE(a.display_name,a.employee_no),s.first_confirmed_at,s.second_confirmed_by,
    COALESCE(b.display_name,b.employee_no),s.second_confirmed_at,s.erp_confirmed_at
   FROM stocktake_sheets s LEFT JOIN app_members a ON a.id=s.first_confirmed_by LEFT JOIN app_members b ON b.id=s.second_confirmed_by
   WHERE EXISTS(SELECT 1 FROM json_each(?3) k WHERE json_extract(k.value,'$.sheetNo')=s.sheet_no AND json_extract(k.value,'$.createdAt')=s.created_at)
    AND NOT EXISTS(SELECT 1 FROM json_each(?4) p WHERE p.value=s.sheet_no)
    AND NOT EXISTS(SELECT 1 FROM erp_item_queries w WHERE w.query_type='STOCKTAKE_WRITE' AND w.target_code=s.sheet_no AND w.status IN ('QUEUED','RUNNING'))
    AND EXISTS(SELECT 1 FROM erp_item_queries j WHERE j.id=?1 AND j.completed_at=?2 AND j.status IN ('DONE','NOT_FOUND'))
   ON CONFLICT(sheet_no,source_created_at) DO NOTHING`).bind(jobId,now,JSON.stringify(known),JSON.stringify(present)),
  db.prepare(`INSERT OR IGNORE INTO stocktake_record_items(record_id,item_code,item_name)
   SELECT r.id,l.item_code,MIN(l.item_name) ${join} JOIN stocktake_lines l ON l.sheet_no=s.sheet_no
   WHERE ${selected} GROUP BY r.id,l.item_code`).bind(jobId,now),
  db.prepare(`INSERT OR IGNORE INTO stocktake_record_participants(record_id,member_id,display_name,first_at,last_at,first_count_at,recount_at)
   WITH people AS (
    SELECT sheet_no,member_id,first_at,last_at,NULL first_count_at,NULL recount_at FROM stocktake_participants
    UNION ALL SELECT sheet_no,first_by,first_at,first_at,first_at,NULL FROM stocktake_location_counts WHERE first_by IS NOT NULL
    UNION ALL SELECT sheet_no,recount_by,recount_at,recount_at,NULL,recount_at FROM stocktake_location_counts WHERE recount_by IS NOT NULL
   ) SELECT r.id,p.member_id,${person},MIN(p.first_at),MAX(p.last_at),MIN(p.first_count_at),MIN(p.recount_at)
   ${join} JOIN people p ON p.sheet_no=s.sheet_no JOIN app_members m ON m.id=p.member_id
   WHERE ${selected} GROUP BY r.id,p.member_id`).bind(jobId,now),
  db.prepare(`INSERT OR IGNORE INTO stocktake_record_differences(record_id,line_key,item_code,item_name,batch,
    book_units,first_units,recount_units,actual_units,difference_units,first_people_json,recount_people_json)
   WITH totals AS (
    SELECT r.id record_id,s.sheet_no,l.line_key,l.item_code,l.item_name,l.batch,${units("l.book_qty")} book,
     CASE WHEN COUNT(c.id)>0 AND COUNT(c.first_qty)=COUNT(c.id) THEN SUM(${units("c.first_qty")}) END first,
     CASE WHEN COUNT(c.id)>0 AND COUNT(c.recount_qty)=COUNT(c.id) THEN SUM(${units("c.recount_qty")}) END recount,
     s.first_confirmed_at IS NOT NULL AND l.locked=0 needs_recount
    ${join} JOIN stocktake_lines l ON l.sheet_no=s.sheet_no
    LEFT JOIN stocktake_location_counts c ON c.sheet_no=l.sheet_no AND c.source_line_key=l.line_key
    WHERE ${selected} GROUP BY r.id,l.line_key
   ), actual AS (SELECT *,CASE WHEN needs_recount THEN recount ELSE first END counted FROM totals)
   SELECT record_id,line_key,item_code,item_name,batch,CAST(book AS TEXT),CAST(first AS TEXT),CAST(recount AS TEXT),
    CAST(counted AS TEXT),CAST(counted-book AS TEXT),
    (SELECT json_group_array(DISTINCT ${person}) FROM stocktake_location_counts c JOIN app_members m ON m.id=c.first_by WHERE c.sheet_no=actual.sheet_no AND c.source_line_key=actual.line_key),
    (SELECT json_group_array(DISTINCT ${person}) FROM stocktake_location_counts c JOIN app_members m ON m.id=c.recount_by WHERE c.sheet_no=actual.sheet_no AND c.source_line_key=actual.line_key)
   FROM actual WHERE counted IS NULL OR counted<>book`).bind(jobId,now),
  // Children cascade away only after all durable snapshots above succeeded.
  db.prepare(`DELETE FROM stocktake_sheets WHERE EXISTS(SELECT 1 FROM stocktake_records r
   WHERE r.sheet_no=stocktake_sheets.sheet_no AND r.source_created_at=stocktake_sheets.created_at
    AND r.sync_job_id=? AND r.archived_at=?)`).bind(jobId,now),
  new AuditService(db).prepareRecord({entityType:"stocktake_sync",entityKey:jobId,action:"stocktake.records_archived",
   actorEmployeeId:null,metadata:{reason:"ERP_CLEARED"}},
   {sql:"changes()>0"}),
 ];
}

type RecordRow={id:number;sheet_no:string;sheet_date:string|null;source_status:StocktakeRecord["sourceStatus"];
 archived_at:string;first_confirmed_name:string|null;first_confirmed_at:string|null;second_confirmed_name:string|null;
 second_confirmed_at:string|null;erp_confirmed_at:string|null};
const all=async<T>(db:D1Database,sql:string,...values:unknown[])=>((await db.prepare(sql).bind(...values).all<T>()).results??[]);
export async function stocktakeRecords(db:D1Database,before:string|null):Promise<StocktakeRecordPage>{
 let date="",id=0;
 if(before){
  const parts=before.split("|");date=parts[0];id=Number(parts[1]);
  if(parts.length!==2||!/^([0-9]{4}-[0-9]{2}-[0-9]{2})?$/.test(date)||!/^[1-9][0-9]*$/.test(parts[1]??"")||!Number.isSafeInteger(id)||id<1)
   throw new StocktakeInputError("STOCKTAKE_INVALID","盤點紀錄頁面位置不正確",422);
 }
 const found=await all<RecordRow>(db,`SELECT id,sheet_no,sheet_date,source_status,archived_at,first_confirmed_name,first_confirmed_at,
  second_confirmed_name,second_confirmed_at,erp_confirmed_at FROM stocktake_records
  WHERE (?=0 OR (COALESCE(sheet_date,''),id)<(?,?)) ORDER BY COALESCE(sheet_date,'') DESC,id DESC LIMIT 11`,id,date,id);
 const rows=found.slice(0,10);
 if(!rows.length)return {records:[],nextBefore:null};
 const marks=rows.map(()=>"?").join(","),ids=rows.map(r=>r.id);
 const items=await all<{record_id:number;item_code:string;item_name:string}>(db,
  `SELECT record_id,item_code,item_name FROM stocktake_record_items WHERE record_id IN (${marks}) ORDER BY record_id,item_code`,...ids);
 const people=await all<{record_id:number;member_id:number;display_name:string;first_at:string|null;last_at:string|null;first_count_at:string|null;recount_at:string|null}>(db,
  `SELECT * FROM stocktake_record_participants WHERE record_id IN (${marks}) ORDER BY record_id,member_id`,...ids);
 return {records:rows.map(r=>({id:r.id,sheetNo:r.sheet_no,sheetDate:r.sheet_date,sourceStatus:r.source_status,archivedAt:r.archived_at,
  firstConfirmedName:r.first_confirmed_name,firstConfirmedAt:r.first_confirmed_at,secondConfirmedName:r.second_confirmed_name,
  secondConfirmedAt:r.second_confirmed_at,erpConfirmedAt:r.erp_confirmed_at,
  items:items.filter(i=>i.record_id===r.id).map(i=>({itemCode:i.item_code,itemName:i.item_name})),
  participants:people.filter(p=>p.record_id===r.id).map(p=>({memberId:p.member_id,name:p.display_name,firstAt:p.first_at,lastAt:p.last_at,firstCountAt:p.first_count_at,recountAt:p.recount_at}))})),
  nextBefore:found.length>10?(rows.at(-1)!.sheet_date??"")+"|"+rows.at(-1)!.id:null};
}
export async function stocktakeRecordDifferences(db:D1Database,id:number,before:string|null):Promise<StocktakeRecordDifferencePage>{
 if(!Number.isSafeInteger(id)||id<1||before!==null&&!/^[A-Za-z0-9_-]{1,40}$/.test(before))
  throw new StocktakeInputError("STOCKTAKE_INVALID","盤點紀錄位置不正確",422);
 if(!await db.prepare("SELECT 1 FROM stocktake_records WHERE id=?").bind(id).first())
  throw new StocktakeInputError("STOCKTAKE_NOT_FOUND","找不到盤點紀錄",404);
 type Difference={line_key:string;item_code:string;item_name:string;batch:string;book_units:string;first_units:string|null;recount_units:string|null;
  actual_units:string|null;difference_units:string|null;first_people_json:string;recount_people_json:string};
 const rows=await all<Difference>(db,"SELECT * FROM stocktake_record_differences WHERE record_id=? AND (?='' OR line_key>?) ORDER BY line_key LIMIT 101",id,before??"",before??"");
 const qty=(v:string|null)=>v===null?null:decimalStocktake(BigInt(v));
 return {rows:rows.slice(0,100).map(r=>({lineKey:r.line_key,itemCode:r.item_code,itemName:r.item_name,batch:r.batch,
  bookQty:qty(r.book_units)!,firstQty:qty(r.first_units),recountQty:qty(r.recount_units),actualQty:qty(r.actual_units),difference:qty(r.difference_units),
  firstPeople:JSON.parse(r.first_people_json) as string[],recountPeople:JSON.parse(r.recount_people_json) as string[]})),
  nextBefore:rows.length>100?rows[99].line_key:null};
}
