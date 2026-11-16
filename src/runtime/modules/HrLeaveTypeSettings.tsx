import {useUnsavedChangesGuard} from '../../ui/foundation/useUnsavedChangesGuard';
import {EntryTable,EntryHeading} from '../../ui/forms/EntryTable';
import {Field,CheckField} from "../../ui/forms/Field";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {apiRequest} from "../../api/client";
import {enterAdvancesFields} from "../../ui/foundation/enter-advance";
type Rule={id:number;name:string;code:string;is_statutory:number;is_active:number;sort_order:number;quota_days:number|null;quota_period:string|null;merge_into_type_id:number|null;requires_reason:number;accepts_proof:number;pay_ratio?:number|null};
export function HrLeaveTypeSettings(){
 const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false);const writing=useRef(false);
 useUnsavedChangesGuard({active:editing,blocked:busy});
 const [rows,setRows]=useState<Rule[]>([]),[selected,setSelected]=useState<Rule|null>(null);
 const [name,setName]=useState(""),[code,setCode]=useState(""),[sort,setSort]=useState("0"),[enabled,setEnabled]=useState(true);
 const [quota,setQuota]=useState(""),[period,setPeriod]=useState(""),[reason,setReason]=useState(false),[proof,setProof]=useState(false),[error,setError]=useState("");
 const [payRatio,setPayRatio]=useState('');
 function refresh(){void apiRequest<Rule[]>("/api/business/hr/settings/leave-types").then(setRows).catch(e=>setError(String(e)))}
 useEffect(refresh,[]);
 function edit(x:Rule|null){setEditing(true);setSelected(x);setName(x?.name??"");setCode(x?.code??"");setSort(String(x?.sort_order??0));setEnabled(x?.is_active!==0);setQuota(x?.quota_days==null?"":String(x.quota_days));setPeriod(x?.quota_period??"");setReason(x?.requires_reason===1);setProof(x?.accepts_proof===1);setPayRatio(x?.pay_ratio==null?'':String(x.pay_ratio*100));}
 async function save(e:FormEvent){e.preventDefault();if(writing.current)return;writing.current=true;setBusy(true);setError("");
  try{await apiRequest("/api/business/hr/settings/leave-types",{method:selected?"PATCH":"POST",json:{id:selected?.id,code,name,sortOrder:Number(sort),isActive:enabled,quotaDays:quota===""?null:Number(quota),quotaPeriod:period||null,requiresReason:reason,acceptsProof:proof,payRatio:payRatio===''?null:Number(payRatio)/100}});
    edit(null);setEditing(false);refresh()}catch(e){setError(e instanceof Error?e.message:"假別儲存失敗")}finally{writing.current=false;setBusy(false)}
 }

 const cells=[
  {label:'代號',required:true,content:<input className="cy-sheet-input" value={code} onChange={e=>setCode(e.target.value)} disabled={busy||!!selected} maxLength={2}/>},
  {label:'名稱',required:true,content:<input className="cy-sheet-input" value={name} onChange={e=>setName(e.target.value)} disabled={busy||selected?.is_statutory===1}/>},
  {label:'排序',content:<input disabled={busy} className="cy-sheet-input" type="number" value={sort} onChange={e=>setSort(e.target.value)}/>},
  {label:'狀態',content:<CheckField disabled={busy} label="啟用" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>},
  {label:'額度天數',content:<input className="cy-sheet-input" type="number" min="0" step="0.5" value={quota} onChange={e=>setQuota(e.target.value)} disabled={busy||selected?.is_statutory===1}/>},
  {label:'期間',content:<select className="cy-sheet-input" value={period} disabled={busy||selected?.is_statutory===1} onChange={e=>setPeriod(e.target.value)}><option value="">不限</option><option value="calendar_year">每年</option><option value="month">每月</option><option value="event">每事件</option><option value="two_years">近兩年</option></select>},
  {label:'事由',content:<CheckField label="事由必填" checked={reason} disabled={busy||selected?.is_statutory===1} onChange={e=>setReason(e.target.checked)}/>},
  {label:'證明',content:<CheckField label="接受JPEG證明" checked={proof} disabled={busy||selected?.is_statutory===1} onChange={e=>setProof(e.target.checked)}/>},
  {label:'公司假給薪（%）',content:<input disabled={busy||selected?.is_statutory===1} className="cy-sheet-input" type="number" min="0" max="100" step="0.01" value={payRatio} onChange={e=>setPayRatio(e.target.value)}/>},
 ];
 const shown:(Rule|null)[]=[...rows,...(editing&&selected===null?[null]:[])];
 return <section className="cy-op-panel"><h3>假別設定</h3>{error?<p role="alert" className="cy-notice cy-notice-danger">{error}</p>:null}
  <form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={e=>void save(e)}><EntryTable label="假別設定"><thead><tr>{cells.map(c=><th key={c.label}><EntryHeading required={c.required}>{c.label}</EntryHeading></th>)}<th>類型</th><th>操作</th></tr></thead><tbody>
   {shown.map(row=>{const active=editing&&(row?row.id===selected?.id:selected===null);const display=row?[row.code,row.name,row.sort_order,row.is_active?'啟用':'停用',row.quota_days??'不限',({calendar_year:'每年',month:'每月',event:'每事件',two_years:'近兩年'}[row.quota_period??'']??'不限'),row.requires_reason?'必填':'—',row.accepts_proof?'接受':'—',row.is_statutory?'依法':row.pay_ratio==null?'待設定':row.pay_ratio*100+'%']:[];return <tr key={row?.id??'new'}>
    {cells.map((c,i)=><td key={c.label}>{active?<Field label={c.label} presentation="cell" required={c.required}>{c.content}</Field>:display[i]}</td>)}<td>{row?.is_statutory?'法定':'公司'}</td>
    <td>{active?<><button type="button" className="cy-op-button" disabled={busy} onClick={()=>{edit(null);setEditing(false)}}>取消</button><button disabled={busy} className="cy-op-button primary">儲存假別</button></>:<button type="button" className="cy-op-button" disabled={busy||editing} onClick={()=>edit(row)}>修改</button>}</td>
   </tr>})}</tbody></EntryTable></form>
  <button type="button" className="cy-op-button" disabled={busy||editing} onClick={()=>edit(null)}>＋新增公司假別</button>
 </section>;
}
