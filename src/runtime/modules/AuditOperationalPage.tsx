import { Loading } from "../../ui/feedback/Loading";
import { useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { formatDate, formatDateTime, formatPerson } from "../../ui/foundation/format";
import { taipeiToday } from "../../../shared/erp-query-history";
import { useEffect, useState, type FormEvent } from "react";
import { loadAudit, loadSettings, type AuditEvent, type AuditActor } from "../api/settings-audit-client";
import { Drawer } from "../../ui/overlays/Dialog";
import { auditChanges, auditSentence, type FieldLookup } from "./change-log-labels";

const moduleOptions: readonly { value:string; label:string }[] = [
  {value:"",label:"全部模組"},
  {value:"customer,customer_visit,customer_item_quote,customer_frequent_item",label:"客戶"},
  {value:"item",label:"商品"},{value:"defect",label:"瑕疵"},
  {value:"sales_work_order",label:"銷售工單"},
  {value:"outsourcing_order,contractor,contractor_price,bom_recipe",label:"委外/代工"},
  {value:"work_log",label:"工作日誌"},
  {value:"customer_category,customer_status,department,item_category,work_log_category,work_log_platform,work_log_scoring_row,work_log_scoring_config,setting",label:"設定"},
  {value:"module_access,module_access_group,app_tag",label:"使用權"},
  {value:"backup",label:"備份"},{value:"erp_item_query,erp_item_agent",label:"ERP 查詢"},
];
type Period = "today" | "7" | "30" | "custom";
type Filters = {entityTypes:string;period:Period;from:string;to:string;actorEmployeeId:string;q:string;includeErpQueries:boolean};
const initialFilters:Filters = {entityTypes:"",period:"7",from:"",to:"",actorEmployeeId:"",q:"",includeErpQueries:false};
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
  const [selected,setSelected]=useState<AuditEvent|null>(null);
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
    setLoading(true);setError("");setSelected(null);setEvents([]);setNextCursor(null);
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
  function search(e:FormEvent){
    e.preventDefault();
    if(filters.period==="custom"&&filters.from&&filters.to&&filters.from>filters.to){setError("結束日期不可早於開始日期");return;}
    setApplied({...filters});
  }
  const groups=new Map<string,AuditEvent[]>();
  for(const event of events){const date=formatDate(event.occurredAt);groups.set(date,[...(groups.get(date)??[]),event]);}
  const today=formatDate(new Date());
  return <div className="cy-change-log">
    {!customerId ? <form role="search" className="cy-op-panel cy-change-log-filters" onSubmit={search} aria-label="異動紀錄查詢">
      <label>模組<select className="cy-op-input" value={filters.entityTypes} onChange={e=>setFilters(v=>({...v,entityTypes:e.target.value}))}>{moduleOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <fieldset><legend>期間</legend><div className="cy-segmented" role="group" aria-label="期間">{([
        ["today","今天"],["7","近 7 天"],["30","近 30 天"],["custom","自訂起訖"],
      ] as const).map(([value,label])=><button key={value} type="button" aria-pressed={filters.period===value}
        onClick={()=>setFilters(v=>({...v,period:value}))}>{label}</button>)}</div></fieldset>
      {filters.period==="custom" ? <>
        <label>開始日期<input type="date" max="9999-12-31" className="cy-op-input" value={filters.from} onChange={e=>setFilters(v=>({...v,from:e.target.value}))}/></label>
        <label>結束日期<input type="date" max="9999-12-31" className="cy-op-input" value={filters.to} onChange={e=>setFilters(v=>({...v,to:e.target.value}))}/></label>
      </>:null}
      <label>操作者<select className="cy-op-input" value={filters.actorEmployeeId}
        onChange={e=>setFilters(v=>({...v,actorEmployeeId:e.target.value}))}>
        <option value="">全部人員</option>{actors.map(p=><option key={p.id} value={p.id}>{formatPerson(p)}</option>)}
      </select></label>
      <label>關鍵字<input className="cy-op-input" type="search" maxLength={100}
        placeholder="資料名稱或編號" value={filters.q} onChange={e=>setFilters(v=>({...v,q:e.target.value}))}/></label>
      {role === "SUPER_ADMIN" ? <label className="cy-change-log-erp-toggle">
        <input type="checkbox" checked={filters.includeErpQueries}
          onChange={event => setFilters(prev => ({...prev, includeErpQueries:event.target.checked}))} />
        顯示 ERP 查詢
      </label> : null}
      <button className="cy-op-button primary" type="submit" disabled={loading}>查詢</button>
    </form>:null}
    {error?<div role="alert" className="cy-op-notice danger">{error}</div>:null}
    <section className="cy-op-panel cy-change-log-list" aria-label="異動清單">
      {loading?<Loading/>:<>
        {[...groups.entries()].map(([date,items])=><div key={date} className="cy-change-log-day">
          <h3>{date}{date===today?"（今天）":""}</h3>
          {items.map(item => {
            const sentence = auditSentence(item, lookups);
            const time = formatDateTime(item.occurredAt).split(" ").at(-1) ?? "—";
            const person = formatPerson(item.actor);
            return <button type="button" key={item.id} className="cy-change-log-row"
              onClick={() => setSelected(item)} title={`${time}　${person}　${sentence}`}
              aria-label={`${time}　${person}　${sentence}，查看明細`}>
              <span>{time}　{person}　{sentence}</span>
            </button>;
          })}
        </div>)}
        {!events.length?<p className="cy-customer-muted">此範圍尚無異動紀錄。</p>:null}
        {nextCursor?<button type="button" className="cy-op-button" disabled={moreLoading}
          onClick={()=>void loadMore()}>{moreLoading?"載入中…":"載入更多"}</button>:null}
      </>}
    </section>
    <Drawer open={selected!==null} title="異動明細" onClose={()=>setSelected(null)}>
      {selected?<div className="cy-audit-detail">
        <p className="cy-change-log-summary">{formatDateTime(selected.occurredAt)}　{formatPerson(selected.actor)}　{auditSentence(selected,lookups)}</p>
        {selected.entityType !== "erp_item_query" && selected.statusFrom !== selected.statusTo && (selected.statusFrom || selected.statusTo) ? <p>狀態：{auditChanges(selected,lookups).find(row=>row.key==="status")?.before ?? "—"} → {auditChanges(selected,lookups).find(row=>row.key==="status")?.after ?? "—"}</p> : null}
        {selected.entityType !== "erp_item_query" ? <table className="cy-op-table"><thead><tr><th>欄位</th><th>改前</th><th>改後</th></tr></thead>
          <tbody>{auditChanges(selected,lookups).map(row=><tr key={row.key}>
            <td>{row.label}</td><td>{row.before}</td><td>{row.after}</td>
          </tr>)}</tbody></table> : null}
        {selected.entityType !== "erp_item_query" && !auditChanges(selected,lookups).length?<p className="cy-customer-muted">此筆未提供欄位差異。</p>:null}
        {role==="SUPER_ADMIN"?<details className="cy-change-log-technical"><summary>技術細節</summary>
          <pre className="cy-code-block">{JSON.stringify({id:selected.id,entityType:selected.entityType,
            entityKey:selected.entityKey,action:selected.action,requestId:selected.requestId,
            before:selected.before,after:selected.after,metadata:selected.metadata},null,2)}</pre>
        </details>:null}
      </div>:null}
    </Drawer>
  </div>;
}
export function AuditOperationalPage({role}:{role:"ADMIN"|"SUPER_ADMIN"}) {
  return <ChangeLogList role={role}/>;
}
