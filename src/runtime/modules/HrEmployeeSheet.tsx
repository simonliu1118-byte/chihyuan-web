import {useState, type ReactNode, type ReactElement} from "react";
import {RecordSheet,RecordRows,type SheetRow,type RowColumn} from "../../ui/forms/RecordSheet";
import {DateInput} from "../../ui/forms/DateInput";
import {CheckField} from "../../ui/forms/Field";
import {Dialog} from "../../ui/overlays/Dialog";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {formatDate} from "../../ui/foundation/format";
import type {Draft,EmployeeDetail,MemberOption} from "./HrOperationalPage";

/** The single HR employee renderer: edit switches cells into controls, never a second layout. */
export function HrEmployeeSheet({value,detail,editing,creating,busy,members,stores,jobTitles,patch,onReveal}:{
 value:Draft;detail:EmployeeDetail|null;editing:boolean;creating:boolean;busy:boolean;
 members:MemberOption[];stores:{id:number;name:string}[];jobTitles:{id:number;name:string}[];
 patch:(value:Partial<Draft>)=>void;onReveal:()=>void;
}){
 const [picking,setPicking]=useState(false);
 const input=(key:keyof Draft,type="text")=><input className="cy-sheet-input" type={type} disabled={busy}
   value={String(value[key]??"")} onChange={e=>patch({[key]:e.target.value} as Partial<Draft>)}/>;
 const day=(key:"birthDate"|"hireDate"|"seniorityStartDate")=><DateInput density="regular" className="cy-sheet-input"
   disabled={busy} max="9999-12-31" value={value[key]} onChange={v=>patch({[key]:v} as Partial<Draft>)}/>;
 const select=(key:keyof Draft,options:ReactNode)=><select className="cy-sheet-input" disabled={busy}
   value={String(value[key]??"")} onChange={e=>patch({[key]:e.target.value} as Partial<Draft>)}>
     <option value="">請選擇</option>{options}
   </select>;
 const cell=(label:string,view:ReactNode,edit?:ReactElement,required=false)=>({label,view,edit,required});
 const sameAddress=value.mailingAddress!==""&&value.mailingAddress===value.registeredAddress;
 const phoneRequired=!value.mobile.trim()&&!value.phone.trim();
 const idCell=<span className="cy-hr-picker">
   <input readOnly className="cy-sheet-input" aria-label="身分證字號" value={value.nationalId}/>
   <button type="button" className="cy-op-button soft compact" disabled={busy}
     onClick={()=>patch({changeNationalId:true,nationalId:""})}>變更</button></span>;
 const nationalView=detail?.nationalIdMasked
   ?<span className="cy-hr-id">{detail.nationalIdMasked}<button type="button" className="cy-op-button mini soft" onClick={onReveal}>顯示</button></span>
   :value.nationalId||"";
 const rows:SheetRow[]=[
  {columns:"1fr 1fr 1.55fr .7fr 1.05fr 1.65fr",cells:[
    cell("員工編號",value.employeeNo,input("employeeNo"),true),
    cell("姓名",value.name,input("name"),true),
    cell("身分證字號",nationalView,value.changeNationalId?input("nationalId"):idCell,value.changeNationalId),
    cell("性別",value.gender,select("gender",<><option value="男">男</option><option value="女">女</option><option value="其他">其他</option></>),true),
    cell("出生日期",value.birthDate?formatDate(value.birthDate):"",day("birthDate"),true),
    cell("綁定使用者",value.memberLabel||"不綁定",<span className="cy-hr-picker">
      <input className="cy-sheet-input" readOnly aria-label="綁定使用者" value={value.memberLabel||"不綁定"}/>
      <button type="button" className="cy-op-button compact soft" disabled={busy} onClick={()=>setPicking(true)}>選擇</button>
     </span>)
  ]},
  {columns:"1.05fr 1fr 1fr 1fr 1fr 1.1fr"+(creating?" 1fr":""),cells:[
    cell("門市",stores.find(x=>String(x.id)===value.storeId)?.name||"",select("storeId",stores.map(x=><option key={x.id} value={x.id}>{x.name}</option>)),true),
    cell("職稱",jobTitles.find(x=>String(x.id)===value.jobTitleId)?.name||"",select("jobTitleId",jobTitles.map(x=><option key={x.id} value={x.id}>{x.name}</option>)),true),
    cell("僱用型態",({full:"正職",half:"半職",casual:"兼職"} as const)[value.employmentType],
      <select className="cy-sheet-input" disabled={busy} value={value.employmentType} onChange={e=>{
       const employmentType=e.target.value as Draft["employmentType"];
       patch({employmentType,scheduleMode:employmentType==="full"?"shift":employmentType!=="casual"&&value.scheduleMode==="none"?"shift":value.scheduleMode});
      }}><option value="full">正職</option><option value="half">半職</option><option value="casual">兼職</option></select>,true),
    cell("排班方式",({shift:"班別",hours:"時段或時數",none:"不排班"} as const)[value.scheduleMode],
      <select className="cy-sheet-input" disabled={busy} value={value.scheduleMode} onChange={e=>patch({scheduleMode:e.target.value as Draft["scheduleMode"]})}>
        <option value="shift">班別</option>{value.employmentType!=="full"?<option value="hours">時段或時數</option>:null}
        {value.employmentType==="casual"?<option value="none">不排班</option>:null}</select>,true),
    cell("到職日",value.hireDate?formatDate(value.hireDate):"",day("hireDate"),true),
    cell("年資起算日",value.seniorityStartDate?formatDate(value.seniorityStartDate):"同到職日",day("seniorityStartDate")),
    // 班表排序／不檢查排班規則 live only in 排班 → 門市人員設定 (user 2026-11-09).
    ...(creating?[cell("人事狀態",value.status==="active"?"在職":"試用",
     <select className="cy-sheet-input" disabled={busy} value={value.status} onChange={e=>patch({status:e.target.value as Draft["status"]})}>
      <option value="probation">試用</option><option value="active">在職</option></select>,true)]:[])
  ]},
  {columns:"1fr 1fr 2fr 2.3fr",cells:[
    cell("手機",value.mobile,input("mobile"),phoneRequired),
    cell("市話",value.phone,input("phone"),phoneRequired),
    cell("戶籍地址",value.registeredAddress,<input className="cy-sheet-input" disabled={busy} value={value.registeredAddress}
      onChange={e=>patch(sameAddress?{registeredAddress:e.target.value,mailingAddress:e.target.value}:{registeredAddress:e.target.value})}/>,true),
    cell("通訊地址",value.mailingAddress,<div className="cy-hr-sheet-address">
      <input className="cy-sheet-input" disabled={busy||sameAddress} value={value.mailingAddress} onChange={e=>patch({mailingAddress:e.target.value})}/>
      <CheckField label="同戶籍地址" checked={sameAddress} disabled={busy||!value.registeredAddress}
       onChange={e=>patch({mailingAddress:e.target.checked?value.registeredAddress:""})}/></div>,true)
  ]},
  {columns:"1fr",cells:[cell("備註",value.note,<textarea className="cy-sheet-input" value={value.note} disabled={busy}
    onChange={e=>patch({note:e.target.value})}/>)]}
 ];
 if(detail?.status==="terminated")rows.push({columns:"1fr 3fr",cells:[
   cell("離職日",detail.termination_date?formatDate(detail.termination_date):"",undefined),
   cell("離職原因",detail.termination_reason||"",undefined)
 ]});
 const contacts:Draft["contacts"]=editing?value.contacts:detail?.contacts.map(x=>({name:x.name,relationship:x.relationship||"",phone:x.phone}))??[];
 const education:Draft["education"]=editing?value.education:detail?.education.map(x=>({school:x.school,department:x.department||"",degree:x.degree||"",graduationMonth:x.graduation_month?.replace("/","-")||""}))??[];
 const workHistory:Draft["workHistory"]=editing?value.workHistory:detail?.workHistory.map(x=>({company:x.company,jobTitle:x.job_title||"",startMonth:x.start_month?.replace("/","-")||"",endMonth:x.end_month?.replace("/","-")||"",note:x.note||""}))??[];
 const change=<T extends keyof Draft>(field:T,index:number,key:string,next:string)=>{
  const data=value[field] as unknown as Record<string,string>[];
  patch({[field]:data.map((item,i)=>i===index?{...item,[key]:next}:item)} as Partial<Draft>);
 };
 const insert=<T extends "contacts"|"education"|"workHistory">(field:T,index:number,blank:Draft[T][number])=>{
  const current=value[field] as Draft[T][number][];
  patch({[field]:[...current.slice(0,index+1),blank,...current.slice(index+1)]} as Partial<Draft>);
 };
 const remove=<T extends "contacts"|"education"|"workHistory">(field:T,index:number)=>{
  patch({[field]:(value[field] as Draft[T][number][]).filter((_,i)=>i!==index)} as Partial<Draft>);
 };
 const entry=(v:string,label:string,onChange:(next:string)=>void,type="text")=>type==="month"?
  <DateInput precision="month" max="9999-12" className="cy-sheet-input" value={v} disabled={busy} onChange={onChange}/>:
  <input className="cy-sheet-input" aria-label={label} type={type} disabled={busy} value={v} onChange={e=>onChange(e.target.value)}/>;
 const contactColumns:RowColumn<Draft["contacts"][number]>[]=[
  {label:"姓名",required:true,view:r=>r.name,edit:(r,i)=>entry(r.name,"緊急聯絡人姓名",v=>change("contacts",i,"name",v))},
  {label:"關係",view:r=>r.relationship,edit:(r,i)=>entry(r.relationship,"緊急聯絡人關係",v=>change("contacts",i,"relationship",v))},
  {label:"電話",required:true,view:r=>r.phone,edit:(r,i)=>entry(r.phone,"緊急聯絡人電話",v=>change("contacts",i,"phone",v))}
 ];
 const educationColumns:RowColumn<Draft["education"][number]>[]=[
  {label:"學校",required:true,view:r=>r.school,edit:(r,i)=>entry(r.school,"學校",v=>change("education",i,"school",v))},
  {label:"科系",view:r=>r.department,edit:(r,i)=>entry(r.department,"科系",v=>change("education",i,"department",v))},
  {label:"學位",view:r=>r.degree,edit:(r,i)=>entry(r.degree,"學位",v=>change("education",i,"degree",v))},
  {label:"畢業年月",view:r=>r.graduationMonth.replace("-","/"),edit:(r,i)=>entry(r.graduationMonth,"畢業年月",v=>change("education",i,"graduationMonth",v),"month")}
 ];
 const workColumns:RowColumn<Draft["workHistory"][number]>[]=[
  {label:"公司",required:true,view:r=>r.company,edit:(r,i)=>entry(r.company,"公司",v=>change("workHistory",i,"company",v))},
  {label:"職稱",view:r=>r.jobTitle,edit:(r,i)=>entry(r.jobTitle,"經歷職稱",v=>change("workHistory",i,"jobTitle",v))},
  {label:"起年月",view:r=>r.startMonth.replace("-","/"),edit:(r,i)=>entry(r.startMonth,"起年月",v=>change("workHistory",i,"startMonth",v),"month")},
  {label:"迄年月",view:r=>r.endMonth.replace("-","/"),edit:(r,i)=>entry(r.endMonth,"迄年月",v=>change("workHistory",i,"endMonth",v),"month")}
 ];
 return <div className="cy-hr-sheet">
  <RecordSheet label="員工資料單" editing={editing} rows={rows}/>
  <RecordRows title="緊急聯絡人" editing={editing} busy={busy} rows={contacts} columns={contactColumns} rowKey={(_,i)=>i}
   onInsert={i=>insert("contacts",i,{name:"",relationship:"",phone:""})} onRemove={i=>remove("contacts",i)}/>
  <RecordRows title="學歷" editing={editing} busy={busy} rows={education} columns={educationColumns} rowKey={(_,i)=>i}
   onInsert={i=>insert("education",i,{school:"",department:"",degree:"",graduationMonth:""})} onRemove={i=>remove("education",i)}/>
  <RecordRows title="工作經歷" editing={editing} busy={busy} rows={workHistory} columns={workColumns} rowKey={(_,i)=>i}
   onInsert={i=>insert("workHistory",i,{company:"",jobTitle:"",startMonth:"",endMonth:"",note:""})} onRemove={i=>remove("workHistory",i)}/>
  {editing&&picking?<MemberPicker members={members} employeeNo={value.employeeNo} onClose={()=>setPicking(false)}
   onPick={member=>{patch(member?{memberIdentityId:member.employeeId,memberLabel:member.employeeNo+" "+member.name}:{memberIdentityId:null,memberLabel:""});setPicking(false)}}/>:null}
 </div>;
}

