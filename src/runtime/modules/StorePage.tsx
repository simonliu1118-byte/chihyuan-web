import {useState} from "react";
import type {CyWebModuleCode} from "../../../shared/modules";
import {StoreStocktake} from "./StoreStocktake";
import {CustomerOrders} from "./StoreCustomerOrders";
import {StoreAfterSales} from "./StoreAfterSales";
import {StoreMonthlyTodos} from "./StoreMonthlyTodos";
import "./store.css";
/** 門市 (user 2026-10-28): tabs like ERP 查詢, no list on the left. 顧客訂購 is the first tab. */
export function StorePage({role,allowedModules}:{role:string;allowedModules:ReadonlySet<CyWebModuleCode>}){
 const canOrders=allowedModules.has("STORE_CUSTOMER_ORDERS");
 const canRepairs=allowedModules.has("STORE_REPAIRS");
 const canStocktake=allowedModules.has("STORE_STOCKTAKE");
 const canMonthly=allowedModules.has("STORE_MONTHLY_TODOS");
 const tabs=[{key:"orders",label:"門市訂購",allowed:canOrders},{key:"repairs",label:"售後維修",allowed:canRepairs},{key:"stocktake",label:"庫存盤點",allowed:canStocktake},{key:"monthly",label:"月度待辦",allowed:canMonthly}] as const;
 const [tab,setTab]=useState<"orders"|"repairs"|"stocktake"|"monthly">(canOrders?"orders":canRepairs?"repairs":canStocktake?"stocktake":"monthly");
 const active=tabs.find(t=>t.key===tab&&t.allowed)?.key??tabs.find(t=>t.allowed)?.key;
 return <section className="cy-store-page">
  <div className="cy-op-tabs" role="tablist" aria-label="門市">
   {tabs.filter(t=>t.allowed).map(t=><button key={t.key} type="button" role="tab" aria-selected={active===t.key} className={active===t.key?"active":undefined} onClick={()=>setTab(t.key)}>{t.label}</button>)}
  </div>
  {active==="orders"?<CustomerOrders/>:active==="repairs"?<StoreAfterSales/>:active==="stocktake"?<StoreStocktake role={role}/>:active==="monthly"?<StoreMonthlyTodos/>:null}
 </section>;
}
