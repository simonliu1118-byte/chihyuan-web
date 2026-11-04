import {useEffect,useRef,useState} from 'react';
import {apiRequest} from '../../api/client';
import {DataViewToolbar} from '../../ui/data/DataViewToolbar';
import {OpenOnlyToggle} from '../../ui/data/OpenOnlyToggle';
import {ExpandToggle} from '../../ui/data/ExpandToggle';
import {IconButton} from '../../ui/actions/IconButton';
import {Icons} from '../../ui/actions/icons';
import {Field} from '../../ui/forms/Field';
import {EntryTable} from '../../ui/forms/EntryTable';
import {FeedbackBanner} from '../../ui/feedback/FeedbackProvider';
import {Loading} from '../../ui/feedback/Loading';
import {useConfirmation} from '../../ui/overlays/useConfirmation';
import {useUnsavedChangesGuard} from '../../ui/foundation/useUnsavedChangesGuard';
import {enterAdvancesThenSubmits} from '../../ui/foundation/enter-advance';
import {StoreMilestoneButton,StoreMilestoneDateFields} from './store-workflow/StoreMilestoneFields';
import {useStorePagedList} from './store-workflow/useStorePagedList';
import {StoreOperationHistory} from './StoreOperationHistory';
import {EQUIPMENT_LIMITS,type MaintenanceVisit,type EquipmentSnapshot} from '../../../shared/store-equipment';
import {maintenanceWindow,maintenanceMatrixCells,maintenanceVisitVisible,type MaintenanceMatrixCustomer,type MaintenanceMatrixEntry} from '../../../shared/maintenance-matrix';
import {taipeiToday} from '../../../shared/date-input';
import type {StoreHistoryCache} from '../../../shared/store-history';
import './store-equipment.css';
const ROOT='/api/business/store/equipment',keyOf=(row:MaintenanceMatrixCustomer)=>row.customerCode;
const display=(v:string)=>v.replaceAll('-','/');
type Panel={code:string;month:string;entry:MaintenanceMatrixEntry};
type Work={visit:MaintenanceVisit;value:string;note:string;requestKey:string};
/** One row per customer. Monthly cells are a projection of existing schedules, never new records. */
export function StoreMaintenanceMatrix({initialCustomer='',onEquipment}:{initialCustomer?:string;onEquipment:(id:number)=>void}){
 const [today,setToday]=useState(taipeiToday),[focusYear,setFocusYear]=useState<number|null>(null),[q,setQ]=useState(initialCustomer),[openOnly,setOpenOnly]=useState(false);
 const year=focusYear??Number(today.slice(0,4)),window=maintenanceWindow(year);
 const list=useStorePagedList<MaintenanceMatrixCustomer>(ROOT+'/matrix?year='+year+'&q='+encodeURIComponent(q)+'&open='+(openOnly?'1':'0'),keyOf);
 const [expanded,setExpanded]=useState<string|null>(null),[history,setHistory]=useState<string|null>(null),[panel,setPanel]=useState<Panel|null>(null),[work,setWork]=useState<Work|null>(null),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const lock=useRef(false),cache=useRef<StoreHistoryCache>(new Map()),{confirm,confirmationDialog}=useConfirmation({dismissible:false});
 useUnsavedChangesGuard({active:!!work,blocked:busy});
 // Catch month/year rollover locally, including a sleeping browser, without API polling.
 useEffect(()=>{const sync=()=>setToday(taipeiToday()),next=Date.parse(today+'T00:00:00+08:00')+86400000,timer=globalThis.window.setTimeout(sync,Math.max(1000,next-Date.now()));globalThis.window.addEventListener('focus',sync);return()=>{clearTimeout(timer);globalThis.window.removeEventListener('focus',sync)}},[today]);
 function close(){setPanel(null);setWork(null)}
 function begin(v:MaintenanceVisit){setWork({visit:v,value:v.completionDate??(v.completed?'':today),note:v.note,requestKey:crypto.randomUUID()})}
 function show(code:string,month:string,entry:MaintenanceMatrixEntry){if(busy)return;if(panel?.code===code&&panel.month===month&&panel.entry.kind===entry.kind&&panel.entry.day===entry.day){close();return}setPanel({code,month,entry});if(entry.visits.length===1)begin(entry.visits[0]);else setWork(null)}
 function range(next:number|null){close();setExpanded(null);setHistory(null);setFocusYear(next)}
 async function save(completed=true){
  if(!work||lock.current)return;const w=work;lock.current=true;setBusy(true);
  try{const result=await apiRequest<MaintenanceVisit>(ROOT+'/visits/'+w.visit.id,{method:'PUT',json:{expectedVersion:w.visit.version,requestKey:w.requestKey,completed,completionDate:completed?w.value:null,note:w.note}});
   list.setRows(old=>old.flatMap(row=>{if(row.customerCode!==result.customerCode)return [row];const visits=row.visits.map(v=>v.id===result.id?{...result,equipment:[]}:v).filter(v=>maintenanceVisitVisible(v,window.from,window.to));if(openOnly&&!visits.some(v=>!v.completed)||!row.activeMaintenance&&!visits.length)return [];return [{...row,visits}]}));
   cache.current.delete('/equipment/customers/'+encodeURIComponent(result.customerCode)+'/history');setRevision(x=>x+1);close();list.setMessage(completed?'維護紀錄已儲存':'已取消維護登記');
  }catch(e){list.reportError(e instanceof Error?e.message:'儲存失敗')}finally{lock.current=false;setBusy(false)}
 }
 function renderEntry(row:MaintenanceMatrixCustomer,month:string,entry:MaintenanceMatrixEntry,index:number){
  const schedule=entry.visits.map(v=>display(v.month)).join('、'),action=()=>show(row.customerCode,month,entry),selected=panel?.code===row.customerCode&&panel.month===month&&panel.entry.kind===entry.kind&&panel.entry.day===entry.day;
  if(entry.kind==='date')return <StoreMilestoneButton key={entry.kind+entry.day} day={entry.day!} baseYear={month} disabled={busy} label={row.customerName+' '+display(entry.day!)+' 維護資料'} title={'實際：'+display(entry.day!)+'；預計：'+schedule} onClick={action}/>;
  if(entry.kind==='pending'||entry.kind==='overdue')return <span key={entry.kind+index} className={entry.kind==='overdue'?'cy-matrix-overdue':undefined}><IconButton variant="table" icon={entry.kind==='pending'?Icons.circle:Icons.warning} label={row.customerName+' 預計 '+schedule+(entry.kind==='overdue'?'，逾期尚未前往':'，填寫實際日期')} expanded={selected} disabled={busy} onClick={action}/></span>;
  return <button key={entry.kind+index} type="button" className={"cy-store-date-link cy-matrix-reference"+(entry.kind==='moved'?' cy-matrix-moved':'')} disabled={busy} aria-expanded={selected} title={entry.kind==='missing'?'舊維護紀錄未填日期，請補填實際日期':'預計：'+schedule+'；實際：'+display(entry.visits[0].completionDate!)} onClick={action}>{entry.kind==='missing'?'補日':<><span>→</span><span>{Number(entry.targetMonth!.slice(5))}月</span></>}</button>;
 }
 function inspector(row:MaintenanceMatrixCustomer){if(panel?.code!==row.customerCode)return null;return <tr className="cy-matrix-detail"><td colSpan={39}><div className="cy-matrix-panel">
  <div>{row.customerCode} {row.customerName}</div>
  {panel.entry.visits.length>1?<EntryTable label="同日維護資料"><colgroup><col style={{width:90}}/><col style={{width:95}}/><col/><col style={{width:44}}/></colgroup><thead><tr><th>預計年月</th><th>實際日期</th><th>備註</th><th>操作</th></tr></thead><tbody>{panel.entry.visits.map(v=><tr key={v.id}><td>{display(v.month)}</td><td>{v.completionDate?display(v.completionDate):''}</td><td>{v.note}</td><td><IconButton variant="table" icon={Icons.edit} label={'修改預計 '+display(v.month)+' 維護'} disabled={busy} onClick={()=>begin(v)}/></td></tr>)}</tbody></EntryTable>:null}
  {work?<div className="cy-store-date-popover" role="dialog" aria-label="維護日期與備註"><form onKeyDown={enterAdvancesThenSubmits} onSubmit={e=>{e.preventDefault();void save()}}>
   <div>預計 {display(work.visit.month)}</div><StoreMilestoneDateFields label="維護" min="0001-01-01" max={today} value={work.value} withoutDate={false} allowWithoutDate={false} disabled={busy} onChange={p=>setWork(w=>w?{...w,value:p.value??w.value}:w)}/>
   <Field label="備註" size="l"><input className="cy-op-input cy-equipment-visit-note" aria-label="維護備註" maxLength={EQUIPMENT_LIMITS.note} value={work.note} disabled={busy} onChange={e=>setWork(w=>w?{...w,note:e.target.value}:w)}/></Field>
   <div className="cy-store-date-actions">{work.visit.completed?<button type="button" className="cy-op-button compact danger" disabled={busy} onClick={()=>void(async()=>{if(await confirm({title:'取消維護登記？',confirmLabel:'取消登記',cancelLabel:'返回'}))await save(false)})()}>取消登記</button>:null}<button type="button" className="cy-op-button compact" disabled={busy} onClick={close}>取消</button><button type="submit" className="cy-op-button compact primary" disabled={busy}>儲存</button></div>
  </form></div>:<button type="button" className="cy-op-button compact" onClick={close}>收合</button>}
 </div></td></tr>}
 if(!list.loaded)return <Loading/>;
 return <div className="cy-store-orders cy-store-equipment cy-store-maintenance"><FeedbackBanner message={list.message} tone={list.tone}/>
  <DataViewToolbar searchValue={q} onSearchChange={value=>{close();setExpanded(null);setHistory(null);setQ(value)}} searchPlaceholder="搜尋客戶編號、名稱" beforeSearch={<OpenOnlyToggle value={openOnly} openLabel="顯示未完成" onChange={value=>{close();setOpenOnly(value)}}/>} actions={<><button type="button" className="cy-op-button" disabled={busy||year<=2} onClick={()=>range(year-1)}>上一年</button><span>{window.years[0]}–{window.years[2]}</span><button type="button" className="cy-op-button" disabled={busy||year>=9998} onClick={()=>range(year+1)}>下一年</button><button type="button" className="cy-op-button" disabled={busy||focusYear===null} onClick={()=>range(null)}>回到今年</button><button type="button" className="cy-op-button" disabled={busy||list.loading} onClick={()=>{close();void list.load()}}>重新整理</button></>}/>
  {list.loading?<Loading inline/>:null}<div className="cy-ordering-grid-scroll cy-matrix-scroll"><table className="cy-ordering-grid cy-maintenance-matrix" aria-label="三年定期維護表"><colgroup><col style={{width:32}}/><col style={{width:206}}/>{window.months.map(m=><col key={m} style={{width:37}}/>)}<col style={{width:36}}/></colgroup>
   <thead><tr><th rowSpan={2} className="cy-matrix-sequence">項次</th><th rowSpan={2} className="cy-matrix-customer">客戶編號/名稱</th>{window.years.map(y=><th key={y} colSpan={12} className="cy-grid-divider-before">{y}年</th>)}<th rowSpan={2} className="cy-matrix-operations cy-grid-divider-before">操作</th></tr><tr>{window.months.map((m,i)=><th key={m} className={(i%12===0?'cy-grid-divider-before ':'')+(m===today.slice(0,7)?'cy-matrix-current':'')} title={display(m)+(m===today.slice(0,7)?' 本月':'')}>{Number(m.slice(5))}月</th>)}</tr></thead>
   {list.rows.map((row,i)=>{const cells=maintenanceMatrixCells(row.visits,window.months,today),path='/equipment/customers/'+encodeURIComponent(row.customerCode)+'/history';return <tbody key={row.customerCode}><tr><td className="cy-matrix-sequence">{i+1}</td><td className="cy-matrix-customer"><div className="cy-matrix-customer-content"><span><span className="cy-repair-customer-code">{row.customerCode}</span>{row.customerName}</span><ExpandToggle expanded={expanded===row.customerCode} label={row.customerCode+' 出機資料'} onToggle={()=>setExpanded(x=>x===row.customerCode?null:row.customerCode)}/></div></td>{window.months.map((m,n)=><td key={m} data-month={m} className={(n%12===0?'cy-grid-divider-before ':'')+'cy-matrix-month'}><div className="cy-matrix-cell-items">{cells.get(m)!.map((entry,index)=>renderEntry(row,m,entry,index))}</div></td>)}<td className="cy-matrix-operations cy-grid-divider-before"><IconButton variant="table" icon={Icons.history} label={row.customerName+' 維護操作紀錄'} expanded={history===row.customerCode} controls={'matrix-history-'+encodeURIComponent(row.customerCode)} onClick={()=>setHistory(x=>x===row.customerCode?null:row.customerCode)}/></td></tr>
    {inspector(row)}
    {expanded===row.customerCode?<tr className="cy-matrix-detail"><td colSpan={39}><div className="cy-matrix-panel"><EntryTable label="相關出機資料"><thead><tr><th>項次</th><th>銷售日期</th><th>品牌／機型</th><th>數量</th><th>操作</th></tr></thead><tbody>{relatedEquipment(row).map(e=><tr key={e.id}><td>{e.sequence}</td><td>{display(e.saleDate)}</td><td>{[e.brand,e.model].filter(Boolean).join('／')}</td><td>{e.quantity}</td><td><button type="button" className="cy-op-button compact" onClick={()=>onEquipment(e.id)}>查看出機</button></td></tr>)}</tbody></EntryTable></div></td></tr>:null}
    {history===row.customerCode?<tr className="cy-matrix-detail"><td colSpan={39} id={'matrix-history-'+encodeURIComponent(row.customerCode)}><div className="cy-matrix-panel"><StoreOperationHistory key={revision} layout="chain" path={path} cache={cache.current} onError={list.reportError}/></div></td></tr>:null}
   </tbody>})}{!list.rows.length?<tbody><tr><td colSpan={39}>尚無符合條件的維護安排</td></tr></tbody>:null}
  </table></div>{list.cursor!==null?<button type="button" className="cy-op-button" disabled={list.loading} onClick={()=>void list.load(list.cursor!)}>載入更多客戶</button>:null}{confirmationDialog}
 </div>;
}
function relatedEquipment(row:MaintenanceMatrixCustomer):EquipmentSnapshot[]{return [...new Map([...row.visits.flatMap(v=>v.equipment),...row.equipment].map(e=>[e.id,e])).values()]}
