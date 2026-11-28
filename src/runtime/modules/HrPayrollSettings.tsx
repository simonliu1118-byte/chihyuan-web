import {formatDate,formatDateTime} from '../../ui/foundation/format';
import {HR_OFFICIAL_UPDATE_SCHEDULE} from '../../../shared/hr-official-updates';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {apiRequest} from '../../api/client';
import {useLatestRequest} from '../../ui/foundation/useLatestRequest';
import {Field} from '../../ui/forms/Field';
import {useUnsavedChangesGuard} from '../../ui/foundation/useUnsavedChangesGuard';
import {ActiveChip,SettingsEditor,SettingsPane,SettingsTable} from './HrSettingsPane';
interface Version {id:number;kind:string;effective_date:string;valid_until:string;source_url:string;source_hash:string}
interface State {kind:string;checked_at:string;success_at:string|null;error:string}
interface Grant {id:number;member_id:number;store_id:number;is_active:number;revision:number;employee_no:string;display_name:string;store_name:string}
const ROOT='/api/business/hr',labels:Record<string,string>={labor:'勞保／就保',pension:'勞退',health:'健保',tax:'薪資扣繳',health_supplement:'健保補充保費'};
const message=(e:unknown,fallback:string)=>e instanceof Error?e.message:fallback;

