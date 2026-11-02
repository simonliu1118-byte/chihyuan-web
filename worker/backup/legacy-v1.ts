// formatVersion 1 backups (before V0.9.80) carry only a SHA-256 of the sqlite_master DDL, so the schema
// they were taken from is known only by matching that hash. This module is FROZEN: it recognises every
// v1 schema that was ever deployed and brings its data to the 0045 layout (V1_COLUMNS). From there the
// formatVersion 2 restore (by migration name and column name) takes over. New migrations never touch it.
import {STORE_LEGACY_SCHEMAS,STORE_WORKFLOW_SCHEMAS,STORE_LEGACY_COLUMNS} from "./store-workflow-upgrade";
import {STORE_MONTHLY_SCHEMAS,STORE_PROGRESS_SCHEMAS,STORE_PRE_PROGRESS_COLUMNS,STORE_SEQUENCE_SCHEMAS,STORE_PRE_SEQUENCE_COLUMNS,STORE_UNORDERABLE_SCHEMAS,STORE_BLACKLIST_SCHEMAS,STORE_ORDER_WORKFLOW_SCHEMAS,STORE_BLACKLIST_LIFECYCLE_SCHEMAS,STORE_NO_HOLD_SCHEMAS,STORE_CONTACT_INDEX_SCHEMAS,STORE_REPAIR_SCHEMAS,STORE_REPAIR_PHOTO_SCHEMAS,STORE_ORDERING_ITEM_INDEX_SCHEMAS} from "./store-progress-upgrade";
import {V1_COLUMNS} from "./v1-columns-0045";

type Cell=string|number|null;
interface TableData{columns:string[];rows:Cell[][]}
interface Data{tables:Record<string,TableData>}

/** The migration a v1 backup reaches once upgraded here. */
export const V1_LEVEL="0045_ordering_draft_item_index";
export const V1_TABLES=Object.keys(V1_COLUMNS).sort();
const MONTHLY_TABLES=["store_monthly_settings","store_monthly_rows","store_monthly_cells","store_monthly_events"];
const REPAIR_TABLES=["store_repairs","store_repair_events"];

const ALL_V1_SCHEMAS=[...STORE_LEGACY_SCHEMAS,...STORE_WORKFLOW_SCHEMAS,...STORE_MONTHLY_SCHEMAS,...STORE_PROGRESS_SCHEMAS,...STORE_SEQUENCE_SCHEMAS,...STORE_UNORDERABLE_SCHEMAS,...STORE_BLACKLIST_SCHEMAS,...STORE_ORDER_WORKFLOW_SCHEMAS,...STORE_BLACKLIST_LIFECYCLE_SCHEMAS,...STORE_NO_HOLD_SCHEMAS,...STORE_CONTACT_INDEX_SCHEMAS,...STORE_REPAIR_SCHEMAS,...STORE_REPAIR_PHOTO_SCHEMAS,...STORE_ORDERING_ITEM_INDEX_SCHEMAS];
/** Every v1 schema fingerprint ever deployed; an unknown one is refused. */
export const knownV1Schema=(hash:string)=>ALL_V1_SCHEMAS.includes(hash);
const prePhotos=(hash:string)=>STORE_REPAIR_SCHEMAS.includes(hash)||preRepairs(hash);
const preRepairs=(hash:string)=>[...STORE_LEGACY_SCHEMAS,...STORE_WORKFLOW_SCHEMAS,...STORE_MONTHLY_SCHEMAS,...STORE_PROGRESS_SCHEMAS,...STORE_SEQUENCE_SCHEMAS,...STORE_UNORDERABLE_SCHEMAS,...STORE_BLACKLIST_SCHEMAS,...STORE_ORDER_WORKFLOW_SCHEMAS,...STORE_BLACKLIST_LIFECYCLE_SCHEMAS,...STORE_NO_HOLD_SCHEMAS,...STORE_CONTACT_INDEX_SCHEMAS].includes(hash);
const preMonthly=(hash:string)=>STORE_LEGACY_SCHEMAS.includes(hash)||STORE_WORKFLOW_SCHEMAS.includes(hash);
const preProgress=(hash:string)=>preMonthly(hash)||STORE_MONTHLY_SCHEMAS.includes(hash);
const preSequence=(hash:string)=>preProgress(hash)||STORE_PROGRESS_SCHEMAS.includes(hash);
const preBlacklist=(hash:string)=>preSequence(hash)||STORE_SEQUENCE_SCHEMAS.includes(hash)||STORE_UNORDERABLE_SCHEMAS.includes(hash);
const preOrderWorkflow=(hash:string)=>preBlacklist(hash)||STORE_BLACKLIST_SCHEMAS.includes(hash);
const preLifecycle=(hash:string)=>preOrderWorkflow(hash)||STORE_ORDER_WORKFLOW_SCHEMAS.includes(hash);
const WORKFLOW_DEFAULTS:Record<string,Record<string,Cell>>={store_customer_orders:{customer_code:"",closed_at:null,notification_attempts:0,last_unreached_date:null},store_customer_order_lines:{price_pending:0,metadata_mode:"",publisher:"",author:"",specification:""}};
const priorWorkflowColumns=(table:string,hash:string)=>V1_COLUMNS[table].filter(k=>!(table==="store_blacklist"&&preLifecycle(hash)&&k==="activation_at")&&!(preOrderWorkflow(hash)&&k in (WORKFLOW_DEFAULTS[table]??{}))&&!(table==="store_blacklist"&&preBlacklist(hash)&&(k==="joined_date"||k==="action_detail")));

