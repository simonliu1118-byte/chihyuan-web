import type {StoreHistoryCache} from "../../../shared/store-history";
import {Loading} from "../../ui/feedback/Loading";
import {useCallback,useEffect,useRef,useState,type PointerEvent,type RefObject,type CSSProperties} from "react";
import {apiRequest} from "../../api/client";
import {Field,CheckField} from "../../ui/forms/Field";
import {SegmentedControl} from "../../ui/primitives/SegmentedControl";
import {DateInput} from "../../ui/forms/DateInput";
import {EntryTable,EntryHeading} from "../../ui/forms/EntryTable";
import {IconButton} from "../../ui/actions/IconButton";
import {Icons} from "../../ui/actions/icons";
import {Dialog} from "../../ui/overlays/Dialog";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {FeedbackBanner,useFeedbackMessage} from "../../ui/feedback/FeedbackProvider";
import {enterAdvancesFields,enterAdvancesThenSubmits} from "../../ui/foundation/enter-advance";
import {StoreOperationHistory} from "./StoreOperationHistory";
import {activeInMonth,shiftMonth,taipeiDate,scheduleInMonth,scheduleAppliesInMonth,type MonthlyScheduleKind,type MonthlyPage,type MonthlyRow,type MonthlyCell,type MonthlyItem} from "../../../shared/store-monthly";
import "./store-monthly.css";
const ROOT="/api/business/store/monthly";
const call=<T,>(path:string,method="GET",json?:unknown)=>apiRequest<T>(ROOT+path,{method,json});
type Draft={key:string;id?:string;name:string;enabled:boolean;storeIds:string[];note:string;scheduleKind:MonthlyScheduleKind;scheduleMonths:number[]};
type SettingsForm={kind:"stores"|"items";version:number;rows:Draft[];requestKey:string};
type DateForm={row:MonthlyRow;item:MonthlyItem;cell:MonthlyCell;value:string;withoutDate:boolean;requestKey:string};
const newDraft=():Draft=>({key:crypto.randomUUID(),name:"",enabled:true,storeIds:[],note:"",scheduleKind:"ALL",scheduleMonths:[]});
const scheduleOptions=[{value:"ALL",label:"每月"},{value:"ODD",label:"單月"},{value:"EVEN",label:"雙月"},{value:"CUSTOM",label:"自訂"}] as const;
export function monthlyColumnsForWidth(width:number,mobile:boolean,minWidth=96,fixedWidth=296){
 return mobile?3:Math.max(1,Math.floor((width-fixedWidth)/minWidth));
}
function useColumnsPerLine(ref:RefObject<HTMLDivElement|null>,minWidth:number,fixedWidth:number,ready:boolean){
 const [columns,setColumns]=useState(8);
 useEffect(()=>{
  const el=ref.current;if(!el)return;
  const update=()=>setColumns(monthlyColumnsForWidth(el.clientWidth,window.innerWidth<=820,minWidth,fixedWidth));
  update();const observer=new ResizeObserver(update);observer.observe(el);
  window.addEventListener("resize",update);
  return()=>{observer.disconnect();window.removeEventListener("resize",update)};
 },[ref,minWidth,fixedWidth,ready]);
 return columns;
}

