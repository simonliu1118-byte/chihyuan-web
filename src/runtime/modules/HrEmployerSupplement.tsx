import {useEffect,useState} from 'react';
import {apiRequest} from '../../api/client';
import {useLatestRequest} from '../../ui/foundation/useLatestRequest';
import {DataViewToolbar} from '../../ui/data/DataViewToolbar';
interface Result {units:string[];statement:null|{month:string;unit:string;income:number;basis:number;rate:number|null;premium:number|null;issues:string[];payments:{id:number;employeeNo:string;name:string;income:number}[];insured:{employeeNo:string;name:string;profileId:number;basis:number}[]}}
export function HrEmployerSupplement({month,refreshToken=0}:{month:string;refreshToken?:number}){
 const [search,setSearch]=useState('');
 const [unit,setUnit]=useState(''),[result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[expanded,setExpanded]=useState(false);const request=useLatestRequest(month+'|'+unit);
 async function load(){const t=request.begin();try{const r=await apiRequest<Result>('/api/business/hr/payroll/employer-supplement?month='+month+'&unit='+encodeURIComponent(unit));if(t.current()){setResult(r);setError('');}}catch(e){if(t.current()){setResult(null);setError(e instanceof Error?e.message:'讀取公司補充保費失敗');}}}
 useEffect(()=>{void load();},[month,unit,refreshToken]);const s=result?.statement;
 return <section className="cy-op-panel"><h3>公司補充保費（給付月）</h3><p>公司負擔獨立彙總，不扣員工。僅含本系統已標記發薪的所得；外部發放須先完整記錄，這份清冊不代表已向健保署申報或繳費。</p>
  <DataViewToolbar searchValue={search} onSearchChange={setSearch} searchLabel="搜尋補充保費來源員工" resultSummary={month+'給付月'} filters={<select aria-label="公司投保單位" className="cy-op-input" value={unit} onChange={e=>setUnit(e.target.value)}><option value="">請選擇投保單位</option>{result?.units.map(u=><option key={u} value={u}>{u}</option>)}</select>} actions={<button type="button" className="cy-op-button" onClick={()=>void load()}>更新清冊</button>}/>
  {error?<p role="alert" className="cy-op-notice danger">{error}</p>:null}
  {s?<><div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>薪資所得總額</th><th>受僱者投保總額</th><th>費率</th><th>公司補充保費</th></tr></thead><tbody><tr><td data-label="薪資所得總額">{s.income.toLocaleString('zh-TW')}</td><td data-label="受僱者投保總額">{s.basis.toLocaleString('zh-TW')}</td><td data-label="費率">{s.rate??'待確認'}%</td><td data-label="公司補充保費"><strong>{s.issues.length?'待確認':s.premium?.toLocaleString('zh-TW')}</strong></td></tr></tbody></table></div>
   {s.issues.map((v,i)=><p key={i} role="alert" className="cy-op-notice danger">{v}</p>)}<button type="button" className="cy-op-button" aria-expanded={expanded} onClick={()=>setExpanded(x=>!x)}>{expanded?'收合':'展開'}來源明細</button>
   {expanded?<><div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>發薪快照</th><th>員工</th><th>計費所得</th></tr></thead><tbody>{s.payments.filter(p=>(p.employeeNo+' '+p.name).includes(search.trim())).map(p=><tr key={p.id}><td data-label="發薪快照">{p.id}</td><td data-label="員工">{p.employeeNo} {p.name}</td><td data-label="計費所得">{p.income}</td></tr>)}</tbody></table></div><div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr><th>員工</th><th>投保設定版本</th><th>投保金額</th></tr></thead><tbody>{s.insured.filter(p=>(p.employeeNo+' '+p.name).includes(search.trim())).map(p=><tr key={p.profileId}><td data-label="員工">{p.employeeNo} {p.name}</td><td data-label="投保設定版本">{p.profileId}</td><td data-label="投保金額">{p.basis}</td></tr>)}</tbody></table></div></>:null}</>:null}
 </section>;
}