/** The tables a v1 backup with this fingerprint holds. */
export function v1Tables(hash:string):string[]{
  return V1_TABLES.filter(t=>!(prePhotos(hash)&&t==="store_repair_photos")&&!(preRepairs(hash)&&REPAIR_TABLES.includes(t))&&!(preLifecycle(hash)&&t==="store_blacklist_operations")&&!(preMonthly(hash)&&MONTHLY_TABLES.includes(t))&&!(STORE_LEGACY_SCHEMAS.includes(hash)&&(t==="store_order_events"||t==="store_blacklist_events")));
}
/** The exact columns a v1 backup with this fingerprint holds for a table. */
export function v1Columns(table:string,hash:string):string[]{
  const old=STORE_LEGACY_SCHEMAS.includes(hash)?STORE_LEGACY_COLUMNS[table]:preProgress(hash)?STORE_PRE_PROGRESS_COLUMNS[table]:preSequence(hash)?STORE_PRE_SEQUENCE_COLUMNS[table]:undefined;
  return old??priorWorkflowColumns(table,hash);
}

/** Brings a verified v1 backup to the 0045 layout (every V1 table, V1 columns), as the migrations did. */
export function upgradeV1(hash:string,data:Data):Data{
  if(preOrderWorkflow(hash)){
    for(const table of ["store_customer_orders","store_customer_order_lines","store_blacklist"]){const old=data.tables[table],defaults=WORKFLOW_DEFAULTS[table]??{},columns=[...new Set([...old.columns,...Object.keys(defaults),...(table!=="store_customer_order_lines"?["mobile"]:[])])].sort();
      data.tables[table]={columns,rows:old.rows.map(row=>{const v:Record<string,Cell>={...defaults,...Object.fromEntries(old.columns.map((k,i)=>[k,row[i]]))};if(table!=="store_customer_order_lines"){const phone=String(v.phone??""),mobile=String(v.mobile??""),swap=/^09\d{8}$/.test(phone)&&!/^09\d{8}$/.test(mobile);v.mobile=!mobile?phone:swap?phone:mobile;v.phone=!mobile?"":swap?mobile:phone}return columns.map(k=>v[k])})};
    }
  }
  if(preBlacklist(hash)){
    const old=data.tables.store_blacklist,columns=[...old.columns,"joined_date","action_detail"].sort();
    data.tables.store_blacklist={columns,rows:old.rows.map(row=>{const v:Record<string,Cell>=Object.fromEntries(old.columns.map((k,i)=>[k,row[i]]));const time=new Date(String(v.created_at)).getTime();v.joined_date=Number.isFinite(time)?new Date(time+8*3600000).toISOString().slice(0,10):"";v.action_detail="";v.reason=String(v.reason).replaceAll(",","，");return columns.map(k=>v[k])})};
  }
  if(STORE_LEGACY_SCHEMAS.includes(hash)){
    for(const table of ["store_customer_orders","store_blacklist"]){
      const old=data.tables[table];
      const migrated=old.rows.map(row=>{
        const value=Object.fromEntries(old.columns.map((k,i)=>[k,row[i]]));
        const defaults:Record<string,Cell>=table==="store_customer_orders"?{mobile:"",ordered_date:null,picked_up_date:null,notified_date:value.notified_at?new Date(new Date(String(value.notified_at)).getTime()+8*3600000).toISOString().slice(0,10):null,has_ever_ordered:value.status==="CANCELLED"?0:1,cancel_kind:"",legacy:1,honorific:"",call_result:value.status==="CANCELLED"?"":"ORDERED"}:{mobile:"",line_name:"",version:1,active:1,honorific:""};
        if(value.status==="ARRIVED")value.status="ORDERED";
        if(table==="store_customer_orders"&&["NOTIFIED","PICKED_UP"].includes(String(value.status))&&!value.notified_at)value.notified_at=value.updated_at;
        return V1_COLUMNS[table].map(k=>k in value?value[k]:defaults[k]);
      });data.tables[table]={columns:V1_COLUMNS[table],rows:migrated};
    }
    for(const t of ["store_order_events","store_blacklist_events"])data.tables[t]={columns:V1_COLUMNS[t],rows:[]};
  }
  else if(preProgress(hash)){
    for(const table of ["store_customer_orders","store_blacklist"]){
      const old=data.tables[table];data.tables[table]={columns:V1_COLUMNS[table],rows:old.rows.map(row=>{
        const value:Record<string,Cell>=Object.fromEntries(old.columns.map((k,i)=>[k,row[i]]));value.honorific="";
        if(table==="store_customer_orders"){
          if(value.status==="ARRIVED")value.status="ORDERED";
          value.call_result=value.has_ever_ordered===1||["ORDERED","NOTIFIED","PICKED_UP"].includes(String(value.status))?"ORDERED":"";
          if(["NOTIFIED","PICKED_UP"].includes(String(value.status))&&!value.notified_at)value.notified_at=value.updated_at;
        }
        return V1_COLUMNS[table].map(k=>value[k]);
      })};
    }
  }
  if(preSequence(hash)){
    const table=data.tables.store_customer_orders;
    const values=table.rows.map(row=>Object.fromEntries(table.columns.map((key,i)=>[key,row[i]])));
    const time=(v:Cell)=>{const n=Date.parse(String(v));return Number.isFinite(n)?n:-Infinity};
    const sorted=[...values].sort((a,b)=>String(a.order_date).localeCompare(String(b.order_date))||(time(a.created_at)!==time(b.created_at)?time(a.created_at)<time(b.created_at)?-1:1:0)||Number(a.id)-Number(b.id));
    const positions=new Map(sorted.map((row,i)=>[row.id,i+1]));
    data.tables.store_customer_orders={columns:V1_COLUMNS.store_customer_orders,rows:values.map(row=>V1_COLUMNS.store_customer_orders.map(k=>k==="list_sequence"?positions.get(row.id)!:row[k]))};
  }
  if(preLifecycle(hash)){
    const old=data.tables.store_blacklist;data.tables.store_blacklist={columns:V1_COLUMNS.store_blacklist,rows:old.rows.map(row=>{const v=Object.fromEntries(old.columns.map((k,i)=>[k,row[i]]));return V1_COLUMNS.store_blacklist.map(k=>k==="activation_at"?v.created_at:v[k])})};
    const events=data.tables.store_blacklist_events;data.tables.store_blacklist_operations={columns:V1_COLUMNS.store_blacklist_operations,rows:events.rows.map(row=>{const e=Object.fromEntries(events.columns.map((k,i)=>[k,row[i]])),v:Record<string,Cell>={id:e.id,blacklist_id:e.blacklist_id,source_order_id:e.order_id,actor:e.actor,at:e.at,kind:"訂購取消",before_json:"{}",after_json:e.summary_json,reason:e.reason,legacy_event_id:e.id};return V1_COLUMNS.store_blacklist_operations.map(k=>v[k])})};
  }
  // Tables the old schema did not have start empty (store events, monthly, repairs, photos).
  for(const t of V1_TABLES)data.tables[t]??={columns:V1_COLUMNS[t],rows:[]};
  data.tables=Object.fromEntries(V1_TABLES.map(t=>[t,data.tables[t]]));
  for(const t of V1_TABLES)if(JSON.stringify(data.tables[t].columns)!==JSON.stringify(V1_COLUMNS[t]))throw new Error("BACKUP_COLUMNS_MISMATCH");
  return data;
}
