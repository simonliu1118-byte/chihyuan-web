import {Field,CheckField,FormSection} from "../../ui/forms/Field";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import {apiRequest} from "../../api/client";
import {enterAdvancesFields,enterAdvancesThenSubmits} from "../../ui/foundation/enter-advance";
import {taipeiToday} from "../../../shared/erp-query-history";
import {HrLeaveTypeSettings} from "./HrLeaveTypeSettings";
type Kind="stores"|"job-titles"|"shift-types";
type Item={id:number;name:string;code?:string;is_active:number;sort_order:number;cycle_anchor_date?:string;rules_template?:string;
 start_time?:string;end_time?:string;break_start?:string|null;break_end?:string|null;normal_minutes?:number};
type Holiday={date:string;name:string};
const ROOT="/api/business/hr/settings";
const kindLabels:Record<Kind,string>={stores:"門市","job-titles":"職稱","shift-types":"班別"};
function minutes(text:string){if(!/^\d{2}:\d{2}$/.test(text))return 0;return Number(text.slice(0,2))*60+Number(text.slice(3))}
export function HrPhase2aSettings(){
 const [kind,setKind]=useState<Kind>("stores"),[rows,setRows]=useState<Item[]>([]),[year,setYear]=useState(Number(taipeiToday().slice(0,4))),[holidays,setHolidays]=useState<Holiday[]>([]);
 const [id,setId]=useState<number|null>(null),[value,setValue]=useState<Record<string,string>>({});
 const [holidayDate,setHolidayDate]=useState(""),[holidayName,setHolidayName]=useState("");
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{
  const [a,b]=await Promise.all([apiRequest<Item[]>(ROOT+"/"+kind),apiRequest<Holiday[]>(ROOT+"/holidays?year="+year)]);
  setRows(a);setHolidays(b);
 },[kind,year]);
 useEffect(()=>{void refresh().catch(e=>setError(String(e)))},[refresh]);
 const change=(key:string,val:string)=>setValue(x=>({...x,[key]:val}));
 const field=(label:string,key:string,type="text",required=false)=><label key={key}>{label}<input className="cy-op-input" type={type} max={type==="date"?"9999-12-31":undefined} required={required} value={value[key]??""} onChange={e=>change(key,e.target.value)}/></label>;
 function edit(row?:Item){
  setId(row?.id??null);setValue(row?{name:row.name,code:row.code??"",sortOrder:String(row.sort_order),isActive:String(row.is_active===1),
   cycleAnchorDate:row.cycle_anchor_date??"",rulesTemplate:row.rules_template??"",startTime:row.start_time??"",
   endTime:row.end_time??"",breakStart:row.break_start??"",breakEnd:row.break_end??""}
   :{name:"",code:"",sortOrder:"0",isActive:"true",cycleAnchorDate:"2026-09-28",rulesTemplate:"",
    startTime:"09:00",endTime:"17:30",breakStart:"",breakEnd:""});
 }
 async function save(e:FormEvent){e.preventDefault();setBusy(true);setError("");
  try{const body:Record<string,unknown>={...value,id:id??undefined,sortOrder:Number(value.sortOrder??0),isActive:value.isActive!=="false"};
   if(kind==="shift-types"){
    const elapsed=minutes(value.endTime??"")-minutes(value.startTime??"");
    body.normalMinutes=elapsed-(value.breakStart&&value.breakEnd?minutes(value.breakEnd)-minutes(value.breakStart):0);
   }
   await apiRequest(ROOT+"/"+kind,{method:id?"PATCH":"POST",json:body});
   setId(null);setValue({});await refresh();
  }catch(e){setError(e instanceof Error?e.message:"儲存失敗")}finally{setBusy(false)}
 }
 async function saveHoliday(e:FormEvent){e.preventDefault();setBusy(true);setError("");
  try{await apiRequest(ROOT+"/holidays",{method:"POST",json:{date:holidayDate,name:holidayName}});setHolidayDate("");setHolidayName("");await refresh()}
  catch(e){setError(e instanceof Error?e.message:"儲存失敗")}finally{setBusy(false)}
 }
 async function deleteHoliday(date:string){if(!window.confirm("確定刪除 "+date+" 國定假日？"))return;setBusy(true);
  try{await apiRequest(ROOT+"/holidays?date="+date,{method:"DELETE"});await refresh()}catch(e){setError(String(e))}finally{setBusy(false)}
 }
 return <section className="cy-op-panel"><h3>門市、職稱、班別與國定假日</h3>
  {error?<p role="alert" className="cy-notice cy-notice-danger">{error}</p>:null}
  <div className="hr-cell-choices">{(Object.keys(kindLabels) as Kind[]).map(k=><button key={k} type="button" className="cy-op-button" onClick={()=>{setKind(k);setId(null);setValue({})}}>{kindLabels[k]}</button>)}</div>
  <h4>{kindLabels[kind]}</h4>
  {rows.map(row=><div key={row.id} className="hr-staff-setting"><span>{row.code?row.code+" ":""}{row.name} {row.is_active===0?"（停用）":""}</span>
   {kind==="shift-types"?<small>{row.start_time}～{row.end_time}（{row.normal_minutes} 分鐘）</small>:null}
   <button type="button" className="cy-op-button" onClick={()=>edit(row)}>編輯</button></div>)}
  <button type="button" className="cy-op-button" onClick={()=>edit()}>＋ 新增{kindLabels[kind]}</button>
  {value.name!==undefined?<form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={e=>void save(e)}>
    <FormSection>
   {field("名稱","name","text",true)}
   {kind==="shift-types"?field("班別代號（1～2 字）","code","text",true):null}
   {field("排序","sortOrder","number")}
   <Field  label="狀態" size="s"><select className="cy-op-input" value={value.isActive??"true"} onChange={e=>change("isActive",e.target.value)}><option value="true">啟用</option><option value="false">停用</option></select></Field>
   {kind==="stores"?<>{field("雙週起算週一","cycleAnchorDate","date",true)}<Field  label="注意事項範本" size="m"><textarea className="cy-op-input" value={value.rulesTemplate??""} onChange={e=>change("rulesTemplate",e.target.value)}/></Field></>:null}
   {kind==="shift-types"?<>{field("上班時間","startTime","time",true)}{field("下班時間","endTime","time",true)}{field("休息開始","breakStart","time")}{field("休息結束","breakEnd","time")}
    <p>正常工時：{Math.max(0,minutes(value.endTime??"")-minutes(value.startTime??"")-(value.breakStart&&value.breakEnd?minutes(value.breakEnd)-minutes(value.breakStart):0))} 分鐘</p></>:null}
   <div className="cy-op-form-footer"><button className="cy-op-button" type="button" onClick={()=>setValue({})}>取消</button><button className="cy-op-button primary" disabled={busy}>儲存</button></div>
  
    </FormSection>
  </form>:null}
  <h4>國定假日（人工維護）</h4><label>年份<select className="cy-op-input" value={year} onChange={e=>setYear(Number(e.target.value))}>{[year-1,year,year+1].map(y=><option key={y} value={y}>{y}</option>)}</select></label>
  {holidays.map(h=><div className="hr-staff-setting" key={h.date}><span>{h.date.replaceAll("-","/")}　{h.name}</span><button type="button" className="cy-op-button" disabled={busy} onClick={()=>void deleteHoliday(h.date)}>刪除</button></div>)}
  <form onKeyDown={enterAdvancesThenSubmits} className="cy-op-form" onSubmit={e=>void saveHoliday(e)}>
    <FormSection>
   <Field  label="假日日期" size="s" required><input type="date" max="9999-12-31" className="cy-op-input" value={holidayDate} onChange={e=>setHolidayDate(e.target.value)}/></Field>
   <Field  label="假日名稱" size="m" required><input className="cy-op-input" value={holidayName} onChange={e=>setHolidayName(e.target.value)}/></Field>
   <button className="cy-op-button primary" disabled={busy}>新增國定假日</button>
  
    </FormSection>
  </form>
 <HrLeaveTypeSettings/>
 </section>;
}