export function StoreMonthlyTodos(){
 const [data,setData]=useState<MonthlyPage|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[history,setHistory]=useState<string|null>(null),[revision,setRevision]=useState(0);
 const [dragging,setDragging]=useState<string|null>(null);
 const scrollRef=useRef<HTMLDivElement>(null),columnsPerLine=useColumnsPerLine(scrollRef,96,296,!!data);
 const [settings,setSettings]=useState<SettingsForm|null>(null),[date,setDate]=useState<DateForm|null>(null);
 const [message,setMessage,reportError,tone]=useFeedbackMessage<string|null>(null),{confirm,confirmationDialog}=useConfirmation({dismissible:false});
 const pages=useRef<string[]>([""]),sequence=useRef(0),mutation=useRef(false),historyCache=useRef<StoreHistoryCache>(new Map());
 const load=useCallback(async()=>{const serial=++sequence.current;setLoading(true);try{
  const result=await Promise.all(pages.current.map(p=>call<MonthlyPage>(p?"?before="+p:"")));if(serial!==sequence.current)return;
  const seen=new Set<string>(),rows=result.flatMap(p=>p.rows).filter(r=>!seen.has(r.id)&&!!seen.add(r.id));setData({...result[0],rows,nextBefore:result.at(-1)!.nextBefore});
 }catch(e){if(serial===sequence.current)reportError(e instanceof Error?e.message:"月度待辦載入失敗")}finally{if(serial===sequence.current)setLoading(false)}},[reportError]);
 useEffect(()=>{void load();return()=>{sequence.current++}},[load]);
 async function run(job:()=>Promise<void>,refresh=true){if(mutation.current)return;mutation.current=true;setBusy(true);try{await job();if(refresh){historyCache.current.clear();setRevision(v=>v+1);await load()}}catch(e){reportError(e instanceof Error?e.message:"操作失敗")}finally{mutation.current=false;setBusy(false)}}
 function openSettings(kind:SettingsForm["kind"]){if(!data?.canManage)return;const next=shiftMonth(data.currentMonth,1),rows=data.settings[kind].map(s=>({key:s.id,id:s.id,name:s.name,note:"note" in s?String(s.note??""):"",enabled:activeInMonth(s.periods,next),storeIds:"stores" in s?Object.entries(s.stores).filter(([,p])=>activeInMonth(p,next)).map(([id])=>id):[],scheduleKind:"stores" in s?scheduleInMonth(s,data.currentMonth).kind:"ALL" as const,scheduleMonths:"stores" in s?[...(scheduleInMonth(s,data.currentMonth).months??[])]:[]}));setSettings({kind,version:data.settings.version,rows:rows.length?rows:[newDraft()],requestKey:crypto.randomUUID()})}
 const patchDraft=(key:string,p:Partial<Draft>)=>setSettings(s=>s?{...s,rows:s.rows.map(r=>r.key===key?{...r,...p}:r)}:s);
 function moveDraftTo(key:string,target:string,clientY?:number,rect?:DOMRect){setSettings(s=>{if(!s)return s;const rows=[...s.rows],from=rows.findIndex(r=>r.key===key),to=rows.findIndex(r=>r.key===target);if(from<0||to<0||from===to||rect&&clientY!==undefined&&(from<to?clientY<rect.top+rect.height/2:clientY>rect.top+rect.height/2))return s;const [row]=rows.splice(from,1);rows.splice(to,0,row);return {...s,rows}})}
 function dragDraft(e:PointerEvent<HTMLButtonElement>,key:string){if(!e.currentTarget.hasPointerCapture(e.pointerId))return;const row=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLTableRowElement>("tr[data-monthly-draft]");if(row?.dataset.monthlyDraft)moveDraftTo(key,row.dataset.monthlyDraft,e.clientY,row.getBoundingClientRect())}
 function showDate(row:MonthlyRow,item:MonthlyItem,cell:MonthlyCell){setDate({row,item,cell,value:cell.completionDate??taipeiDate(),withoutDate:cell.completed&&!cell.completionDate,requestKey:crypto.randomUUID()})}
 async function saveCell(d:DateForm,completed=true){const updated=await call<MonthlyCell&{rowId:string}>(`/rows/${encodeURIComponent(d.row.id)}/cells/${d.item.id}`,"PATCH",{expectedVersion:d.cell.version,requestKey:d.requestKey,completed,completionDate:completed&&!d.withoutDate?d.value:null});setData(old=>old?{...old,rows:old.rows.map(row=>row.id!==updated.rowId?row:{...row,cells:row.cells.map(cell=>cell.itemId===updated.itemId&&cell.version<=updated.version?updated:cell)})}:old);historyCache.current.delete("/monthly/rows/"+encodeURIComponent(d.row.id)+"/history");if(history===d.row.id)setRevision(v=>v+1);setDate(null);setMessage(completed?"辦理紀錄已儲存":"已取消完成")}
 function renderCell(row:MonthlyRow,item:MonthlyItem,cell:MonthlyCell|undefined,first:boolean){const editing=date?.row.id===row.id&&date.item.id===item.id;return <td key={item.id} className={"cy-monthly-cell "+(first?"cy-grid-divider-before ":"")+(!cell?"cy-monthly-inapplicable":!cell.completed&&row.month<data!.currentMonth?" cy-monthly-overdue":"")} title={!cell?"不適用":undefined} aria-label={!cell?item.name+"：不適用":undefined}>
      {cell?<><button type="button" className={"cy-store-date-link "+(!cell.completed?"cy-store-register":"cy-store-check")} disabled={busy||loading} title={cell.completionDate?"修改辦理日期："+cell.completionDate.replaceAll("-","/"):undefined} aria-label={!cell.completed?"確認辦理："+item.name:cell.completionDate?item.name+"辦理日期 "+cell.completionDate.replaceAll("-","/"):item.name+"已完成（無日期），修改紀錄"} onClick={()=>showDate(row,item,cell)}>{!cell.completed?"登記":cell.completionDate?<span className="cy-monthly-completed"><span className="cy-monthly-completed-check" aria-hidden="true">✓</span><small className="cy-monthly-completed-date">{(cell.completionDate.slice(0,4)!==row.month.slice(0,4)?cell.completionDate:cell.completionDate.slice(5)).replaceAll("-","/")}</small></span>:"✓"}</button>
       {editing?<div className="cy-store-date-popover" role="dialog" aria-label={item.name+"辦理日期"}><form onKeyDown={enterAdvancesThenSubmits} onSubmit={e=>{e.preventDefault();if(date){const d=date;void run(()=>saveCell(d),false)}}}>
        <div className="cy-store-date-choice"><Field label="辦理日期" required={!date.withoutDate} size="s"><DateInput aria-label="辦理日期" className="cy-op-input" min="0001-01-01" max={taipeiDate()} value={date.withoutDate?"":date.value} disabled={date.withoutDate||busy} onChange={value=>setDate(d=>d?{...d,value}:d)}/></Field><CheckField label="無日期" data-enter-skip="true" checked={date.withoutDate} onChange={e=>setDate(d=>d?{...d,withoutDate:e.target.checked}:d)}/></div>
        <div className="cy-store-date-actions">{cell.completed?<button type="button" className="cy-op-button compact danger cy-monthly-undo" disabled={busy} onClick={()=>void (async()=>{const d=date;if(d&&await confirm({title:"取消完成",description:row.month.replace("-","/")+" "+row.storeName+" "+item.name,confirmLabel:"取消完成",cancelLabel:"返回"}))await run(()=>saveCell({...d,requestKey:crypto.randomUUID()},false))})()}>取消完成</button>:null}<button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>setDate(null)}>取消</button><button type="submit" className="cy-op-button compact primary" disabled={busy}>儲存</button></div>
       </form></div>:null}
      </>:null}
     </td>}
 // First entry shows only the shared Loading (visual guide: 切換模組只顯示 Loading).
 if(!data&&loading)return <Loading/>;
 return <div className="cy-store-monthly"><FeedbackBanner message={message} tone={tone}/>
  <div className="cy-monthly-toolbar"><div>{data?.canManage?<><button type="button" className="cy-op-button" disabled={busy||loading} onClick={()=>openSettings("stores")}>設定門市</button><button type="button" className="cy-op-button" disabled={busy||loading} onClick={()=>openSettings("items")}>設定項目</button></>:null}</div><button type="button" className="cy-op-button" disabled={busy||loading} onClick={()=>void load()}>重新整理</button></div>
  {!data?<p>無法載入月度待辦，請按重新整理。</p>:<>

   <div className="cy-ordering-grid-scroll cy-monthly-scroll" ref={scrollRef}><table className="cy-ordering-grid cy-monthly-table" style={{"--monthly-items":columnsPerLine} as CSSProperties} aria-label="月度待辦">
    <colgroup><col className="cy-monthly-col-month"/><col className="cy-monthly-col-store"/>{Array.from({length:columnsPerLine},(_,i)=><col key={i} className="cy-monthly-col-item"/>)}<col className="cy-monthly-col-ops"/></colgroup>
    <thead><tr><th scope="col" className="cy-monthly-month">年月</th><th scope="col" className="cy-monthly-store">門市別</th><th scope="col" colSpan={columnsPerLine}>待辦項目</th><th scope="col" className="cy-monthly-operations cy-grid-divider-before">操作</th></tr></thead>
    {data.rows.map(row=>{
     const visibleItems=data.settings.items.filter(item=>scheduleAppliesInMonth(item,row.month));
     const groups:MonthlyItem[][]=[];for(let i=0;i<visibleItems.length;i+=columnsPerLine)groups.push(visibleItems.slice(i,i+columnsPerLine));
     if(!groups.length)groups.push([]);
     const cells=new Map(row.cells.map(c=>[c.itemId,c]));
     return <tbody key={row.id} className="cy-monthly-record">
      {groups.flatMap((group,index)=>[
       <tr key={"heading-"+index} className={"cy-monthly-group-heading"+(index?" cy-monthly-group-break":"")}>
        {index===0?<><td className="cy-monthly-month" rowSpan={groups.length*2}>{row.month.replace("-","/")}</td><td className="cy-monthly-store" rowSpan={groups.length*2}>{row.storeName}</td></>:null}
        {group.map((item,n)=><th key={item.id} scope="col" title={item.note||undefined} className={n===0?"cy-grid-divider-before":undefined}>{item.name}</th>)}
        {group.length<columnsPerLine?<th className="cy-monthly-empty" colSpan={columnsPerLine-group.length}>{group.length?"":"本月無適用項目"}</th>:null}
        {index===0?<td className="cy-monthly-operations cy-grid-divider-before" rowSpan={groups.length*2}><IconButton variant="table" icon={Icons.history} label={row.month.replace("-","/")+" "+row.storeName+"操作紀錄"} expanded={history===row.id} controls={"monthly-history-"+row.id} onClick={()=>setHistory(v=>v===row.id?null:row.id)}/></td>:null}
       </tr>,
       <tr key={"cells-"+index} className="cy-monthly-group-cells">
        {group.map((item,n)=>renderCell(row,item,cells.get(item.id),n===0))}
        {group.length<columnsPerLine?<td className="cy-monthly-empty" colSpan={columnsPerLine-group.length}/>:null}
       </tr>
      ])}
      {history===row.id?<tr id={"monthly-history-"+row.id}><td colSpan={columnsPerLine+3}><StoreOperationHistory key={revision} path={"/monthly/rows/"+encodeURIComponent(row.id)+"/history"} layout="chain" onError={reportError} cache={historyCache.current}/></td></tr>:null}
     </tbody>;
    })}
    {!data.rows.length?<tbody><tr><td colSpan={columnsPerLine+3}>{data.canManage?"請先設定門市與項目":"尚無月度待辦"}</td></tr></tbody>:null}
   </table></div>
   {data.nextBefore?<button type="button" className="cy-op-button cy-monthly-more" disabled={loading||busy} onClick={()=>{if(data.nextBefore&&!pages.current.includes(data.nextBefore)){pages.current.push(data.nextBefore);void load()}}}>載入更早月份</button>:null}
  </>}
  {settings&&data?.canManage?<Dialog open dismissible={false} title={settings.kind==="stores"?"設定門市":"設定項目"} className="cy-monthly-settings-dialog" onClose={()=>!busy&&setSettings(null)}><form onKeyDown={enterAdvancesFields} onSubmit={e=>{e.preventDefault();const s=settings;void run(async()=>{await call("/settings/"+s.kind,"POST",{expectedVersion:s.version,requestKey:s.requestKey,rows:s.rows.map(r=>({...(r.id?{id:r.id}:{}),name:r.name,enabled:r.enabled,...(s.kind==="items"?{storeIds:r.storeIds,note:r.note,schedule:{kind:r.scheduleKind,...(r.scheduleKind==="CUSTOM"?{months:r.scheduleMonths}:{})}}:{})}))});setSettings(null);setMessage("設定已儲存")})}}>
   <EntryTable label={settings.kind==="stores"?"門市設定":"項目設定"} className="cy-monthly-settings-table"><colgroup><col style={{width:64}}/><col style={{width:settings.kind==="stores"?undefined:180}}/>{settings.kind==="items"?<><col/><col style={{width:278}}/><col style={{width:"calc(10em + 16px)"}}/></>:null}<col style={{width:88}}/></colgroup><thead><tr><th scope="col">項次</th><th scope="col"><EntryHeading required>{settings.kind==="stores"?"門市名稱":"項目名稱"}</EntryHeading></th>{settings.kind==="items"?<><th scope="col">適用門市</th><th scope="col">週期</th><th scope="col">備註</th></>:null}<th scope="col"><div className="cy-monthly-ops-heading"><span>操作</span><IconButton icon={Icons.add} label="新增一列" disabled={busy} onClick={()=>setSettings(s=>s?{...s,rows:[...s.rows,newDraft()]}:s)}/></div></th></tr></thead><tbody>
    {settings.rows.map((r,index)=><tr key={r.key} data-monthly-draft={r.key} data-dragging={dragging===r.key} data-disabled={!r.enabled}><td><div className="cy-monthly-sequence"><button type="button" className="cy-monthly-drag-handle" aria-label={"拖曳第 "+(index+1)+" 列排序"} title="拖曳排序，也可使用上下方向鍵" disabled={busy} onPointerDown={e=>{if(busy)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);setDragging(r.key)}} onPointerMove={e=>dragDraft(e,r.key)} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);setDragging(null)}} onPointerCancel={()=>setDragging(null)} onKeyDown={e=>{if(e.key!=="ArrowUp"&&e.key!=="ArrowDown")return;e.preventDefault();const target=settings.rows[index+(e.key==="ArrowUp"?-1:1)];if(target)moveDraftTo(r.key,target.key)}}>{Icons.grip}</button><span>{index+1}</span></div></td><td><Field label={(settings.kind==="stores"?"門市名稱 ":"項目名稱 ")+(index+1)} required presentation="cell"><input className="cy-ordering-cell" maxLength={60} value={r.name} onChange={e=>patchDraft(r.key,{name:e.target.value})}/></Field></td>
     {settings.kind==="items"?<><td><div className="cy-monthly-store-options">{data.settings.stores.map(s=><CheckField key={s.id} label={s.name} checked={r.storeIds.includes(s.id)} onChange={e=>patchDraft(r.key,{storeIds:e.target.checked?[...r.storeIds,s.id]:r.storeIds.filter(id=>id!==s.id)})}/>)}</div></td><td><div className="cy-monthly-schedule-options"><SegmentedControl label={"週期 "+(index+1)} options={scheduleOptions} value={r.scheduleKind} onChange={scheduleKind=>patchDraft(r.key,{scheduleKind})} compact/>{r.scheduleKind==="CUSTOM"?<div className="cy-monthly-schedule-months">{Array.from({length:12},(_,month)=><CheckField key={month+1} label={String(month+1)+"月"} checked={r.scheduleMonths.includes(month+1)} onChange={e=>patchDraft(r.key,{scheduleMonths:e.target.checked?[...r.scheduleMonths,month+1]:r.scheduleMonths.filter(m=>m!==month+1)})}/>)}</div>:null}</div></td><td><Field label={"備註 "+(index+1)} presentation="cell"><input className="cy-ordering-cell" maxLength={300} value={r.note} onChange={e=>patchDraft(r.key,{note:e.target.value})}/></Field></td></>:null}
     <td><div className="cy-monthly-actions">{r.id?<button type="button" className="cy-op-button compact" disabled={busy} aria-label={(r.enabled?"停用":"啟用")+"第 "+(index+1)+" 列"} onClick={()=>patchDraft(r.key,{enabled:!r.enabled})}>{r.enabled?"停用":"啟用"}</button>:<IconButton icon={Icons.remove} label={"刪除第 "+(index+1)+" 列草稿"} disabled={busy} onClick={()=>setSettings(s=>s?{...s,rows:s.rows.filter(x=>x.key!==r.key)}:s)}/>}</div></td>
    </tr>)}
   </tbody></EntryTable>
   <p className="cy-monthly-setting-effective">新增及週期變更從當月生效，既有歷史保留；停用及取消適用門市從次月生效。</p>
   <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>setSettings(null)}>取消</button><button type="submit" className="cy-op-button primary" disabled={busy}>儲存</button></div>
  </form></Dialog>:null}
  {confirmationDialog}
 </div>;
}
