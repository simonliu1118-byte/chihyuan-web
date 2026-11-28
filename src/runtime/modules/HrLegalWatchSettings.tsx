import {useEffect,useRef,useState} from "react";
import {apiRequest} from "../../api/client";
import {formatDate,formatDateTime} from "../../ui/foundation/format";
import {useUnsavedChangesGuard} from "../../ui/foundation/useUnsavedChangesGuard";
import {HR_LAW_SOURCES,HR_OFFICIAL_UPDATE_SCHEDULE,type OfficialUpdateState} from "../../../shared/hr-official-updates";
import {SettingsPane,SettingsTable} from "./HrSettingsPane";
const ROOT="/api/business/hr/settings/legal-updates";
export function HrLegalWatchSettings(){
 const [states,setStates]=useState<OfficialUpdateState[]>([]),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const writing=useRef(false);
 useUnsavedChangesGuard({active:false,blocked:busy});
 async function load(){setStates(await apiRequest<OfficialUpdateState[]>(ROOT));setLoaded(true)}
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:"讀取失敗"))},[]);
 async function update(){if(writing.current)return;writing.current=true;setBusy(true);setError("");setNotice("");
  try{const result=await apiRequest<{key:string;ok:boolean;message:string}[]>(ROOT,{method:"POST"});setNotice("已檢查 "+result.filter(x=>x.ok).length+" 個來源；"+result.filter(x=>!x.ok).length+" 個來源未成功。");await load()}
  catch(e){setError(e instanceof Error?e.message:"更新失敗")}finally{writing.current=false;setBusy(false)}
 }
 return <SettingsPane title="人事法規" hint={HR_OFFICIAL_UPDATE_SCHEDULE+"（臺灣時間）；比對官方修正日期，待人工核對，不自動修改計算規則。"} actionLabel="立即更新" onAction={()=>void update()} actionDisabled={!loaded||busy} error={error} notice={notice}>
  <SettingsTable label="人事法規更新狀態" head={<><th>法規</th><th>官方修正日期</th><th>最近檢查</th><th>最近成功</th><th>狀態</th></>}>
   {HR_LAW_SOURCES.map(source=>{const s=states.find(x=>x.key==="law:"+source.key);return <tr key={source.key}><td><a href={source.url} target="_blank" rel="noreferrer">{source.name}</a></td><td>{s?.revision?formatDate(s.revision):"—"}</td><td>{s?.checked_at?formatDateTime(s.checked_at):"尚未檢查"}</td><td>{s?.success_at?formatDateTime(s.success_at):"尚未成功"}</td><td>{s?.error|| (s?.review_required?"待人工核對":s?.success_at?"修正日期未變":"尚未更新")}</td></tr>})}
  </SettingsTable>
 </SettingsPane>
}
