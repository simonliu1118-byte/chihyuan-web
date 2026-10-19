import { useCallback,useEffect,useState,type FormEvent } from "react";
import { Dialog } from "../../ui/overlays/Dialog";
import { formatDate } from "../../ui/foundation/format";
import { apiRequest } from "../../api/client";
import type { HrStatus } from "../../../shared/hr";
import type { AnnualLeavePeriod } from "../../../shared/hr-annual-leave";

const ROOT="/api/business/hr";
const labels:Record<HrStatus,string>={probation:"試用",active:"在職",leave:"留職停薪",terminated:"離職"};
type Employee={id:number;employee_no:string;name:string;status:HrStatus;member_id:number|null;nationalIdMasked:string|null;hire_date:string;seniority_start_date:string;revision:number;mobile:string|null;phone:string|null;birth_date:string|null;mailing_address:string|null;registered_address:string|null;note:string|null;contacts:Record<string,unknown>[];education:Record<string,unknown>[];workHistory:Record<string,unknown>[];salaryRecords:Record<string,unknown>[];statusChanges:Record<string,unknown>[];seniorityExclusions:Record<string,unknown>[]};
type StaffRow=Pick<Employee,"id"|"employee_no"|"name"|"status">;
const money=(n:unknown)=>typeof n==="number"?n.toLocaleString("zh-TW",{maximumFractionDigits:0})+" 元":"—";
function err(x:unknown){return x instanceof Error?x.message:"操作失敗";}
const inputClass="cy-op-input";
function dateDisplay(x:unknown){return typeof x==="string"?formatDate(x):"—";}
function Card({title,children}:{title:string;children:React.ReactNode}){return <section className="cy-op-panel"><h3>{title}</h3>{children}</section>;}
export function HrOperationalPage(){
 const [list,setList]=useState<StaffRow[]>([]);
 const [query,setQuery]=useState(""),[filter,setFilter]=useState("");
 const [next,setNext]=useState<number|null>(null);
 const [selectedId,setSelectedId]=useState<number|null>(null);
 const [detail,setDetail]=useState<Employee|null>(null);
 const [leave,setLeave]=useState<AnnualLeavePeriod[]>([]);
 const [dialog,setDialog]=useState<"employee"|"status"|"salary"|"exclusion"|"settings"|"nationalId"|null>(null);
 const [create,setCreate]=useState(false);
 const [fields,setFields]=useState<Record<string,string>>({});
 const [contacts,setContacts]=useState<Record<string,string>[]>([]);
 const [education,setEducation]=useState<Record<string,string>[]>([]);
 const [history,setHistory]=useState<Record<string,string>[]>([]);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [nationalId,setNationalId]=useState<string|null>(null);
 const [allLeave,setAllLeave]=useState(false);
 const [salaryItems,setSalaryItems]=useState<{id:number;name:string;is_active:number}[]>([]);
 const [minimumWages,setMinimumWages]=useState<{effective_date:string;monthly_amount:number;hourly_amount:number}[]>([]);
 const [salaryAllowances,setSalaryAllowances]=useState<{itemTypeId:number;amount:number;isRegular:boolean}[]>([]);
 const loadList=useCallback(async (append=false,cursor:number|null=null)=>{
  const p=new URLSearchParams({q:query,status:filter,limit:"40"});if(append&&cursor)p.set("cursor",String(cursor));
  const x=await apiRequest<{items:StaffRow[];nextCursor:number|null}>(ROOT+"/employees?"+p);
  setList(old=>append?[...old,...x.items]:x.items);setNext(x.nextCursor);
 },[query,filter]);
 const loadDetail=useCallback(async(id:number)=>{
  const [d,l]=await Promise.all([apiRequest<Employee>(ROOT+"/employees/"+id),apiRequest<AnnualLeavePeriod[]>(ROOT+"/employees/"+id+"/annual-leave")]);
  setDetail(d);setLeave(l);
 },[]);
 useEffect(()=>{void loadList().catch(x=>setError(err(x)));},[loadList]);
 useEffect(()=>{if(selectedId)void loadDetail(selectedId).catch(x=>setError(err(x)));},[selectedId,loadDetail]);
 function openEmployee(edit:boolean){
  setCreate(!edit);setError("");
  setFields(edit&&detail?{employeeNo:detail.employee_no,name:detail.name,memberId:detail.member_id?String(detail.member_id):"",hireDate:detail.hire_date,seniorityStartDate:detail.seniority_start_date,mobile:detail.mobile??"",phone:detail.phone??"",birthDate:detail.birth_date??"",mailingAddress:detail.mailing_address??"",registeredAddress:detail.registered_address??"",note:detail.note??"",nationalId:""}:{employeeNo:"",name:"",hireDate:"",seniorityStartDate:""});
  setContacts(edit&&detail?detail.contacts.map(x=>({name:String(x.name??""),relationship:String(x.relationship??""),phone:String(x.phone??"")})):[]);
  setEducation(edit&&detail?detail.education.map(x=>({school:String(x.school??""),department:String(x.department??""),degree:String(x.degree??""),graduationMonth:String(x.graduation_month??"")})):[]);
  setHistory(edit&&detail?detail.workHistory.map(x=>({company:String(x.company??""),jobTitle:String(x.job_title??""),startMonth:String(x.start_month??""),endMonth:String(x.end_month??""),note:String(x.note??"")})):[]);
  setDialog("employee");
 }
 function set(key:string,v:string){setFields(old=>({...old,[key]:v}));}
 const field=(label:string,key:string,type="text",required=false)=> <label key={key}>{label}<input className={inputClass} type={type} required={required} value={fields[key]??""} onChange={e=>set(key,e.target.value)} /></label>;
 async function submitEmployee(e:FormEvent){e.preventDefault();setBusy(true);setError("");
  try {
    const data:Record<string,unknown>={...fields,memberId:fields.memberId?Number(fields.memberId):null,
      seniorityStartDate:fields.seniorityStartDate||fields.hireDate,contacts,education,workHistory:history};
    if(!create&&detail){data.revision=detail.revision;delete data.nationalId;}
    const x=await apiRequest<Employee>(ROOT+"/employees"+(create?"":"/"+detail!.id),{method:create?"POST":"PATCH",json:data});
    setDialog(null);setSelectedId(x.id);await loadList();await loadDetail(x.id);setNotice(create?"已新增員工":"已更新人事資料");
  }catch(x){setError(err(x));}finally{setBusy(false);}
 }
 async function action(e:FormEvent){e.preventDefault();if(!detail||!dialog)return;setBusy(true);setError("");
  try{
    const endpoint=dialog==="status"?"status-changes":dialog==="salary"?"salary-records":"seniority-exclusions";
    const data:Record<string,unknown>={...fields};
    if(dialog==="salary"){data.baseAmount=Number(fields.baseAmount);data.allowances=salaryAllowances;}
    await apiRequest(ROOT+"/employees/"+detail.id+"/"+endpoint,{method:"POST",json:data});
    setDialog(null);await loadDetail(detail.id);await loadList();setNotice("紀錄已新增");
  }catch(x){setError(err(x));}finally{setBusy(false);}
 }
 function startAction(name:"status"|"salary"|"exclusion"){if(name==="salary"){setSalaryAllowances([]);void Promise.all([apiRequest<{id:number;name:string;is_active:number}[]>(ROOT+"/settings/salary-item-types"),apiRequest<{effective_date:string;monthly_amount:number;hourly_amount:number}[]>(ROOT+"/settings/minimum-wages")]).then(([i,w])=>{setSalaryItems(i.filter(x=>x.is_active===1));setMinimumWages(w);}).catch(e=>setError(err(e)));}setDialog(name);setError("");setFields(name==="status"?{effectiveDate:new Date().toISOString().slice(0,10),nextStatus:detail?.status??"active"}:name==="salary"?{effectiveDate:new Date().toISOString().slice(0,10),paymentType:"monthly"}:{startDate:"",endDate:""});}
 const editable=(rows:Record<string,string>[],setter:(x:Record<string,string>[])=>void,keys:string[],title:string)=><div className="cy-op-panel">
  <h3>{title}</h3>{rows.map((r,i)=><div key={i} className="cy-op-form">{keys.map(k=><label key={k}>{k}<input className={inputClass} value={r[k]??""} onChange={e=>setter(rows.map((x,j)=>i===j?{...x,[k]:e.target.value}:x))}/></label>)}<button type="button" className="cy-op-button" onClick={()=>setter(rows.filter((_,j)=>j!==i))}>移除</button></div>)}
  <button className="cy-op-button" type="button" onClick={()=>setter([...rows,{}])}>＋ 新增</button>
 </div>;
 const changeRows=(d:Record<string,unknown>[],formatter:(x:Record<string,unknown>)=>string)=>d.map((row,i)=><div key={i} className="cy-customer-line">{formatter(row)}</div>);
 return <div className="cy-op-module">
  {error&&!dialog?<div className="cy-notice cy-notice-danger" role="alert">{error}</div>:null}
  {notice?<div className="cy-notice" role="status">{notice}</div>:null}
  <div className="cy-op-grid-two">
   <section className="cy-op-panel">
    <div className="cy-op-panel-header"><h2>人事清單</h2><button className="cy-op-button primary" onClick={()=>openEmployee(false)}>＋ 新增員工</button></div>
    <div className="cy-op-form"><input className={inputClass} placeholder="搜尋員工編號、姓名" aria-label="搜尋員工" value={query} onChange={e=>setQuery(e.target.value)}/>
    <select className={inputClass} aria-label="人事狀態" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">全部狀態</option>{Object.entries(labels).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></div>
    {list.map(x=><button key={x.id} type="button" className="cy-op-button" style={{display:"flex",justifyContent:"space-between",width:"100%",height:"auto",marginTop:6}} onClick={()=>setSelectedId(x.id)}><span><small>{x.employee_no}</small><strong style={{display:"block"}}>{x.name}</strong></span><span>{labels[x.status]}</span></button>)}
    {!list.length?<p>尚無員工資料</p>:null}
    {next?<button className="cy-op-button" onClick={()=>void loadList(true,next).catch(x=>setError(err(x)))}>載入更多</button>:null}
   </section>
   {detail?<section className="cy-op-panel">
    <div className="cy-op-panel-header"><h2>{detail.employee_no} {detail.name}　{labels[detail.status]}</h2><button className="cy-op-button" onClick={()=>openEmployee(true)}>修改</button></div>
    <Card title="基本資料"><p>到職：{dateDisplay(detail.hire_date)}　年資起算：{dateDisplay(detail.seniority_start_date)}</p><p>電話：{detail.mobile??detail.phone??"—"}</p><p>通訊地址：{detail.mailing_address??"—"}</p>
     <p>身分證：{detail.nationalIdMasked??"未填寫"}　<button className="cy-op-button compact" onClick={async()=>{try{const r=await apiRequest<{nationalId:string|null}>(ROOT+"/employees/"+detail.id+"/national-id/reveal",{method:"POST",json:{}});setNationalId(r.nationalId);setDialog("nationalId");}catch(x){setError(err(x));}}}>顯示</button></p>
     <p>綁定使用者：{detail.member_id??"未綁定"}</p>
    </Card>
    <Card title="特休"><p>{leave.length?leave.at(-1)!.days+" 日（"+dateDisplay(leave.at(-1)!.periodStart)+"～"+dateDisplay(leave.at(-1)!.periodEnd)+"）":"未達給假年資"}</p>
      <button className="cy-op-button" onClick={()=>setAllLeave(x=>!x)}>{allLeave?"收起":"查看全部年度"}</button>
      {allLeave?leave.map((x,i)=><p key={i}>{x.serviceYearsLabel}：{x.days} 日　{dateDisplay(x.periodStart)}～{dateDisplay(x.periodEnd)}</p>):null}
    </Card>
    <Card title="薪資"><button className="cy-op-button" onClick={()=>startAction("salary")}>＋ 薪資異動</button>{detail.salaryRecords.length===0?<p>尚無薪資異動</p>:null}{detail.salaryRecords.map((x,i)=><div key={i} className="cy-customer-line">{dateDisplay(x.effective_date)}　{x.payment_type==="hourly"?"時薪":"月薪"}　{money(x.base_amount)}　{String(x.reason??"")}{Array.isArray(x.allowances)?x.allowances.map((a:any,j:number)=><div key={j}>{String(a.item_name??"津貼")}　{money(a.amount)}　{a.is_regular===1?"經常性":"非經常性"}</div>):null}</div>)}</Card>
    <Card title="狀態異動"><button className="cy-op-button" onClick={()=>startAction("status")}>＋ 異動</button>{changeRows(detail.statusChanges,x=>dateDisplay(x.effective_date)+"　"+String(x.next_status)+"　"+String(x.reason??""))}</Card>
    <Card title="年資不計期間"><button className="cy-op-button" onClick={()=>startAction("exclusion")}>＋ 新增</button>{detail.seniorityExclusions.map((x,i)=><div key={i} className="cy-customer-line">{dateDisplay(x.start_date)}～{dateDisplay(x.end_date)}　{String(x.reason??"")}<button className="cy-op-button compact" type="button" onClick={async()=>{if(!window.confirm("確定刪除此年資不計期間？將留下稽核紀錄。"))return;try{await apiRequest(ROOT+"/employees/"+detail.id+"/seniority-exclusions/"+x.id,{method:"DELETE"});await loadDetail(detail.id);}catch(e){setError(err(e));}}}>刪除</button></div>)}</Card>
    <Card title="緊急聯絡人">{changeRows(detail.contacts,x=>String(x.name??"")+"　"+String(x.phone??""))}</Card>
    <Card title="學歷">{changeRows(detail.education,x=>String(x.school??"")+"　"+String(x.department??""))}</Card>
    <Card title="工作經歷">{changeRows(detail.workHistory,x=>String(x.company??"")+"　"+String(x.job_title??""))}</Card>
   </section>:<section className="cy-op-panel"><p>請選擇員工查看明細</p></section>}
  </div>
  <Dialog open={dialog==="employee"} title={create?"新增員工":"修改員工"} onClose={()=>setDialog(null)} size="large">
   {error?<div className="cy-notice cy-notice-danger" role="alert">{error}</div>:null}
   <form className="cy-op-form" onSubmit={submitEmployee}>
     {field("員工編號","employeeNo","text",true)}{field("姓名","name","text",true)}{field("綁定使用者 ID（選填）","memberId")}
     {create?field("身分證字號（選填）","nationalId"):null}
     {field("到職日","hireDate","date",true)}{field("年資起算日","seniorityStartDate","date")}
     {field("出生年月日","birthDate","date")}{field("手機","mobile")}{field("市話","phone")}
     {field("通訊地址","mailingAddress")}{field("戶籍地址","registeredAddress")}{field("備註","note")}
     {editable(contacts,setContacts,["name","relationship","phone"],"緊急聯絡人")}
     {editable(education,setEducation,["school","department","degree","graduationMonth"],"學歷")}
     {editable(history,setHistory,["company","jobTitle","startMonth","endMonth","note"],"工作經歷")}
     <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>setDialog(null)}>取消</button><button className="cy-op-button primary" disabled={busy}>儲存</button></div>
   </form>
  </Dialog>
  <Dialog open={dialog==="nationalId"} title="身分證字號" size="small" onClose={()=>{setNationalId(null);setDialog(null)}}><p>{nationalId??"未填寫"}</p><button className="cy-op-button" onClick={()=>{setNationalId(null);setDialog(null)}}>關閉</button></Dialog>
  <Dialog open={["status","salary","exclusion"].includes(dialog??"")} title={dialog==="status"?"新增狀態異動":dialog==="salary"?"新增薪資異動":"新增年資不計期間"} size="medium" onClose={()=>setDialog(null)}>
   {error?<div className="cy-notice cy-notice-danger" role="alert">{error}</div>:null}
   <form className="cy-op-form" onSubmit={action}>
    {dialog==="status"?<>{field("生效日","effectiveDate","date",true)}<label>新狀態<select className={inputClass} value={fields.nextStatus??"active"} onChange={e=>set("nextStatus",e.target.value)}>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>{field("原因","reason","text",true)}{fields.nextStatus==="terminated"?<>{field("離職日","terminationDate","date",true)}{field("離職原因","terminationReason","text",true)}</>:null}</>:null}
    {dialog==="salary"?<>{field("生效日","effectiveDate","date",true)}{minimumWages.length===0?<p className="cy-notice cy-notice-warning">尚未設定最低工資，仍可新增薪資異動，請先核對勞動部公告。</p>:null}<label>計薪方式<select className={inputClass} value={fields.paymentType??"monthly"} onChange={e=>set("paymentType",e.target.value)}><option value="monthly">月薪</option><option value="hourly">時薪</option></select></label>{field("本薪（整數元）","baseAmount","number",true)}{field("異動原因","reason","text",true)}</>:null}
    {dialog==="exclusion"?<>{field("起日","startDate","date",true)}{field("迄日","endDate","date",true)}{field("原因","reason","text",true)}</>:null}
    <div className="cy-op-form-footer"><button className="cy-op-button" type="button" onClick={()=>setDialog(null)}>取消</button><button className="cy-op-button primary" disabled={busy}>新增</button></div>
   </form>
  </Dialog>
  <Dialog open={dialog==="settings"} title="人事設定" onClose={()=>setDialog(null)}><p>最低工資及津貼項目由超級管理員維護。</p></Dialog>
 </div>;
}
