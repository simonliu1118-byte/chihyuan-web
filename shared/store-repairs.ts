import type {Honorific} from "./store";
import {STORE_PICKUP_OVERDUE_DAYS} from "./store";
import {storeDaysElapsed,withinStoreClosureWindow} from "./store-workflow";
export const STORE_REPAIR_STATUSES=["RECEIVED","INSPECTED","SENT","REPAIRED","NOTIFIED","RETURNED"] as const;
export type StoreRepairStatus=typeof STORE_REPAIR_STATUSES[number];
export const STORE_REPAIR_STEPS=["INSPECTED","SENT","REPAIRED","NOTIFIED","RETURNED"] as const;
export type StoreRepairStep=typeof STORE_REPAIR_STEPS[number];
export const STORE_REPAIR_STATUS_LABELS:Record<StoreRepairStatus,string>={RECEIVED:"收件",INSPECTED:"已檢測",SENT:"送廠維修",REPAIRED:"維修完成",NOTIFIED:"通知",RETURNED:"機器歸還"};
export const STORE_REPAIR_STEP_LABELS:Record<StoreRepairStep,string>={INSPECTED:"檢測",SENT:"送廠",REPAIRED:"完修",NOTIFIED:"通知",RETURNED:"歸還"};
export const STORE_REPAIR_PRODUCTS={LOW_FREQUENCY:"低周波",STEAM:"薰蒸機",INFRARED:"紅外線",BLANKET:"電熱毯",OTHER:"其他"} as const;
export type StoreRepairProductKind=keyof typeof STORE_REPAIR_PRODUCTS;
export const STORE_REPAIR_CARRIERS={SELF:"自送",POST:"郵局",HCT:"新竹",KERRY:"大榮",TCAT:"黑貓"} as const;
export type StoreRepairCarrier=keyof typeof STORE_REPAIR_CARRIERS;
export const STORE_REPAIR_CANCEL_REASONS=["顧客不修（費用考量）","無法維修","顧客取回","其他"] as const;
export const STORE_REPAIR_FACTORY_OVERDUE_DAYS=30;
/** Repair-slip photos per repair (user 2026-11-03). */
export const STORE_REPAIR_PHOTO_LIMIT=3;
/**
 * Printed repair slip (user 2026-11-04): heading, contact lines and notes are the store's own text,
 * kept in the database so the public repository carries no business contact details.
 */