function MemberPicker({members,employeeNo,onPick,onClose}:{
 members:MemberOption[];employeeNo:string;onPick:(member:MemberOption|null)=>void;onClose:()=>void;
}){
 const [query,setQuery]=useState("");
 const q=query.toLowerCase().trim();
 const found=members.filter(row=>!q||(row.employeeNo+" "+row.name).toLowerCase().includes(q))
  .sort((a,b)=>Number(b.employeeNo===employeeNo)-Number(a.employeeNo===employeeNo)||a.employeeNo.localeCompare(b.employeeNo));
 return <Dialog open size="small" title="選擇綁定使用者" onClose={onClose}>
  <input className="cy-op-input" type="search" autoFocus aria-label="搜尋使用者" placeholder="搜尋員工編號、姓名"
   value={query} onChange={e=>setQuery(e.target.value)}/>
  <div className="cy-hr-member-list">
   <button type="button" className="cy-op-list-row" onClick={()=>onPick(null)}><strong>不綁定</strong></button>
   {found.map(row=><button type="button" key={row.employeeId} className="cy-op-list-row" onClick={()=>onPick(row)}>
    <span className="cy-mono">{row.employeeNo}</span><strong>{row.name||"（未命名）"}</strong>
    {row.employeeNo===employeeNo?<StatusChip tone="info">員工編號相同</StatusChip>:null}
   </button>)}
   {!found.length?<p className="cy-op-empty">沒有符合的使用者。</p>:null}
  </div>
 </Dialog>;
}
