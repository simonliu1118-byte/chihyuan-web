import { OutsourcingRepository, type OutsourcingRecordState } from "../outsourcing/outsourcing-repository";
import { OutsourcingPersistence, type ResolvedReceiptPlan, type ResolvedPricingPlan, type StockMovementPlan } from "../outsourcing/outsourcing-persistence";

/** Replays captured preflight state after a winning batch in isolated acceptance D1. */
export async function acceptOutsourcingStaleEffects(db:D1Database,componentId:number,finishedId:number):Promise<void>{
  const repository=new OutsourcingRepository(db);
  const persistence=new OutsourcingPersistence(db);
  const items=await repository.resolveItems([componentId,finishedId]);
  const componentCandidate=items.get(componentId),finishedCandidate=items.get(finishedId);
  if(!componentCandidate||!finishedCandidate)throw new Error("ACCEPT_OUTSOURCING_REPLAY_ITEMS_MISSING");
  const component=componentCandidate,finished=finishedCandidate;
  const context={actorMemberId:1,now:"2026-10-02T03:00:00.000Z"};
  const profile={contractorId:2001,contractorName:"Acceptance Contractor",operatorEmployeeId:1,
    orderDate:"2026-10-02",parts:[{bomRecipeId:null,finishedItem:finished,componentItem:component,
      quantityScaled4:20000,unit:"EA",note:null,sortOrder:0}]};
  const orderId=await persistence.create("ACC-OUT-STALE-001",profile,context);
  async function state():Promise<OutsourcingRecordState>{
    const value=await repository.getRecordState(orderId);
    if(!value)throw new Error("ACCEPT_OUTSOURCING_REPLAY_STATE_MISSING");
    return value;
  }
  async function snapshot():Promise<string>{
    const statements=[
      db.prepare("SELECT * FROM outsourcing_orders WHERE id=? ORDER BY id").bind(orderId),
      db.prepare("SELECT * FROM outsourcing_order_parts WHERE outsourcing_order_id=? ORDER BY id").bind(orderId),
      db.prepare("SELECT * FROM contractor_stock_movements WHERE outsourcing_order_id=? ORDER BY id").bind(orderId),
      db.prepare("SELECT * FROM outsourcing_receipts WHERE outsourcing_order_id=? ORDER BY id").bind(orderId),
      db.prepare("SELECT * FROM outsourcing_receipt_items WHERE receipt_id IN (SELECT id FROM outsourcing_receipts WHERE outsourcing_order_id=?) ORDER BY id").bind(orderId),
      db.prepare("SELECT * FROM outsourcing_pricings WHERE outsourcing_order_id=? ORDER BY id").bind(orderId),
      db.prepare("SELECT * FROM outsourcing_pricing_items WHERE pricing_id IN (SELECT id FROM outsourcing_pricings WHERE outsourcing_order_id=?) ORDER BY id").bind(orderId),
      db.prepare("SELECT * FROM audit_events WHERE entity_type='outsourcing_order' AND entity_key=? ORDER BY id").bind(String(orderId)),
    ];
    return JSON.stringify((await db.batch(statements)).map(row=>row.results));
  }
  async function auditCount():Promise<number>{
    const value=await db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE entity_type='outsourcing_order' AND entity_key=?")
      .bind(String(orderId)).first<{n:number}>();
    return Number(value?.n??0);
  }
  async function stale(label:string,captured:OutsourcingRecordState,operation:(value:OutsourcingRecordState)=>Promise<boolean>):Promise<void>{
    const before=await snapshot();
    if(await operation(captured))throw new Error("ACCEPT_OUTSOURCING_STALE_CHANGED_"+label);
    if(await snapshot()!==before)throw new Error("ACCEPT_OUTSOURCING_STALE_SIDE_EFFECT_"+label);
  }
  async function pair(label:string,target:string,operation:(value:OutsourcingRecordState)=>Promise<boolean>):Promise<OutsourcingRecordState>{
    const captured=await state(),count=await auditCount();
    if(!await operation(captured))throw new Error("ACCEPT_OUTSOURCING_WINNER_FAILED_"+label);
    const current=await state();
    if(current.statusCode!==target||current.revision!==captured.revision+1)throw new Error("ACCEPT_OUTSOURCING_WINNER_STATE_"+label);
    if(await auditCount()!==count+1)throw new Error("ACCEPT_OUTSOURCING_WINNER_AUDIT_"+label);
    await stale(label,captured,operation);
    return captured;
  }
  const transition=(value:OutsourcingRecordState)=>({expectedRevision:value.revision,effectiveDate:null,reason:"isolated stale acceptance"});
  const supply=(quantity:number):StockMovementPlan[]=>[{contractorId:2001,itemId:component.id,
    relatedFinishedItemId:finished.id,movementType:"outbound_supply",quantityDeltaScaled4:quantity}];
  await pair("confirm","outbound",value=>persistence.confirmOutbound(value,"2026-10-02",supply(20000),transition(value),context));
  const oldSupply=await repository.listActiveMovements(orderId,"outbound_supply");
  const correctedProfile={...profile,parts:[{...profile.parts[0],quantityScaled4:30000}]};
  await pair("correct","outbound",value=>persistence.correctOutbound(value,
    {...correctedProfile,parts:[{bomRecipeId:null,finishedItemId:finished.id,componentItemId:component.id,quantityScaled4:30000,unit:"EA",note:null,sortOrder:0}],expectedRevision:value.revision},
    correctedProfile,oldSupply,supply(30000),"isolated correction",context));
  function receipt(value:OutsourcingRecordState):ResolvedReceiptPlan{
    return {input:{expectedRevision:value.revision,receivedDate:"2026-10-02",operatorEmployeeId:1,items:[{itemId:finished.id,bomRecipeId:null,quantityScaled4:10000,unit:"EA",note:null,sortOrder:0}]},
      items:[{item:finished,bomRecipeId:null,quantityScaled4:10000,unit:"EA",note:null,sortOrder:0}],
      consumptionMovements:[{contractorId:2001,itemId:component.id,relatedFinishedItemId:finished.id,movementType:"receipt_consumption",quantityDeltaScaled4:-10000}]};
  }
  function pricing(value:OutsourcingRecordState):ResolvedPricingPlan{
    return {input:{expectedRevision:value.revision,pricedDate:"2026-10-02",operatorEmployeeId:1},totalMoney2:100,
      items:[{item:finished,pricingUnit:"EA",quantityScaled4:10000,unitPriceScaled4:10000,subtotalMoney2:100,note:null,sortOrder:0}]};
  }
  await pair("receive","received",value=>persistence.receive(value,receipt(value),context));
  await pair("price","priced",value=>persistence.price(value,pricing(value),context));
  await pair("paid","paid",value=>persistence.markPaid(value,transition(value),context));
  await pair("cancel-payment","priced",value=>persistence.cancelPayment(value,transition(value),context));
  const cancelPricing=(value:OutsourcingRecordState)=>persistence.cancelPricing(value,{acceptance:true},transition(value),context);
  const cancelledPrice=await pair("cancel-price","received",cancelPricing);
  await pair("reprice","priced",value=>persistence.price(value,pricing(value),context));
  await stale("cancel-old-price-after-reprice",cancelledPrice,cancelPricing);
  await pair("cancel-reprice","received",cancelPricing);
  const consumed=await repository.listActiveMovements(orderId,"receipt_consumption");
  const cancelReceipt=(value:OutsourcingRecordState)=>persistence.cancelReceipt(value,{acceptance:true,movementIds:consumed.map(m=>m.id)},consumed,transition(value),context);
  const cancelledReceipt=await pair("cancel-receipt","outbound",cancelReceipt);
  const cancelledMovements=await db.prepare("SELECT id,quantity_delta,outsourcing_receipt_id FROM contractor_stock_movements WHERE outsourcing_order_id=? AND movement_type='receipt_consumption'").bind(orderId).all<{id:number;quantity_delta:number;outsourcing_receipt_id:number|null}>();
  if(cancelledMovements.results.length!==1||cancelledMovements.results[0].id!==consumed[0]?.id||cancelledMovements.results[0].quantity_delta!==-10000||cancelledMovements.results[0].outsourcing_receipt_id!==null)throw new Error("ACCEPT_OUTSOURCING_CANCEL_RECEIPT_LEDGER_PRESERVATION");
  await pair("receive-again","received",value=>persistence.receive(value,receipt(value),context));
  await stale("cancel-old-receipt-after-receive",cancelledReceipt,cancelReceipt);
  const newConsumption=await repository.listActiveMovements(orderId,"receipt_consumption");
  await pair("cancel-new-receipt","outbound",value=>persistence.cancelReceipt(value,{acceptance:true},newConsumption,transition(value),context));
  const activeSupply=await repository.listActiveMovements(orderId,"outbound_supply");
  await pair("cancel-outbound","voided",value=>persistence.cancelOutbound(value,activeSupply,transition(value),context));
  const balance=await db.prepare("SELECT SUM(quantity_delta) AS n FROM contractor_stock_movements WHERE outsourcing_order_id=?")
    .bind(orderId).first<{n:number}>();
  if(Number(balance?.n??0)!==0)throw new Error("ACCEPT_OUTSOURCING_REPLAY_FINAL_BALANCE");
}
