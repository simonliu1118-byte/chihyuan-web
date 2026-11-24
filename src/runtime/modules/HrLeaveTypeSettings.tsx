import {useUnsavedChangesGuard} from '../../ui/foundation/useUnsavedChangesGuard';
import {Field,CheckField} from "../../ui/forms/Field";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {apiRequest} from "../../api/client";
import {ActiveChip,SettingsEditor,SettingsPane,SettingsTable} from "./HrSettingsPane";
type Rule={id:number;name:string;code:string;is_statutory:number;is_active:number;sort_order:number;quota_days:number|null;quota_period:string|null;merge_into_type_id:number|null;requires_reason:number;accepts_proof:number;pay_ratio?:number|null};
const PERIODS:Record<string,string>={calendar_year:'每年',month:'每月',event:'每事件',two_years:'近兩年'};
/** 假別: one table; 新增公司假別／修改 open an editor dialog. */
export function HrLeaveTypeSettings(){
 const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false);const writing=useRef(false);
 useUnsavedChangesGuard({active:editing,blocked:busy});
 const [rows,setRows]=useState<Rule[]>([]),[loaded,setLoaded]=useState(false),[selected,setSelected]=useState<Rule|null>(null);
 const [name,setName]=useState(""),[code,setCode]=useState(""),[sort,setSort]=useState("0"),[enabled,setEnabled]=useState(true);
 const [quota,setQuota]=useState(""),[period,setPeriod]=useState(""),[reason,setReason]=useState(false),[proof,setProof]=useState(false),[error,setError]=useState(""),[editorError,setEditorError]=useState("");
 const [payRatio,setPayRatio]=useState('');
 function refresh(){void apiRequest<Rule[]>("/api/business/hr/settings/leave-types").then(data=>{setRows(data);setLoaded(true)}).catch(e=>setError(e instanceof Error?e.message:String(e)))}
 useEffect(refresh,[]);
 function edit(x:Rule|null){setEditorError("");setEditing(true);setSelected(x);setName(x?.name??"");setCode(x?.code??"");setSort(String(x?.sort_order??0));setEnabled(x?.is_active!==0);setQuota(x?.quota_days==null?"":String(x.quota_days));setPeriod(x?.quota_period??"");setReason(x?.requires_reason===1);setProof(x?.accepts_proof===1);setPayRatio(x?.pay_ratio==null?'':String(x.pay_ratio*100));}
 function close(){setEditing(false);setSelected(null);setEditorError("")}
 async function save(e:FormEvent){e.preventDefault();if(writing.current)return;writing.current=true;setBusy(true);setEditorError("");
  try{await apiRequest("/api/business/hr/settings/leave-types",{method:selected?"PATCH":"POST",json:{id:selected?.id,code,name,sortOrder:Number(sort),isActive:enabled,quotaDays:quota===""?null:Number(quota),quotaPeriod:period||null,requiresReason:reason,acceptsProof:proof,payRatio:payRatio===''?null:Number(payRatio)/100}});
    close();refresh()}catch(e){setEditorError(e instanceof Error?e.message:"假別儲存失敗")}finally{writing.current=false;setBusy(false)}
 }
 const locked=selected?.is_statutory===1;
 const pay=(r:Rule)=>r.is_statutory?'依法':r.pay_ratio==null?'待設定':r.pay_ratio*100+'%';
 return <SettingsPane title="假別" hint="法定假別的名稱與額度依法固定，只能調整排序與啟停。" actionLabel="＋ 新增公司假別" onAction={()=>edit(null)} actionDisabled={busy||editing||!loaded} error={error}>
  <SettingsTable label="假別設定" head={<><th>假別</th><th>類型</th><th className="cy-hrs-num">額度</th><th>期間</th><th>事由</th><th>證明</th><th>給薪</th><th>狀態</th><th/></>} empty={loaded&&!rows.length?"尚無假別。":undefined}>
   {rows.map(row=><tr key={row.id}>
    <td><span className="cy-hrs-code">{row.code}</span>{row.name}</td><td>{row.is_statutory?'法定':'公司'}</td>
    <td className="cy-hrs-num">{row.quota_days==null?'不限':row.quota_days+' 天'}</td><td>{PERIODS[row.quota_period??'']??'不限'}</td>
    <td>{row.requires_reason?'必填':'—'}</td><td>{row.accepts_proof?'接受':'—'}</td><td>{pay(row)}</td><td><ActiveChip active={row.is_active===1}/></td>
    <td className="cy-hrs-actions"><button key="edit" type="button" className="cy-op-button compact" disabled={busy||editing} onClick={()=>edit(row)}>修改</button></td></tr>)}
  </SettingsTable>
  {editing?<SettingsEditor title={selected?"修改假別":"新增公司假別"} size="medium" busy={busy} error={editorError} onClose={close} onSubmit={e=>void save(e)} submitLabel="儲存假別">
   <>
    <Field label="代號" required size="s"><input className="cy-op-input" value={code} onChange={e=>setCode(e.target.value)} disabled={busy||!!selected} maxLength={2}/></Field>
    <Field label="名稱" required size="m"><input className="cy-op-input" value={name} onChange={e=>setName(e.target.value)} disabled={busy||locked}/></Field>
    <Field label="排序" size="s"><input disabled={busy} className="cy-op-input" type="number" value={sort} onChange={e=>setSort(e.target.value)}/></Field>
    <Field label="額度天數" size="s"><input className="cy-op-input" type="number" min="0" step="0.5" value={quota} onChange={e=>setQuota(e.target.value)} disabled={busy||locked}/></Field>
    <Field label="期間" size="s"><select className="cy-op-input" value={period} disabled={busy||locked} onChange={e=>setPeriod(e.target.value)}><option value="">不限</option><option value="calendar_year">每年</option><option value="month">每月</option><option value="event">每事件</option><option value="two_years">近兩年</option></select></Field>
    <Field label="公司假給薪（%）" size="s"><input disabled={busy||locked} className="cy-op-input" type="number" min="0" max="100" step="0.01" value={payRatio} onChange={e=>setPayRatio(e.target.value)}/></Field>
    <CheckField disabled={busy} label="啟用" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>
    <CheckField label="事由必填" checked={reason} disabled={busy||locked} onChange={e=>setReason(e.target.checked)}/>
    <CheckField label="接受JPEG證明" checked={proof} disabled={busy||locked} onChange={e=>setProof(e.target.checked)}/>
   </>
  </SettingsEditor>:null}
 </SettingsPane>;
}
