import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {StoreMaintenanceMatrix} from "../../src/runtime/modules/StoreMaintenanceMatrix";
import {StoreEquipmentRecords} from "../../src/runtime/modules/StoreEquipment";
import {FeedbackProvider} from "../../src/ui/feedback/FeedbackProvider";
import "../../src/app.css";
import "../../src/ui/forms.css";
import "../../src/ui/data/data-view.css";
import "../../src/ui/overlays/overlay.css";
import "../../src/ui/mobile/mobile.css";
import "../../src/ui/feedback/toast.css";
const host=document.getElementById("root");
if(!host)throw new Error("WO0230 fixture root missing");
const equipment=new URL(location.href).searchParams.get("view")==="equipment";
createRoot(host).render(<StrictMode><FeedbackProvider><main style={{maxWidth:1440,padding:16,margin:"0 auto"}}>
<header style={{marginBottom:16,borderBottom:"1px solid var(--cy-border)",paddingBottom:12}}>
<h1 style={{fontSize:"1.3rem",margin:0}}>門市｜{equipment?"出機紀錄":"定期維護"}</h1>
<small>WO-0.23.0 · 真實 React 畫面／隔離驗收資料（非正式站）</small>
</header>
{equipment?<StoreEquipmentRecords onVisits={()=>{}}/>:<StoreMaintenanceMatrix onEquipment={()=>{}}/>}
</main></FeedbackProvider></StrictMode>);