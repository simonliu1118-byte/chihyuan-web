import {useEffect,useRef,useState,type FormEvent} from "react";
import {Field} from "../../ui/forms/Field";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {useUnsavedChangesGuard} from "../../ui/foundation/useUnsavedChangesGuard";
import {apiRequest} from "../../api/client";
import {MAX_ROSTER_NOTE_LENGTH,type RosterTextDefault,type RosterTextKind} from "../../../shared/hr-roster-text";
import {SettingsPane,SettingsTable,SettingsEditor} from "./HrSettingsPane";
import {SETTINGS_SAVED_EVENT} from "./settings-events";
const ROOT="/api/business/hr/settings";
type Store={id:number;name:string;is_active:number};
const labels={note:"備註",rule:"注意事項"};
export function HrRosterTextSettings(){
 const [rows,setRows]=useState<RosterTextDefault[]>([]),[stores,setStores]=useState<Store[]>([]),[loaded,setLoaded]=useState(false);
 const [editing,setEditing]=useState<{id?:number;kind:RosterTextKind}|null>(null),[text,setText]=useState(""),[storeIds,setStoreIds]=useState<number[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[editorError,setEditorError]=useState("");
 const writing=useRef(false),{confirm,confirmationDialog}=useConfirmation();
 useUnsavedChangesGuard({active:editing!==null,blocked:busy});
 async function refresh(){const [r,s]=await Promise.all([apiRequest<RosterTextDefault[]>(ROOT+"/roster-text"),apiRequest<Store[]>(ROOT+"/stores")]);setRows(r);setStores(s);setLoaded(true)}
 useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:"讀取失敗"))},[]);
 function open(kind:RosterTextKind,row?:RosterTextDefault){setEditing({kind,id:row?.id});setText(row?.text??"");setStoreIds(row?.storeIds??[]);setEditorError("")}
 async function save(e:FormEvent){e.preventDefault();if(!editing||writing.current)return;writing.current=true;setBusy(true);setEditorError("");
  try{await apiRequest(ROOT+"/roster-text",{method:editing.id?"PATCH":"POST",json:{...editing,text,storeIds}});setEditing(null);await refresh();window.dispatchEvent(new Event(SETTINGS_SAVED_EVENT))}
  catch(e){setEditorError(e instanceof Error?e.message:"儲存失敗")}finally{writing.current=false;setBusy(false)}
 }
 async function remove(row:RosterTextDefault){if(writing.current||!(await confirm({title:"刪除預設"+labels[row.kind],description:"刪除後不再帶入新的月表，已儲存的月表保留。",confirmLabel:"刪除",confirmTone:"danger"})))return;if(writing.current)return;writing.current=true;setBusy(true);setError("");
  try{await apiRequest(ROOT+"/roster-text?id="+row.id,{method:"DELETE"});await refresh();window.dispatchEvent(new Event(SETTINGS_SAVED_EVENT))}
  catch(e){setError(e instanceof Error?e.message:"刪除失敗")}finally{writing.current=false;setBusy(false)}
 }
 return <SettingsPane title="預設文字" error={error}>
  {confirmationDialog}
  {(["note","rule"] as const).map(kind=><section key={kind} className="cy-hrs-text-section">
   <header className="cy-hrs-pane-head"><div><h3>{labels[kind]}</h3></div><button type="button" className="cy-op-button primary" disabled={!loaded||busy||!!editing} onClick={()=>open(kind)}>＋ 新增{labels[kind]}</button></header>
   <SettingsTable label={"預設"+labels[kind]} head={<><th className="cy-hrs-seq">項次</th><th>文字</th><th>門市</th><th className="cy-hrs-actions">操作</th></>} empty={loaded&&!rows.some(r=>r.kind===kind)?"尚未設定":undefined}>
    {rows.filter(r=>r.kind===kind).map((r,i)=><tr key={r.id}><td className="cy-hrs-seq">{i+1}</td><td className="cy-hrs-text-value">{r.text}</td><td>{r.storeIds.map(id=>stores.find(s=>s.id===id)?.name??String(id)).join("、")}</td><td className="cy-hrs-actions"><button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>open(kind,r)}>修改</button>{" "}<button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void remove(r)}>刪除</button></td></tr>)}
   </SettingsTable>
  </section>)}
  {editing?<SettingsEditor title={(editing.id?"修改":"新增")+labels[editing.kind]} size="medium" busy={busy} error={editorError} onClose={()=>setEditing(null)} onSubmit={e=>void save(e)}>
   <Field label="文字" required size="l">{editing.kind==="note"?<input className="cy-op-input" disabled={busy} maxLength={MAX_ROSTER_NOTE_LENGTH} value={text} onChange={e=>setText(e.target.value)}/>:<textarea className="cy-op-input" disabled={busy} maxLength={3000} value={text} onChange={e=>setText(e.target.value)}/>}</Field>
   <Field label="適用門市" required size="l"><div className="cy-hrs-store-checks">{stores.map(s=><label key={s.id}><input type="checkbox" disabled={busy} checked={storeIds.includes(s.id)} onChange={e=>setStoreIds(old=>e.target.checked?[...old,s.id]:old.filter(id=>id!==s.id))}/>{s.name}</label>)}</div></Field>
  </SettingsEditor>:null}
 </SettingsPane>
}
