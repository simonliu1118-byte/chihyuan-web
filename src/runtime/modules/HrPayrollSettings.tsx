import {useEffect,useRef,useState,type FormEvent} from 'react';
import {apiRequest} from '../../api/client';
import {useLatestRequest} from '../../ui/foundation/useLatestRequest';
import {EntryFields} from '../../ui/forms/EntryFields';
import {useUnsavedChangesGuard} from '../../ui/foundation/useUnsavedChangesGuard';
import {enterAdvancesFields} from '../../ui/foundation/enter-advance';
interface Version {id:number;kind:string;effective_date:string;valid_until:string;source_url:string;source_hash:string}
interface State {kind:string;checked_at:string;success_at:string|null;error:string}
interface Grant {id:number;member_id:number;store_id:number;is_active:number;revision:number;employee_no:string;display_name:string;store_name:string}
const ROOT='/api/business/hr',labels:Record<string,string>={labor:'勞保／就保',pension:'勞退',health:'健保',tax:'薪資扣繳'};
export function HrPayrollSettings(){
 const [versions,setVersions]=useState<Version[]>([]),[states,setStates]=useState<State[]>([]),[grants,setGrants]=useState<Grant[]>([]),[members,setMembers]=useState<{id:number;employee_no:string;display_name:string}[]>([]),[stores,setStores]=useState<{id:number;name:string}[]>([]);
 const request=useLatestRequest('payroll-settings');const [ready,setReady]=useState(false);
 const [member,setMember]=useState(''),[store,setStore]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');const writing=useRef(false);
 useUnsavedChangesGuard({active:!!(member||store||reason),blocked:busy});
 async function load(){const ticket=request.begin();setReady(false);const [rules,g,options]=await Promise.all([apiRequest<{versions:Version[];states:State[]}>(ROOT+'/settings/payroll-rules'),apiRequest<Grant[]>(ROOT+'/settings/attendance-correction-grants'),apiRequest<{members:typeof members;stores:typeof stores}>(ROOT+'/payroll/options')]);if(!ticket.current())return;setReady(true);setVersions(rules.versions);setStates(rules.states);setGrants(g);setMembers(options.members);setStores(options.stores);}
 useEffect(()=>{let active=true;void load().catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[]);
 async function run(fn:()=>Promise<void>){if(writing.current)return;writing.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'設定更新失敗');}finally{writing.current=false;setBusy(false);}}
 async function sync(){await run(async()=>{const result=await apiRequest<{kind:string;ok:boolean;message:string}[]>(ROOT+'/settings/payroll-rules',{method:'POST'});setNotice(result.map(r=>(labels[r.kind]??r.kind)+'：'+r.message).join('；'));await load();});}
 async function grant(e:FormEvent){e.preventDefault();if(!ready)return;await run(async()=>{const previous=grants.find(g=>g.member_id===Number(member)&&g.store_id===Number(store));await apiRequest(ROOT+'/settings/attendance-correction-grants',{method:'POST',json:{memberId:Number(member),storeId:Number(store),revision:previous?.revision??0,enabled:true,reason}});setMember('');setStore('');setReason('');setNotice('已保存指定授權；帳號仍須具有管理員角色');await load();});}
 async function toggle(g:Grant){await run(async()=>{await apiRequest(ROOT+'/settings/attendance-correction-grants',{method:'POST',json:{memberId:g.member_id,storeId:g.store_id,revision:g.revision,enabled:g.is_active!==1,reason}});setReason('');await load();});}
 return <>
  {error?<p role="alert" className="cy-op-notice danger">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
  <section className="cy-op-panel"><h3>法定級距與年度更新</h3><p>每天檢查官方資料，按生效日自動導入新版本。來源異常會顯示在此；新表不改寫已確認薪資。</p><button type="button" className="cy-op-button" disabled={busy} onClick={()=>void sync()}>立即檢查官方資料</button>
   <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>項目</th><th>最近檢查</th><th>最近成功</th><th>狀態</th></tr></thead><tbody>{states.map(s=><tr key={s.kind}><td data-label="項目">{labels[s.kind]}</td><td data-label="最近檢查">{s.checked_at}</td><td data-label="最近成功">{s.success_at||'尚未成功'}</td><td data-label="狀態">{s.error||'正常'}</td></tr>)}</tbody></table></div>
   <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>項目</th><th>版本</th><th>生效日</th><th>適用迄日</th><th>官方來源</th></tr></thead><tbody>{versions.map(v=><tr key={v.id}><td data-label="項目">{labels[v.kind]}</td><td data-label="版本">{v.id}</td><td data-label="生效日">{v.effective_date}</td><td data-label="適用迄日">{v.valid_until==='9999-12-31'?'至下次變更':v.valid_until}</td><td data-label="官方來源"><a href={v.source_url} target="_blank" rel="noreferrer">查看官方表</a></td></tr>)}</tbody></table></div>
  </section>
  <section className="cy-op-panel"><h3>指定管理員出勤更正授權</h3><p>僅開放指定門市的下班時間更正；不含薪資與完整人事資料。啟停需填原因，接收者必須具管理員角色才生效。</p>
   <form className="cy-op-form" onKeyDown={enterAdvancesFields} onSubmit={e=>void grant(e)}><EntryFields label="出勤更正授權" columns={3} rows={[
    {label:'指定帳號',required:true,content:<select disabled={busy} className="cy-sheet-input" value={member} onChange={e=>setMember(e.target.value)}><option value="">請選擇</option>{members.map(m=><option key={m.id} value={m.id}>{m.employee_no} {m.display_name}</option>)}</select>},
    {label:'可更正門市',required:true,content:<select disabled={busy} className="cy-sheet-input" value={store} onChange={e=>setStore(e.target.value)}><option value="">請選擇</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>},
    {label:'授權／啟停原因',required:true,content:<input disabled={busy} className="cy-sheet-input" value={reason} onChange={e=>setReason(e.target.value)}/>},
   ]}/><button className="cy-op-button" disabled={busy||!ready}>保存指定授權</button></form>
   <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>帳號</th><th>門市</th><th>狀態</th><th>操作</th></tr></thead><tbody>{grants.map(g=><tr key={g.id}><td data-label="帳號">{g.employee_no} {g.display_name}</td><td data-label="門市">{g.store_name}</td><td data-label="狀態">{g.is_active?'啟用':'停用'}</td><td data-label="操作"><button type="button" className="cy-op-button" disabled={busy||!ready||!reason.trim()} onClick={()=>void toggle(g)}>{g.is_active?'停用':'啟用'}</button></td></tr>)}</tbody></table></div>
  </section>
 </>;
}
