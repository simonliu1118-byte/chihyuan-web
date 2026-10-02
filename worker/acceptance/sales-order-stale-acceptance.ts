import type { SalesWorkOrderDetail, SalesWorkOrderStatusCode } from "../../shared/sales-work-order";
import { SalesWorkOrderPersistence } from "../sales-order/sales-order-persistence";
import { SalesWorkOrderRepository, type SalesWorkOrderRecordState } from "../sales-order/sales-order-repository";
import { SalesWorkOrderService, SalesWorkOrderServiceError } from "../sales-order/sales-order-service";
import { normalizeUpdateSalesWorkOrderRequest } from "../sales-order/sales-order-validation";

/** Captured preflight replays use actual ephemeral D1, never live ERP data. */
export async function acceptSalesOrderStaleAudit(db:D1Database,customerId:number,itemId:number):Promise<void>{
  let reference=0;
  const service=new SalesWorkOrderService(db,{nextReference:async()=>"ACC-SALES-STALE-"+(++reference)});
  const repository=new SalesWorkOrderRepository(db),persistence=new SalesWorkOrderPersistence(db);
  const context={actorMemberId:1,now:"2026-10-02T08:00:00.000Z"};
  const profile={customerId,orderDate:"2026-10-02",operatorEmployeeId:1,lines:[{itemId,quantity:"2",unit:"EA",unitPrice:"1.25",sortOrder:0}]};
  const candidate=await repository.resolveCustomerById(customerId);
  if(!candidate?.customerNo)throw new Error("ACCEPT_SALES_CUSTOMER_MISSING");
  const customer=candidate,customerNo=candidate.customerNo;
  async function state(id:number):Promise<SalesWorkOrderRecordState>{
    const value=await repository.getRecordState(id);
    if(!value)throw new Error("ACCEPT_SALES_STATE_MISSING");
    return value;
  }
  async function snapshot(id:number):Promise<string>{
    const results=await db.batch([
      db.prepare("SELECT * FROM sales_work_orders WHERE id=? ORDER BY id").bind(id),
      db.prepare("SELECT * FROM sales_work_order_items WHERE sales_work_order_id=? ORDER BY id").bind(id),
      db.prepare("SELECT * FROM audit_events WHERE entity_type='sales_work_order' AND entity_key=? ORDER BY id").bind(String(id)),
    ]);
    return JSON.stringify(results.map(row=>row.results));
  }
  async function actions(id:number):Promise<string[]>{
    const rows=await db.prepare("SELECT action FROM audit_events WHERE entity_type='sales_work_order' AND entity_key=? ORDER BY id")
      .bind(String(id)).all<{action:string}>();
    return rows.results.map(row=>row.action);
  }
  async function rejected(id:number,code:string,status:number,operation:()=>Promise<unknown>):Promise<void>{
    const before=await snapshot(id);let caught=false;
    try{await operation();}catch(error){
      if(!(error instanceof SalesWorkOrderServiceError)||error.code!==code||error.status!==status)throw error;
      caught=true;
    }
    if(!caught||await snapshot(id)!==before)throw new Error("ACCEPT_SALES_REJECTION_"+code);
  }
  async function stale(id:number,operation:()=>Promise<boolean>):Promise<void>{
    const before=await snapshot(id);
    if(await operation()||await snapshot(id)!==before)throw new Error("ACCEPT_SALES_STALE_AUDIT_OR_MUTATION");
  }
  async function win(id:number,target:SalesWorkOrderStatusCode,action:string,
    operation:(captured:SalesWorkOrderRecordState)=>Promise<SalesWorkOrderDetail>,
    replay:(captured:SalesWorkOrderRecordState)=>Promise<boolean>):Promise<SalesWorkOrderDetail>{
    const captured=await state(id),before=await actions(id);
    const current=await operation(captured);
    if(current.statusCode!==target||current.revision!==captured.revision+1||JSON.stringify(await actions(id))!==JSON.stringify([...before,action]))throw new Error("ACCEPT_SALES_WINNER_"+action);
    await stale(id,()=>replay(captured));
    await rejected(id,"SALES_WORK_ORDER_REVISION_CONFLICT",409,()=>service.fillOrCorrectErp(id,{customerNo,erpNo:"ACC-ERP-STALE",expectedRevision:captured.revision},context));
    return current;
  }
  async function erp(id:number,erpNo:string):Promise<SalesWorkOrderDetail>{
    const initial=await state(id),target=initial.statusCode==="created"?"issued":initial.statusCode;
    const action=initial.statusCode==="created"?"sales_work_order.erp.filled":"sales_work_order.erp.corrected";
    const input=(value:SalesWorkOrderRecordState)=>({customerNo,erpNo,expectedRevision:value.revision,reason:"isolated ERP reference"});
    const current=await win(id,target,action,value=>service.fillOrCorrectErp(id,input(value),context),value=>persistence.fillOrCorrectErp(value,input(value),customer,context));
    if(current.erpNo!==erpNo||current.customerId!==customerId)throw new Error("ACCEPT_SALES_ERP_REFERENCE");
    return current;
  }
  async function transition(id:number,target:SalesWorkOrderStatusCode,action:string,
    operation:(revision:number)=>Promise<SalesWorkOrderDetail>):Promise<SalesWorkOrderDetail>{
    return win(id,target,action,value=>operation(value.revision),value=>persistence.transition(value,target,action,{expectedRevision:value.revision,reason:null},context));
  }
  const order=await service.create(profile,context);
  await rejected(order.id,"SALES_WORK_ORDER_ERP_CUSTOMER_NOT_FOUND",422,()=>service.fillOrCorrectErp(order.id,{customerNo:"ACCEPT-MISSING",erpNo:"ACC-ERP-001",expectedRevision:order.revision},context));
  await rejected(order.id,"SALES_WORK_ORDER_TRANSITION_NOT_ALLOWED",422,()=>service.markPicked(order.id,{expectedRevision:order.revision},context));
  await erp(order.id,"ACC-ERP-001");
  let current=await erp(order.id,"ACC-ERP-002");
  await rejected(order.id,"SALES_WORK_ORDER_EDIT_NOT_ALLOWED",409,()=>service.updateDraft(order.id,{...profile,expectedRevision:current.revision},context));
  await rejected(order.id,"SALES_WORK_ORDER_DELETE_NOT_ALLOWED",409,()=>service.deleteDraft(order.id,{expectedRevision:current.revision},{...context,allowHardDelete:true}));
  await transition(order.id,"waiting_stock","sales_work_order.waiting_stock",revision=>service.markWaitingStock(order.id,{expectedRevision:revision},context));
  await transition(order.id,"picked","sales_work_order.picked",revision=>service.markPicked(order.id,{expectedRevision:revision},context));
  current=await transition(order.id,"shipped","sales_work_order.shipped",revision=>service.markShipped(order.id,{expectedRevision:revision},context));
  await rejected(order.id,"SALES_WORK_ORDER_TRANSITION_NOT_ALLOWED",403,()=>service.reverseShipment(order.id,{expectedRevision:current.revision},context));
  await transition(order.id,"picked","sales_work_order.shipment.reversed",revision=>service.reverseShipment(order.id,{expectedRevision:revision},{...context,allowShipmentReversal:true}));
  await transition(order.id,"shipped","sales_work_order.shipped",revision=>service.markShipped(order.id,{expectedRevision:revision},context));
  current=await erp(order.id,"ACC-ERP-003");
  current=await transition(order.id,"voided","sales_work_order.voided",revision=>service.voidOrder(order.id,{expectedRevision:revision},context));
  if(current.erpNo!=="ACC-ERP-003"||current.lines.length!==1)throw new Error("ACCEPT_SALES_VOID_RETENTION");
  await rejected(order.id,"SALES_WORK_ORDER_EDIT_NOT_ALLOWED",409,()=>service.fillOrCorrectErp(order.id,{customerNo,erpNo:"ACC-ERP-004",expectedRevision:current.revision},context));

  // Cover direct picking and voiding from every other permitted source state.
  for(const target of ["issued","waiting_stock","picked"] as const){
    const extra=await service.create({...profile,customerId:null,customerName:"Isolated name-only customer"},context);
    if(extra.customerId!==null||extra.customerNoSnapshot!==null)throw new Error("ACCEPT_SALES_NAME_ONLY_LINK");
    await erp(extra.id,"ACC-ERP-"+target);
    if(target==="waiting_stock")await transition(extra.id,target,"sales_work_order.waiting_stock",revision=>service.markWaitingStock(extra.id,{expectedRevision:revision},context));
    if(target==="picked")await transition(extra.id,target,"sales_work_order.picked",revision=>service.markPicked(extra.id,{expectedRevision:revision},context));
    await transition(extra.id,"voided","sales_work_order.voided",revision=>service.voidOrder(extra.id,{expectedRevision:revision},context));
  }
  const draftProfile={...profile,lines:[profile.lines[0],{...profile.lines[0],quantity:"1",sortOrder:1}]};
  const draft=await service.create(draftProfile,context),captured=await state(draft.id);
  await rejected(draft.id,"SALES_WORK_ORDER_DELETE_NOT_ALLOWED",403,()=>service.deleteDraft(draft.id,{expectedRevision:draft.revision},context));
  const editedProfile={...draftProfile,lines:[{...profile.lines[0],quantity:"3"},draftProfile.lines[1]]};
  const input=normalizeUpdateSalesWorkOrderRequest({...editedProfile,expectedRevision:draft.revision});
  const resolved={customer,customerNameOnly:null,itemById:await repository.resolveItems([itemId])};
  const edited=await service.updateDraft(draft.id,{...editedProfile,expectedRevision:draft.revision},context);
  if(edited.revision!==draft.revision+1||edited.lines.length!==2||edited.lines[0]?.quantity!=="3"||(await actions(draft.id)).length!==0)throw new Error("ACCEPT_SALES_DRAFT_UPDATE");
  await stale(draft.id,()=>persistence.updateDraft(draft.id,input,resolved,context));
  await stale(draft.id,()=>persistence.deleteDraft(captured,context));
  const deleteState=await state(draft.id);
  await service.deleteDraft(draft.id,{expectedRevision:edited.revision},{...context,allowHardDelete:true});
  const rows=await db.prepare("SELECT COUNT(*) AS n FROM sales_work_order_items WHERE sales_work_order_id=?").bind(draft.id).first<{n:number}>();
  if(await repository.getDetail(draft.id)!==null||Number(rows?.n)!==0||JSON.stringify(await actions(draft.id))!==JSON.stringify(["sales_work_order.deleted"]))throw new Error("ACCEPT_SALES_DRAFT_DELETE");
  await stale(draft.id,()=>persistence.deleteDraft(deleteState,context));
}