/** 法定級距（手動更新）: refresh state and the loaded official versions. */
export function HrLegalBracketSettings(){
 const [versions,setVersions]=useState<Version[]>([]),[states,setStates]=useState<State[]>([]),[loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');const writing=useRef(false);
 const request=useLatestRequest('payroll-rules');
 async function load(){const ticket=request.begin();const rules=await apiRequest<{versions:Version[];states:State[]}>(ROOT+'/settings/payroll-rules');if(!ticket.current())return;setVersions(rules.versions);setStates(rules.states);setLoaded(true);}
 useEffect(()=>{let active=true;void load().catch(e=>{if(active)setError(message(e,'讀取失敗'));});return()=>{active=false;};},[]);
 async function sync(){if(writing.current)return;writing.current=true;setBusy(true);setError('');
  try{const result=await apiRequest<{kind:string;ok:boolean;message:string}[]>(ROOT+'/settings/payroll-rules',{method:'POST'});setNotice(result.map(r=>(labels[r.kind]??r.kind)+'：'+r.message).join('；'));await load();}
  catch(e){setError(message(e,'設定更新失敗'))}finally{writing.current=false;setBusy(false)}}
 return <SettingsPane title="法定級距" hint={HR_OFFICIAL_UPDATE_SCHEDULE+'（臺灣時間）；薪資依生效日取用版本。'} actionLabel="立即更新" onAction={()=>void sync()} actionDisabled={busy||!loaded} error={error} notice={notice}>
  <SettingsTable label="法定級距更新狀態" head={<><th>項目</th><th>最近檢查</th><th>最近成功</th><th>狀態</th></>} empty={loaded&&!states.length?'尚未檢查過官方表，請按「立即更新」。':undefined}>
   {states.map(s=><tr key={s.kind}><td>{labels[s.kind]}</td><td>{formatDateTime(s.checked_at)}</td><td>{s.success_at?formatDateTime(s.success_at):'尚未成功'}</td><td>{s.error||'正常'}</td></tr>)}
  </SettingsTable>
  <SettingsTable label="法定級距版本" head={<><th>項目</th><th>版本</th><th>生效日</th><th>適用迄日</th><th>官方來源</th></>} empty={loaded&&!versions.length?'尚無法定級距版本，請先按「立即更新」。':undefined}>
   {versions.map(v=><tr key={v.kind+v.id}><td>{labels[v.kind]}</td><td>{v.id}</td><td>{formatDate(v.effective_date)}</td><td>{v.valid_until==='9999-12-31'?'至下次變更':formatDate(v.valid_until)}</td><td><a href={v.source_url} target="_blank" rel="noreferrer">查看官方表</a></td></tr>)}
  </SettingsTable>
 </SettingsPane>;
}

/** 出勤更正授權: the table of grants; 新增授權 opens a dialog; 停用／啟用 asks for a reason in a dialog. */
export function HrCorrectionGrantSettings(){
 const [grants,setGrants]=useState<Grant[]>([]),[members,setMembers]=useState<{id:number;employee_no:string;display_name:string}[]>([]),[stores,setStores]=useState<{id:number;name:string}[]>([]);
 const request=useLatestRequest('correction-grants');const [ready,setReady]=useState(false);
 const [dialog,setDialog]=useState<{kind:'add'}|{kind:'toggle';grant:Grant}|null>(null);
 const [member,setMember]=useState(''),[store,setStore]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[editorError,setEditorError]=useState(''),[notice,setNotice]=useState('');const writing=useRef(false);
 useUnsavedChangesGuard({active:dialog!==null,blocked:busy});
 async function load(){const ticket=request.begin();const [g,options]=await Promise.all([apiRequest<Grant[]>(ROOT+'/settings/attendance-correction-grants'),apiRequest<{members:typeof members;stores:typeof stores}>(ROOT+'/payroll/options')]);if(!ticket.current())return;setReady(true);setGrants(g);setMembers(options.members);setStores(options.stores);}
 useEffect(()=>{let active=true;void load().catch(e=>{if(active)setError(message(e,'讀取失敗'));});return()=>{active=false;};},[]);
 function open(next:NonNullable<typeof dialog>){setMember('');setStore('');setReason('');setEditorError('');setDialog(next)}
 async function submit(e:FormEvent){e.preventDefault();if(!ready||!dialog||writing.current)return;writing.current=true;setBusy(true);setEditorError('');
  try{
   if(dialog.kind==='add'){const previous=grants.find(g=>g.member_id===Number(member)&&g.store_id===Number(store));
    await apiRequest(ROOT+'/settings/attendance-correction-grants',{method:'POST',json:{memberId:Number(member),storeId:Number(store),revision:previous?.revision??0,enabled:true,reason}});setNotice('已保存指定授權；帳號仍須具有管理員角色');}
   else{const g=dialog.grant;await apiRequest(ROOT+'/settings/attendance-correction-grants',{method:'POST',json:{memberId:g.member_id,storeId:g.store_id,revision:g.revision,enabled:g.is_active!==1,reason}});setNotice('');}
   setDialog(null);setReason('');await load();
  }catch(e){setEditorError(message(e,'設定更新失敗'))}finally{writing.current=false;setBusy(false)}}
 return <SettingsPane title="出勤更正授權" hint="指定管理員可更正哪些門市的出勤；帳號仍須具有管理員角色。" actionLabel="＋ 新增授權" onAction={()=>open({kind:'add'})} actionDisabled={busy||!ready} error={error} notice={notice}>
  <SettingsTable label="出勤更正授權" head={<><th>帳號</th><th>門市</th><th>狀態</th><th/></>} empty={ready&&!grants.length?'尚無指定授權。':undefined}>
   {grants.map(g=><tr key={g.id}><td>{g.employee_no} {g.display_name}</td><td>{g.store_name}</td><td><ActiveChip active={g.is_active===1}/></td>
    <td className="cy-hrs-actions"><button key="toggle" type="button" className="cy-op-button compact" disabled={busy||!ready} onClick={()=>open({kind:'toggle',grant:g})}>{g.is_active?'停用':'啟用'}</button></td></tr>)}
  </SettingsTable>
  {dialog?<SettingsEditor title={dialog.kind==='add'?'新增出勤更正授權':(dialog.grant.is_active?'停用授權':'啟用授權')} size="small" busy={busy} error={editorError} onClose={()=>setDialog(null)} onSubmit={e=>void submit(e)} submitLabel={dialog.kind==='add'?'保存指定授權':'確定'}>
   <>
    {dialog.kind==='add'?<>
     <Field label="指定帳號" required size="m"><select disabled={busy} className="cy-op-input" value={member} onChange={e=>setMember(e.target.value)}><option value="">請選擇</option>{members.map(m=><option key={m.id} value={m.id}>{m.employee_no} {m.display_name}</option>)}</select></Field>
     <Field label="可更正門市" required size="m"><select disabled={busy} className="cy-op-input" value={store} onChange={e=>setStore(e.target.value)}><option value="">請選擇</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field></>
     :<p>{dialog.grant.employee_no} {dialog.grant.display_name}｜{dialog.grant.store_name}</p>}
    <Field label="授權／啟停原因" required size="l"><input disabled={busy} className="cy-op-input" value={reason} onChange={e=>setReason(e.target.value)}/></Field>
   </>
  </SettingsEditor>:null}
 </SettingsPane>;
}
