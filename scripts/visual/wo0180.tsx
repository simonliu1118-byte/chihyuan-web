import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {OutsourcingOperationalPage} from "../../src/runtime/modules/OutsourcingOperationalPage";
import {FeedbackProvider} from "../../src/ui/feedback/FeedbackProvider";
import "../../src/app.css";
import "../../src/ui/forms.css";
import "../../src/ui/data/data-view.css";
import "../../src/ui/pickers/entity-picker.css";
import "../../src/ui/overlays/overlay.css";
import "../../src/ui/mobile/mobile.css";
const target=document.getElementById("root");
if(!target)throw new Error("Visual harness root missing");
createRoot(target).render(<StrictMode><FeedbackProvider><main style={{maxWidth:1440,margin:"0 auto",padding:"14px"}}>
<header style={{margin:"0 0 12px",padding:"10px 12px",borderBottom:"1px solid var(--cy-border)"}}>
<h1 style={{fontSize:"1.25rem",margin:0}}>委外／代工</h1>
<small>WO-0.18.0 · 隔離測試資料 · 非正式站</small></header>
<OutsourcingOperationalPage/></main></FeedbackProvider></StrictMode>);