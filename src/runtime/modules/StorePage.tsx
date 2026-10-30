import {useState} from "react";
import type {CyWebModuleCode} from "../../../shared/modules";
import {StoreStocktake} from "./StoreStocktake";
import {CustomerOrders} from "./StoreCustomerOrders";
import "./store.css";
/** 門市 (user 2026-10-28): tabs like ERP 查詢, no list on the left. 顧客訂購 is the first tab. */
export function StorePage({role,allowedModules}:{role:string;allowedModules:ReadonlySet<CyWebModuleCode>}){
 const canOrders=allowedModules.has("STORE_CUSTOMER_ORDERS");
 const canStocktake=allowedModules.has("STORE_STOCKTAKE");
 const [tab,setTab]=useState<"orders"|"stocktake">(canOrders?"orders":"stocktake");
 const active=tab==="orders"&&!canOrders?"stocktake":tab==="stocktake"&&!canStocktake?"orders":tab;
 return <section className="cy-store-page">
  <div className="cy-op-tabs" role="tablist" aria-label="門市">
   {canOrders?<button type="button" role="tab" aria-selected={active==="orders"} className={active==="orders"?"active":undefined}
      onClick={()=>setTab("orders")}>顧客訂購</button>:null}
   {canStocktake?<button type="button" role="tab" aria-selected={active==="stocktake"} className={active==="stocktake"?"active":undefined}
      onClick={()=>setTab("stocktake")}>庫存盤點</button>:null}
  </div>
  {active==="orders"&&canOrders?<CustomerOrders/>:canStocktake?<StoreStocktake role={role}/>:null}
 </section>;
}
