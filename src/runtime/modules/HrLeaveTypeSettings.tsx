import {Field,CheckField,FormSection} from "../../ui/forms/Field";
import {useEffect,useState,type FormEvent} from "react";
import {apiRequest} from "../../api/client";
import {enterAdvancesFields} from "../../ui/foundation/enter-advance";
type Rule={id:number;name:string;code:string;is_statutory:number;is_active:number;sort_order:number;quota_days:number|null;quota_period:string|null;merge_into_type_id:number|null;requires_reason:number;accepts_proof:number};
export function HrLeaveTypeSettings(){
 const [rows,setRows]=useState<Rule[]>([]),[selected,setSelected]=useState<Rule|null>(null);
 const [name,setName]=useState(""),[code,setCode]=useState(""),[sort,setSort]=useState("0"),[enabled,setEnabled]=useState(true);
 const [quota,setQuota]=useState(""),[period,setPeriod]=useState(""),[reason,setReason]=useState(false),[proof,setProof]=useState(false),[error,setError]=useState("");
 function refresh(){void apiRequest<Rule[]>("/api/business/hr/settings/leave-types").then(setRows).catch(e=>setError(String(e)))}
 useEffect(refresh,[]);
 function edit(x:Rule|null){setSelected(x);setName(x?.name??"");setCode(x?.code??"");setSort(String(x?.sort_order??0));setEnabled(x?.is_active!==0);setQuota(x?.quota_days==null?"":String(x.quota_days));setPeriod(x?.quota_period??"");setReason(x?.requires_reason===1);setProof(x?.accepts_proof===1)}
 async function save(e:FormEvent){e.preventDefault();setError("");
  try{await apiRequest("/api/business/hr/settings/leave-types",{method:selected?"PATCH":"POST",json:{id:selected?.id,code,name,sortOrder:Number(sort),isActive:enabled,quotaDays:quota===""?null:Number(quota),quotaPeriod:period||null,requiresReason:reason,acceptsProof:proof}});
    edit(null);refresh()}catch(e){setError(e instanceof Error?e.message:"假別儲存失敗")}
 }
 return <section className="cy-op-panel"><h3>假別設定</h3>{error?<p role="alert" className="cy-notice cy-notice-danger">{error}</p>:null}
  <div className="cy-op-table-wrap"><table className="cy-op-table"><thead><tr><th>代號</th><th>假別</th><th>上限（天）</th><th>類型</th><th>狀態</th><th>操作</th></tr></thead><tbody>
   {rows.map(x=><tr key={x.id}><td>{x.code}</td><td>{x.name}</td><td>{x.quota_days??"不限"}</td><td>{x.is_statutory?"法定":"公司"}</td><td>{x.is_active?"啟用":"停用"}</td><td><button type="button" className="cy-op-button" onClick={()=>edit(x)}>編輯</button></td></tr>)}</tbody></table></div>
  <button type="button" className="cy-op-button" onClick={()=>edit(null)}>＋新增公司假別</button>
  {selected!==null||name?<form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={e=>void save(e)}>
    <FormSection>
   <Field label="代號" size="s" required><input className="cy-op-input" value={code} onChange={e=>setCode(e.target.value)} disabled={!!selected} maxLength={2}/></Field>
   <Field label="名稱" size="m" required><input className="cy-op-input" value={name} onChange={e=>setName(e.target.value)} disabled={selected?.is_statutory===1}/></Field>
   <Field label="排序" size="s"><input className="cy-op-input" type="number" value={sort} onChange={e=>setSort(e.target.value)}/></Field>
   <CheckField  label="啟用" size="s"  checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>
   <Field label="額度天數" size="s"><input className="cy-op-input" type="number" min="0" step="0.5" value={quota} onChange={e=>setQuota(e.target.value)} disabled={selected?.is_statutory===1}/></Field>
   <Field label="期間" size="s"><select className="cy-op-input" value={period} disabled={selected?.is_statutory===1} onChange={e=>setPeriod(e.target.value)}><option value="">不限</option><option value="calendar_year">每年</option><option value="month">每月</option><option value="event">每事件</option><option value="two_years">近兩年</option></select></Field>
   <CheckField  label="事由必填" size="s"  checked={reason} disabled={selected?.is_statutory===1} onChange={e=>setReason(e.target.checked)}/>
   <CheckField  label="接受 JPEG 證明" size="s"  checked={proof} disabled={selected?.is_statutory===1} onChange={e=>setProof(e.target.checked)}/>
   <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={()=>{edit(null);setName("")}}>取消</button><button className="cy-op-button primary">儲存假別</button></div>
  
    </FormSection>
  </form>:null}
 </section>;
}
