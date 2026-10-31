import {useCallback,useEffect,useRef,useState,type ReactNode} from "react";
import {apiRequest} from "../../api/client";
import {Field,CheckField} from "../../ui/forms/Field";
import {EntryTable,EntryHeading} from "../../ui/forms/EntryTable";
import {IconButton} from "../../ui/actions/IconButton";
import {Dialog} from "../../ui/overlays/Dialog";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {FeedbackBanner,useFeedbackMessage} from "../../ui/feedback/FeedbackProvider";
import {enterAdvancesFields,enterAdvancesThenSubmits} from "../../ui/foundation/enter-advance";
import {StoreOperationHistory} from "./StoreOperationHistory";
import {activeInMonth,shiftMonth,taipeiDate,type MonthlyPage,type MonthlyRow,type MonthlyCell,type MonthlyItem} from "../../../shared/store-monthly";
import "./store-monthly.css";
const ROOT="/api/business/store/monthly";
const call=<T,>(path:string,method="GET",json?:unknown)=>apiRequest<T>(ROOT+path,{method,json});
type Draft={key:string;id?:string;name:string;enabled:boolean;storeIds:string[]};
type SettingsForm={kind:"stores"|"items";version:number;rows:Draft[];requestKey:string};
type DateForm={row:MonthlyRow;item:MonthlyItem;cell:MonthlyCell;value:string;withoutDate:boolean;requestKey:string};
const newDraft=():Draft=>({key:crypto.randomUUID(),name:"",enabled:true,storeIds:[]});
function Glyph({children}:{children:ReactNode}){return <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">{children}</svg>}
const icons={next:<Glyph><circle cx="12" cy="12" r="9"/><path d="m10 8 4 4-4 4"/></Glyph>,check:<Glyph><path d="m5 12 4 4L19 6"/></Glyph>,history:<Glyph><path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7"/><path d="M12 7v5l3 2"/></Glyph>,add:<Glyph><path d="M12 5v14M5 12h14"/></Glyph>,remove:<Glyph><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></Glyph>,up:<Glyph><path d="m6 14 6-6 6 6"/></Glyph>,down:<Glyph><path d="m6 10 6 6 6-6"/></Glyph>};

export function StoreMonthlyTodos(){
 const [data,setData]=useState<MonthlyPage|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[history,setHistory]=useState<string|null>(null),[revision,setRevision]=useState(0);
 const [settings,setSettings]=useState<SettingsForm|null>(null),[date,setDate]=useState<DateForm|null>(null);
 const [message,setMessage,reportError,tone]=useFeedbackMessage<string|null>(null),{confirm,confirmationDialog}=useConfirmation();
 const pages=useRef<string[]>([""]),sequence=useRef(0),mutation=useRef(false);
 const load=useCallback(async()=>{const serial=++sequence.current;setLoading(true);try{
  const result=await Promise.all(pages.current.map(p=>call<MonthlyPage>(p?"?before="+p:"")));if(serial!==sequence.current)return;
  const seen=new Set<string>(),rows=result.flatMap(p=>p.rows).filter(r=>!seen.has(r.id)&&!!seen.add(r.id));setData({...result[0],rows,nextBefore:result.at(-1)!.nextBefore});
 }catch(e){if(serial===sequence.current)reportError(e instanceof Error?e.message:"月度待辦載入失敗")}finally{if(serial===sequence.current)setLoading(false)}},[reportError]);
 useEffect(()=>{void load();return()=>{sequence.current++}},[load]);
 async function run(job:()=>Promise<void>){if(mutation.current)return;mutation.current=true;setBusy(true);try{await job();setRevision(v=>v+1);await load()}catch(e){reportError(e instanceof Error?e.message:"操作失敗")}finally{mutation.current=false;setBusy(false)}}
 function openSettings(kind:SettingsForm["kind"]){if(!data?.canManage)return;const next=shiftMonth(data.currentMonth,1),rows=data.settings[kind].map(s=>({key:s.id,id:s.id,name:s.name,enabled:activeInMonth(s.periods,next),storeIds:"stores" in s?Object.entries(s.stores).filter(([,p])=>activeInMonth(p,next)).map(([id])=>id):[]}));setSettings({kind,version:data.settings.version,rows:rows.length?rows:[newDraft()],requestKey:crypto.randomUUID()})}
 const patchDraft=(key:string,p:Partial<Draft>)=>setSettings(s=>s?{...s,rows:s.rows.map(r=>r.key===key?{...r,...p}:r)}:s);
 function moveDraft(index:number,delta:number){setSettings(s=>{if(!s)return s;const rows=[...s.rows],to=index+delta;if(to<0||to>=rows.length)return s;[rows[index],rows[to]]=[rows[to],rows[index]];return {...s,rows}})}
 function showDate(row:MonthlyRow,item:MonthlyItem,cell:MonthlyCell){setDate({row,item,cell,value:cell.completionDate??taipeiDate(),withoutDate:cell.completed&&!cell.completionDate,requestKey:crypto.randomUUID()})}
 async function saveCell(d:DateForm,completed=true){await call(`/rows/${encodeURIComponent(d.row.id)}/cells/${d.item.id}`,"PATCH",{expectedVersion:d.cell.version,requestKey:d.requestKey,completed,completionDate:completed&&!d.withoutDate?d.value:null});setDate(null);setMessage(completed?"辦理紀錄已儲存":"已取消完成")}
 return <div className="cy-store-monthly"><FeedbackBanner message={message} tone={tone}/>
  <div className="cy-monthly-toolbar"><div>{data?.canManage?<><button type="button" className="cy-op-button" disabled={busy||loading} onClick={()=>openSettings("stores")}>設定門市</button><button type="button" className="cy-op-button" disabled={busy||loading} onClick={()=>openSettings("items")}>設定項目</button></>:null}</div><button type="button" className="cy-op-button" disabled={busy||loading} onClick={()=>void load()}>重新整理</button></div>
  {!data?<p>{loading?"載入月度待辦…":"無法載入月度待辦"}</p>:<>
   <div className="cy-ordering-grid-scroll cy-monthly-scroll"><table className="cy-ordering-grid cy-monthly-table" style={{minWidth:298+data.settings.items.length*88,width:298+data.settings.items.length*88}} aria-label="月度待辦">
    <colgroup><col style={{width:100}}/><col style={{width:144}}/>{data.settings.items.map(i=><col key={i.id} style={{width:88}}/>)}<col style={{width:52}}/></colgroup>
    <thead><tr><th scope="col" className="cy-monthly-month">年月</th><th scope="col" className="cy-monthly-store">門市別</th>{data.settings.items.map((i,n)=><th scope="col" key={i.id} className={n===0?"cy-grid-divider-before":undefined}>{i.name}</th>)}<th scope="col" className="cy-monthly-operations cy-grid-divider-before">操作</th></tr></thead>
    {data.rows.map(row=>{const cells=new Map(row.cells.map(c=>[c.itemId,c]));return <tbody key={row.id}><tr>
     <td className="cy-monthly-month">{row.month.replace("-","/")}</td><td className="cy-monthly-store">{row.storeName}</td>
     {data.settings.items.map((item,n)=>{const cell=cells.get(item.id),editing=date?.row.id===row.id&&date.item.id===item.id;return <td key={item.id} className={"cy-monthly-cell "+(n===0?"cy-grid-divider-before ":"")+(!cell?"cy-monthly-inapplicable":"")} title={!cell?"不適用":undefined} aria-label={!cell?item.name+"：不適用":undefined}>
      {cell?<>{cell.completed&&cell.completionDate?<button type="button" className="cy-store-date-link" disabled={busy||loading} title={"修改辦理日期："+cell.completionDate.replaceAll("-","/")} aria-label={item.name+"辦理日期 "+cell.completionDate.replaceAll("-","/")} onClick={()=>showDate(row,item,cell)}>{cell.completionDate.slice(5).replace("-","/")}</button>:<span className={"cy-monthly-cell-action "+(cell.completed?"is-complete":"")}><IconButton icon={cell.completed?icons.check:icons.next} label={cell.completed?item.name+"已完成（無日期），修改紀錄":"確認辦理："+item.name} disabled={busy||loading} onClick={()=>showDate(row,item,cell)}/></span>}
       {editing?<div className="cy-store-date-popover" role="dialog" aria-label={item.name+"辦理日期"}><form onKeyDown={enterAdvancesThenSubmits} onSubmit={e=>{e.preventDefault();if(date){const d=date;void run(()=>saveCell(d))}}}>
        <CheckField label="無日期" checked={date.withoutDate} onChange={e=>setDate(d=>d?{...d,withoutDate:e.target.checked}:d)}/>
        <Field label="辦理日期" required={!date.withoutDate} size="s"><input className="cy-op-input" type="date" min="0001-01-01" max={taipeiDate()} value={date.withoutDate?"":date.value} disabled={date.withoutDate||busy} onChange={e=>setDate(d=>d?{...d,value:e.target.value}:d)}/></Field>
        <div><button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>setDate(null)}>取消</button><button type="submit" className="cy-op-button compact primary" disabled={busy}>儲存</button></div>
        {cell.completed?<button type="button" className="cy-op-button compact danger" disabled={busy} onClick={()=>void (async()=>{const d=date;if(d&&await confirm({title:"取消完成",description:`${row.month.replace("-","/")} ${row.storeName} ${item.name}`,confirmLabel:"取消完成",cancelLabel:"返回"}))await run(()=>saveCell({...d,requestKey:crypto.randomUUID()},false))})()}>取消完成</button>:null}
       </form></div>:null}
      </>:null}
     </td>})}
     <td className="cy-monthly-operations cy-grid-divider-before"><button type="button" className="cy-op-button compact cy-monthly-history-button" title="展開操作紀錄" aria-label={row.month.replace("-","/")+" "+row.storeName+"操作紀錄"} aria-expanded={history===row.id} aria-controls={"monthly-history-"+row.id} onClick={()=>setHistory(v=>v===row.id?null:row.id)}>{icons.history}</button></td>
    </tr>{history===row.id?<tr id={"monthly-history-"+row.id}><td colSpan={data.settings.items.length+3}><StoreOperationHistory key={revision} path={"/monthly/rows/"+encodeURIComponent(row.id)+"/history"} onError={reportError}/></td></tr>:null}</tbody>})}
    {!data.rows.length?<tbody><tr><td colSpan={data.settings.items.length+3}>{data.canManage?"請先設定門市與項目":"尚無月度待辦"}</td></tr></tbody>:null}
   </table></div>
   {data.nextBefore?<button type="button" className="cy-op-button cy-monthly-more" disabled={loading||busy} onClick={()=>{if(data.nextBefore&&!pages.current.includes(data.nextBefore)){pages.current.push(data.nextBefore);void load()}}}>載入更早月份</button>:null}
  </>}
  {settings&&data?.canManage?<Dialog open title={settings.kind==="stores"?"設定門市":"設定項目"} className="cy-monthly-settings-dialog" onClose={()=>!busy&&setSettings(null)}><form onKeyDown={enterAdvancesFields} onSubmit={e=>{e.preventDefault();const s=settings;void run(async()=>{await call("/settings/"+s.kind,"POST",{expectedVersion:s.version,requestKey:s.requestKey,rows:s.rows.map(r=>({...(r.id?{id:r.id}:{}),name:r.name,enabled:r.enabled,...(s.kind==="items"?{storeIds:r.storeIds}:{})}))});setSettings(null);setMessage("設定已儲存")})}}>
   <EntryTable label={settings.kind==="stores"?"門市設定":"項目設定"} className="cy-monthly-settings-table"><colgroup><col style={{width:settings.kind==="stores"?undefined:180}}/>{settings.kind==="items"?<col/>:null}<col style={{width:64}}/><col style={{width:132}}/></colgroup><thead><tr><th scope="col"><EntryHeading required>{settings.kind==="stores"?"門市名稱":"項目名稱"}</EntryHeading></th>{settings.kind==="items"?<th scope="col">適用門市</th>:null}<th scope="col">啟用</th><th scope="col">操作 <span className="cy-monthly-actions"><IconButton icon={icons.add} label="新增一列" disabled={busy} onClick={()=>setSettings(s=>s?{...s,rows:[...s.rows,newDraft()]}:s)}/></span></th></tr></thead><tbody>
    {settings.rows.map((r,index)=><tr key={r.key}><td><Field label={(settings.kind==="stores"?"門市名稱 ":"項目名稱 ")+(index+1)} required presentation="cell"><input className="cy-ordering-cell" maxLength={60} value={r.name} onChange={e=>patchDraft(r.key,{name:e.target.value})}/></Field></td>
     {settings.kind==="items"?<td><div className="cy-monthly-store-options">{data.settings.stores.map(s=><CheckField key={s.id} label={s.name} checked={r.storeIds.includes(s.id)} onChange={e=>patchDraft(r.key,{storeIds:e.target.checked?[...r.storeIds,s.id]:r.storeIds.filter(id=>id!==s.id)})}/>)}</div></td>:null}
     <td className="cy-monthly-enable"><CheckField label={<span className="cy-visually-hidden">啟用 {r.name||String(index+1)}</span>} checked={r.enabled} onChange={e=>patchDraft(r.key,{enabled:e.target.checked})}/></td>
     <td><div className="cy-monthly-actions"><IconButton icon={icons.up} label={"上移第 "+(index+1)+" 列"} disabled={busy||index===0} onClick={()=>moveDraft(index,-1)}/><IconButton icon={icons.down} label={"下移第 "+(index+1)+" 列"} disabled={busy||index===settings.rows.length-1} onClick={()=>moveDraft(index,1)}/><IconButton icon={icons.remove} label={"刪除第 "+(index+1)+" 列草稿"} disabled={busy||!!r.id} onClick={()=>setSettings(s=>s?{...s,rows:s.rows.filter(x=>x.key!==r.key)}:s)}/><IconButton icon={icons.add} label={"在第 "+(index+1)+" 列下方新增"} disabled={busy} onClick={()=>setSettings(s=>s?{...s,rows:[...s.rows.slice(0,index+1),newDraft(),...s.rows.slice(index+1)]}:s)}/></div></td>
    </tr>)}
   </tbody></EntryTable>
   <p className="cy-monthly-setting-effective">新增當月生效；停用及取消適用門市從次月生效，保留當月與歷史紀錄。</p>
   <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>setSettings(null)}>取消</button><button type="submit" className="cy-op-button primary" disabled={busy}>儲存</button></div>
  </form></Dialog>:null}
  {confirmationDialog}
 </div>;
}
