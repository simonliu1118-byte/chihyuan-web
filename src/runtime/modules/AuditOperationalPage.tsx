import { DateInput } from "../../ui/forms/DateInput";
import { Loading } from "../../ui/feedback/Loading";
import { SegmentedControl } from "../../ui/primitives/SegmentedControl";
import { useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { formatDate, formatDateTime, formatPerson } from "../../ui/foundation/format";
import { taipeiToday } from "../../../shared/erp-query-history";
import { Fragment, useEffect, useState } from "react";
import { loadAudit, loadSettings, type AuditEvent, type AuditActor } from "../api/settings-audit-client";
import { ExpandToggle } from "../../ui/data/ExpandToggle";
import { actionLabel, auditChanges, auditSentence, entityLabel, recordName, type FieldLookup } from "./change-log-labels";

const moduleOptions: readonly { value:string; label:string }[] = [
  {value:"",label:"全部模組"},
  {value:"customer,customer_visit,customer_item_quote,customer_frequent_item",label:"客戶"},
  {value:"item",label:"商品"},{value:"defect",label:"瑕疵"},
  {value:"sales_work_order",label:"銷售工單"},
  {value:"outsourcing_order,contractor,contractor_price,bom_recipe",label:"委外/代工"},
  {value:"work_log",label:"工作日誌"},
  {value:"customer_category,customer_status,department,item_category,work_log_category,work_log_platform,work_log_scoring_row,work_log_scoring_config,setting",label:"設定"},
  {value:"module_access,module_access_group,app_tag",label:"使用權"},
  {value:"backup",label:"備份"},{value:"erp_item_query,erp_item_agent",label:"ERP 查詢（含查詢紀錄）"},
];
const ERP_MODULES = "erp_item_query,erp_item_agent";
type Period = "today" | "7" | "30" | "custom";
type Filters = {entityTypes:string;period:Period;from:string;to:string;actorEmployeeId:string;q:string;includeErpQueries:boolean};
const initialFilters:Filters = {entityTypes:"",period:"today",from:"",to:"",actorEmployeeId:"",q:"",includeErpQueries:false};
function isoWindow(filters:Filters):{occurredFrom:string;occurredTo:string} {
  const today = taipeiToday();
  const day = new Date(today+"T00:00:00+08:00");
  const first = filters.period === "today" ? 0 : filters.period === "30" ? 29 : 6;
  const from = new Date(day.getTime()-first*86400000).toISOString();
  const tomorrow = new Date(day.getTime()+86400000).toISOString();
  if(filters.period!=="custom")return {occurredFrom:from,occurredTo:tomorrow};
  const dateStart = filters.from ? new Date(filters.from+"T00:00:00+08:00").toISOString() : "";
  const dateEnd = filters.to ? new Date(new Date(filters.to+"T00:00:00+08:00").getTime()+86400000).toISOString() : "";
  return {occurredFrom:dateStart,occurredTo:dateEnd};
}
function lookupDictionary(value: Awaited<ReturnType<typeof loadSettings>>):FieldLookup {
  const result:FieldLookup = {};
  const sections:{key:string;rows:readonly {id:number;name:string}[]}[]=[
    {key:"customerCategories",rows:value.customerCategories},
    {key:"customerStatuses",rows:value.customerStatuses},
    {key:"departments",rows:value.departments},
    {key:"itemCategories",rows:value.itemCategories},
    {key:"regions",rows:value.regions},
  ];
  for(const section of sections)result[section.key]=Object.fromEntries(section.rows.map(row=>[String(row.id),row.name]));
  return result;
}
/** Canonical Audit list/detail renderer. Customer history and admin page share this owner. */
export function ChangeLogList({role,customerId}:{
  role:"ADMIN"|"SUPER_ADMIN";customerId?:number;
}) {
  const [filters,setFilters]=useState<Filters>(initialFilters);
  const [applied,setApplied]=useState<Filters>(initialFilters);
  const [events,setEvents]=useState<AuditEvent[]>([]);
  const [actors,setActors]=useState<AuditActor[]>([]);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [lookups,setLookups]=useState<FieldLookup>({});
  const [loading,setLoading]=useState(true);
  const [moreLoading,setMoreLoading]=useState(false);
  const [error,,setError]=useFeedbackMessage<string>("");
  const params:Record<string,string>={limit:"50",...isoWindow(applied)};
  if(customerId){params.relatedCustomerId=String(customerId);delete params.occurredFrom;delete params.occurredTo;}
  else {
    if(applied.entityTypes)params.entityTypes=applied.entityTypes;
    if(applied.actorEmployeeId)params.actorEmployeeId=applied.actorEmployeeId;
    if(applied.q.trim())params.q=applied.q.trim();
    if(role==="SUPER_ADMIN" && applied.includeErpQueries)params.includeErpQueries="true";
  }
  const key=JSON.stringify(params);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError("");setOpen(new Set());setEvents([]);setNextCursor(null);
    void loadAudit(JSON.parse(key) as Record<string,string>).then(result=>{
      if(!active)return;
      setEvents(result.events);setNextCursor(result.nextCursor);setActors(result.actors??[]);
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:"異動紀錄無法讀取");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[key]);
  useEffect(()=>{
    let active=true;
    void loadSettings().then(settings=>{if(active)setLookups(lookupDictionary(settings));}).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  async function loadMore(){
    if(!nextCursor||moreLoading)return;
    setMoreLoading(true);
    try{
      const result=await loadAudit({...JSON.parse(key) as Record<string,string>,cursor:nextCursor});
      setEvents(rows=>[...rows,...result.events.filter(event=>!rows.some(row=>row.id===event.id))]);
      setNextCursor(result.nextCursor);
    }catch(e){setError(e instanceof Error?e.message:"無法載入更多異動紀錄");}
    finally{setMoreLoading(false);}
  }
  // Filters apply as they change; the keyword waits for a pause in typing (user 2026-11-04).
  useEffect(()=>{
    if(filters.period==="custom"&&filters.from&&filters.to&&filters.from>filters.to){setError("結束日期不可早於開始日期");return;}
    const timer=window.setTimeout(()=>setApplied({...filters}),filters.q===applied.q?0:400);
    return ()=>window.clearTimeout(timer);
  },[filters]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open,setOpen]=useState<ReadonlySet<number>>(new Set());
  const toggle=(id:number)=>setOpen(prev=>{const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);return next;});
  // Newest first with 項次; it opens on 今天 (user 2026-11-04). 載入較早的紀錄 sits under the table.
  const rows=events;
  // Scheduled jobs (backups, ERP agent) have no person behind them.
  const who=(item:AuditEvent)=>item.actor?formatPerson(item.actor):"系統";
  const moduleChoices=role==="SUPER_ADMIN"?moduleOptions:moduleOptions.filter(option=>option.value!==ERP_MODULES);
  return <div className="cy-change-log">
    {!customerId ? <div role="search" className="cy-op-panel cy-change-log-filters" aria-label="異動紀錄查詢">
      <SegmentedControl label="期間" value={filters.period}
        options={[{value:"today",label:"今天"},{value:"7",label:"近 7 天"},{value:"30",label:"近 30 天"},{value:"custom",label:"自訂起訖"}] as const}
        onChange={period=>setFilters(v=>({...v,period}))} />
      {filters.period==="custom" ? <>
        <DateInput density="regular" max="9999-12-31" className="cy-op-input" aria-label="開始日期" value={filters.from} onChange={e=>setFilters(v=>({...v,from:e}))}/>
        <span aria-hidden="true">～</span>
        <DateInput density="regular" max="9999-12-31" className="cy-op-input" aria-label="結束日期" value={filters.to} onChange={e=>setFilters(v=>({...v,to:e}))}/>
      </>:null}
      <select className="cy-op-input" aria-label="模組" value={filters.entityTypes}
        onChange={e=>{const value=e.target.value;setFilters(v=>({...v,entityTypes:value,includeErpQueries:value===ERP_MODULES}));}}>
        {moduleChoices.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
      <select className="cy-op-input" aria-label="操作者" value={filters.actorEmployeeId}
        onChange={e=>setFilters(v=>({...v,actorEmployeeId:e.target.value}))}>
        <option value="">全部人員</option>{actors.map(p=><option key={p.id} value={p.id}>{formatPerson(p)}</option>)}
      </select>
      <input className="cy-op-input cy-change-log-search" type="search" maxLength={100} aria-label="關鍵字"
        placeholder="搜尋資料名稱或編號" value={filters.q} onChange={e=>setFilters(v=>({...v,q:e.target.value}))}/>
    </div>:null}
    {error?<div role="alert" className="cy-op-notice danger">{error}</div>:null}
    <section className={customerId?"cy-change-log-list":"cy-op-panel cy-change-log-list"} aria-label="異動清單">
      {loading?<Loading/>:<>
        {rows.length?<div className="cy-change-log-wrap"><table className="cy-sheet-table cy-change-log-table" aria-label="異動紀錄">
          <thead><tr><th scope="col"><span className="cy-visually-hidden">展開</span></th><th scope="col" className="cy-sheet-seq">項次</th>
            <th scope="col">時間（台灣）</th><th scope="col">人員</th><th scope="col">動作</th><th scope="col">對象</th><th scope="col">變更內容</th></tr></thead>
          <tbody>{rows.map((item,index)=>{
            const changes=item.entityType==="erp_item_query"?[]:auditChanges(item,lookups);
            const expandable=changes.length>0||role==="SUPER_ADMIN";
            const expanded=open.has(item.id);
            const name=recordName(item);
            const target=item.entityType==="erp_item_query"?auditSentence(item, lookups):name===entityLabel(item.entityType)?"—":name;
            return <Fragment key={item.id}>
              <tr className={"cy-change-log-row"+(expanded?" open":"")} title={formatDateTime(item.occurredAt)+"　"+who(item)+"　"+auditSentence(item, lookups)}
                onClick={()=>{if(expandable)toggle(item.id);}}>
                <td className="cy-change-log-toggle">{expandable?<ExpandToggle expanded={expanded} onToggle={()=>toggle(item.id)} label={auditSentence(item, lookups)}/>:null}</td>
                <td className="cy-sheet-seq">{index+1}</td>
                <td><span className="cy-sheet-value cy-change-log-time">{formatDateTime(item.occurredAt)}</span></td>
                <td><span className="cy-sheet-value">{who(item)}</span></td>
                <td><span className="cy-sheet-value">{item.entityType==="erp_item_query"?"ERP 查詢":actionLabel(item.action,item.entityType)}</span></td>
                <td><span className="cy-sheet-value">{target}</span></td>
                <td><span className="cy-sheet-value cy-change-log-fields">{[...new Set(changes.map(row=>row.label))].join("、")||"—"}</span></td>
              </tr>
              {expanded&&changes.length?<tr className="cy-change-log-sub head"><td/><td/><td/><td/><td><span className="cy-sheet-value">欄位</span></td><td><span className="cy-sheet-value">改前</span></td><td><span className="cy-sheet-value">改後</span></td></tr>:null}
              {expanded?changes.map(row=><tr key={row.key} className="cy-change-log-sub"><td/><td/><td/><td/>
                <td><span className="cy-sheet-value">{row.label}</span></td><td><span className="cy-sheet-value">{row.before}</span></td><td><span className="cy-sheet-value">{row.after}</span></td></tr>):null}
              {expanded&&role==="SUPER_ADMIN"?<tr className="cy-change-log-sub"><td/><td/><td colSpan={5}><details className="cy-change-log-technical"><summary>技術細節</summary>
                <pre className="cy-code-block">{JSON.stringify({id:item.id,entityType:item.entityType,
                  entityKey:item.entityKey,action:item.action,requestId:item.requestId,
                  before:item.before,after:item.after,metadata:item.metadata},null,2)}</pre></details></td></tr>:null}
            </Fragment>;
          })}</tbody></table></div>:<p className="cy-op-empty">此範圍尚無異動紀錄。</p>}
        {nextCursor?<button type="button" className="cy-op-button quiet cy-change-log-more" disabled={moreLoading}
          onClick={()=>void loadMore()}>{moreLoading?"載入中…":"載入較早的紀錄"}</button>:null}

      </>}
    </section>
  </div>;
}
export function AuditOperationalPage({role}:{role:"ADMIN"|"SUPER_ADMIN"}) {
  return <ChangeLogList role={role}/>;
}
