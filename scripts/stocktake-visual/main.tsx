/** Local-only UI fixture. Nothing here calls Cloudflare, a real Worker or ERP. */
import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {FeedbackProvider} from "../../src/ui/feedback/FeedbackProvider";
import {StoreStocktake} from "../../src/runtime/modules/StoreStocktake";
import "../../src/app.css";
import "../../src/ui/forms.css";
import "../../src/ui/overlays/overlay.css";
import "../../src/runtime/modules/store.css";

type Scene = "counting"|"recounting"|"failed";
const params=new URL(location.href).searchParams;
const raw=params.get("scene");
const scene:Scene=raw==="recounting"||raw==="failed"?raw:"counting";
document.documentElement.setAttribute("data-cy-theme","light");
document.body.style.margin="0";
document.body.style.background="var(--cy-bg)";
document.body.style.color="var(--cy-text)";

const stamps="2026-10-28T08:20:00Z";
const status=scene==="counting"?"COUNTING":scene==="recounting"?"RECOUNTING":"WRITE_FAILED";
const sheet={
 sheetNo:"990001",sheetDate:"2026-10-28",status,version:9,detailReadAt:stamps,
 firstConfirmedAt:scene==="counting"?null:stamps,
 secondConfirmedAt:scene==="failed"?stamps:null,erpConfirmedAt:null,
 writeQueryId:scene==="failed"?"synthetic-failed-write":null,
 writeResult:scene==="failed"?{
    results:[{key:"00001",ok:false,erpSeq:"00001",message:"ERP 庫存與盤點數量不一致"}],
    mismatches:[{key:"00001",seq:"00001",itemCode:"X0001",batch:"A1",expected:"3",actual:"1"}]
 }:null,total:3,counted:scene==="counting"?3:3,recountNeeded:scene==="counting"?3:2
};
const base=[
 {lineKey:"00001",seq:"00001",itemCode:"X0001",itemName:"合成草本商品甲",batch:"A1",
  spec:"60入／盒",location:"A-01",warehouseName:"測試倉",unit:"盒",bookQty:"2",
  firstQty:"3",recountQty:scene==="counting"?null:"3",locked:false},
 {lineKey:"00002",seq:"00002",itemCode:"X0001",itemName:"合成草本商品甲",batch:"A2",
  spec:"60入／盒",location:"A-01",warehouseName:"測試倉",unit:"盒",bookQty:"1",
  firstQty:"1",recountQty:scene==="counting"?null:"1",locked:false},
 {lineKey:"00003",seq:"00003",itemCode:"X0002",itemName:"合成草本商品乙",batch:"",
  spec:"100ml",location:"B-03",warehouseName:"測試倉",unit:"瓶",bookQty:"5",
  firstQty:"5",recountQty:null,locked:scene!=="counting"}
];
const lines=base.map((line)=>({
 sheetNo:sheet.sheetNo,...line,
 ...(scene==="counting"?{bookQty:undefined}:{}),
 isAdded:false,erpSeq:null,
 firstBy:1,firstByName:"測試盤點員甲",firstAt:stamps,
 recountBy:scene==="counting"?null:1,
 recountByName:scene==="counting"?null:"測試盤點員乙",
 recountAt:scene==="counting"?null:stamps,version:1
}));
const wrapper=(data:unknown)=>Response.json({ok:true,data,requestId:"synthetic-stocktake-visual"});
const fetchOriginal=window.fetch.bind(window);
window.fetch=(async (input:RequestInfo|URL,init?:RequestInit)=>{
 const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;
 if(url.startsWith("/api/")){
   const u=new URL(url,location.origin);
   if(u.pathname==="/api/erp/item-queries/recent")return wrapper([]);
   if(u.pathname==="/api/business/store/stocktake")return wrapper(
      u.searchParams.has("ignored")?[]:[sheet]);
   if(u.pathname==="/api/business/store/stocktake/990001")return wrapper({sheet,lines});
   return Response.json({ok:false,error:{code:"VISUAL_READ_ONLY",message:"此測試頁禁止進行寫入"},
      requestId:"synthetic-stocktake-visual"},{status:403});
 }
 return fetchOriginal(input,init);
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(
 <StrictMode><FeedbackProvider>
  <main style={{width:"100%",maxWidth:1600,margin:"0 auto",padding:"16px",boxSizing:"border-box"}}>
   <header style={{padding:"10px 16px",background:"var(--cy-surface)",border:"1px solid var(--cy-border)",
      borderRadius:8,marginBottom:12,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
     <strong>志遠管理系統 CY Web</strong><span>業務模組／門市</span>
     <small style={{marginLeft:"auto",color:"var(--cy-text-muted)"}}>WO-0.9.52 合成資料視覺驗收</small>
   </header>
   <section className="cy-store-page">
    <div className="cy-op-tabs" role="tablist" aria-label="門市">
      <button className="active" role="tab" aria-selected="true">庫存盤點</button>
    </div>
    <StoreStocktake role="ADMIN"/>
   </section>
  </main>
 </FeedbackProvider></StrictMode>
);