export interface StoreRepairPrintSettings {title:string;contact:string;notes:string;cardTitle:string;cardFooter:string;version:number}
export const STORE_REPAIR_PRINT_LIMITS={title:30,contact:150,contactLines:3,notes:500,noteLines:6,cardTitle:30,cardFooter:300,cardFooterLines:6} as const;
export type StoreRepairInspectResult="GOOD"|"BAD"|"";
export type StoreRepairReturnMethod=""|"PICKUP"|"SHIPPING";
export interface StoreRepair {
 id:number;sequence:number;photoCount?:number;receivedDate:string;customerCode:string;customerName:string;honorific:Honorific;
 mobile:string;phone:string;lineName:string;productKind:StoreRepairProductKind;productText:string;serialNo:string;fault:string;
 purchaseDate:string|null;accessories:string;note:string;status:StoreRepairStatus;inspectResult:StoreRepairInspectResult;inspectProblem:string;
 cancelled:boolean;cancelReason:string;cancelledAt:string|null;sentAt:string|null;notifiedAt:string|null;closedAt:string|null;
 sendCarrier:StoreRepairCarrier|"";sendTracking:string;returnMethod:StoreRepairReturnMethod;returnCarrier:StoreRepairCarrier|"";returnTracking:string;
 dates:Record<StoreRepairStep,string|null>;version:number;createdAt:string;updatedAt:string;
}
export function displayRepairProduct(r:Pick<StoreRepair,"productKind"|"productText">){return r.productKind==="OTHER"?r.productText:STORE_REPAIR_PRODUCTS[r.productKind]+" "+r.productText}
export const canUndoRepairClosure=(r:Pick<StoreRepair,"status"|"closedAt">,now=Date.now())=>r.status==="RETURNED"&&withinStoreClosureWindow(r.closedAt,now);
export function repairOverdue(r:Pick<StoreRepair,"status"|"cancelled"|"sentAt"|"notifiedAt">,now:Date=new Date()):"FACTORY"|"PICKUP"|null{
 if(r.status==="SENT"&&(storeDaysElapsed(r.sentAt,now)??0)>STORE_REPAIR_FACTORY_OVERDUE_DAYS)return "FACTORY";
 if(r.status==="NOTIFIED"&&(storeDaysElapsed(r.notifiedAt,now)??0)>STORE_PICKUP_OVERDUE_DAYS)return "PICKUP";
 return null;
}
/** Cancelled repairs still move through notification and return; sent units require factory receipt first. */
export function nextRepairStep(r:Pick<StoreRepair,"status"|"cancelled"|"inspectResult">):StoreRepairStep|null{
 if(r.status==="RETURNED")return null;
 if(r.status==="RECEIVED")return r.cancelled?"NOTIFIED":"INSPECTED";
 if(r.status==="INSPECTED")return r.cancelled||r.inspectResult==="GOOD"?"NOTIFIED":"SENT";
 if(r.status==="SENT")return "REPAIRED";
 if(r.status==="REPAIRED")return "NOTIFIED";
 return "RETURNED";
}
/** False only for steps that are definitely skipped (shown struck out); undecided steps stay applicable. */
export function repairStepApplicable(r:Pick<StoreRepair,"status"|"cancelled"|"inspectResult"|"sentAt">,step:StoreRepairStep):boolean{
 // Cancelled before inspection: the inspection never happened (not applicable, not ✓).
 if(step==="INSPECTED")return !r.cancelled||r.inspectResult!=="";
 // No factory trip after a good inspection, or after cancelling before sending.
 if(step==="SENT"||step==="REPAIRED")return !(r.inspectResult==="GOOD"||r.cancelled&&!r.sentAt);
 return true;
}

/**
 * History read projection (user 2026-11-04): source events stay whole for rollback and audit, but the
 * list shows only what each step changed — 登記<步驟> with its date and details, and edits as a diff.
 */
export function repairHistoryPresentation<E extends {kind:string;before:Record<string,unknown>;after:Record<string,unknown>}>(e:E):E{
 if(e.kind==="建立")return {...e,before:{},after:{}};
 if(e.kind==="推進"){
  const a=e.after,step=a.status as StoreRepairStep,col:Record<StoreRepairStep,string>={INSPECTED:"inspected_date",SENT:"sent_date",REPAIRED:"repaired_date",NOTIFIED:"notified_date",RETURNED:"returned_date"};
  const out:Record<string,unknown>={date:a[col[step]]??null};
  if(a.inspect_result)out.inspectResult=a.inspect_result==="BAD"?"異常":"無異常";
  if(a.inspect_problem)out.inspectProblem=a.inspect_problem;
  const carrier=a.send_carrier??a.return_carrier;if(carrier)out.carrier=STORE_REPAIR_CARRIERS[carrier as StoreRepairCarrier]??carrier;
  const tracking=a.send_tracking??a.return_tracking;if(tracking)out.tracking=tracking;
  if(a.return_method)out.returnMethod=a.return_method==="SHIPPING"?"寄送":"自取";
  return {...e,kind:STORE_REPAIR_STEP_LABELS[step]?"登記"+STORE_REPAIR_STEP_LABELS[step]:e.kind,before:{},after:out};
 }
 const keys=Object.keys(e.after).filter(k=>JSON.stringify(e.before[k])!==JSON.stringify(e.after[k]));
 return {...e,before:Object.fromEntries(keys.map(k=>[k,e.before[k]])),after:Object.fromEntries(keys.map(k=>[k,e.after[k]]))};
}
