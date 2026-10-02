import { nextEntityIdSql } from "../persistence/entity-id";
import { AuditService } from "../audit/audit-service";
import type { OutsourcingRecordState, OutsourcingItemRef, StockMovementRef } from "./outsourcing-repository";
import type {
  NormalizedOutsourcingProfile,
  NormalizedPriceRequest,
  NormalizedReceiveRequest,
  NormalizedTransitionRequest,
  NormalizedUpdateOutsourcingRequest,
} from "./outsourcing-validation";

export interface OutsourcingMutationContext {
  actorMemberId: number;
  now: string;
  requestId?: string | null;
  allowHardDelete?: boolean;
  allowOutboundCorrection?: boolean;
  allowOutboundCancellation?: boolean;
}

export interface ResolvedOutsourcingPart {
  bomRecipeId: number | null;
  finishedItem: OutsourcingItemRef | null;
  componentItem: OutsourcingItemRef;
  quantityScaled4: number;
  unit: string;
  note: string | null;
  sortOrder: number;
}

export interface ResolvedOutsourcingProfile {
  contractorId: number;
  contractorName: string;
  operatorEmployeeId: number;
  orderDate: string;
  parts: readonly ResolvedOutsourcingPart[];
}

export interface StockMovementPlan {
  contractorId: number;
  itemId: number;
  relatedFinishedItemId: number | null;
  movementType: "outbound_supply" | "receipt_consumption";
  quantityDeltaScaled4: number;
  receiptIdSql?: boolean;
}

export interface ResolvedReceiptItem {
  item: OutsourcingItemRef;
  bomRecipeId: number | null;
  quantityScaled4: number;
  unit: string;
  note: string | null;
  sortOrder: number;
}

export interface ResolvedReceiptPlan {
  input: NormalizedReceiveRequest;
  items: readonly ResolvedReceiptItem[];
  consumptionMovements: readonly StockMovementPlan[];
}

export interface PricingPlanItem {
  item: OutsourcingItemRef;
  pricingUnit: string;
  quantityScaled4: number;
  unitPriceScaled4: number;
  subtotalMoney2: number;
  note: string | null;
  sortOrder: number;
}

export interface ResolvedPricingPlan {
  input: NormalizedPriceRequest;
  items: readonly PricingPlanItem[];
  totalMoney2: number;
}

function assertContext(context: OutsourcingMutationContext): void {
  if (!Number.isInteger(context.actorMemberId) || context.actorMemberId <= 0) throw new Error("OUTSOURCING_MUTATION_ACTOR_REQUIRED");
  if (!context.now || Number.isNaN(Date.parse(context.now))) throw new Error("OUTSOURCING_MUTATION_TIMESTAMP_REQUIRED");
}

function partInsertStatement(
  db: D1Database,
  orderIdSql: string,
  orderIdValues: readonly (string | number)[],
  part: ResolvedOutsourcingPart,
): D1PreparedStatement {
  const offset = orderIdValues.length;
  return db.prepare(`
    INSERT INTO outsourcing_order_parts (
      outsourcing_order_id,bom_recipe_id,finished_item_id,finished_item_no_snapshot,finished_item_name_snapshot,finished_spec_snapshot,
      component_item_id,component_item_no_snapshot,component_item_name_snapshot,component_spec_snapshot,
      quantity,unit_snapshot,note,sort_order
    ) SELECT ${orderIdSql},?${offset+1},?${offset+2},?${offset+3},?${offset+4},?${offset+5},
             ?${offset+6},?${offset+7},?${offset+8},?${offset+9},?${offset+10},?${offset+11},?${offset+12},?${offset+13}
  `).bind(
    ...orderIdValues,
    part.bomRecipeId,
    part.finishedItem?.id ?? null,
    part.finishedItem?.itemNo ?? null,
    part.finishedItem?.itemName ?? null,
    part.finishedItem?.spec ?? null,
    part.componentItem.id,
    part.componentItem.itemNo,
    part.componentItem.itemName,
    part.componentItem.spec,
    part.quantityScaled4,
    part.unit,
    part.note,
    part.sortOrder,
  );
}

export class OutsourcingPersistence {
  private readonly audit: AuditService;

  constructor(private readonly db: D1Database) { this.audit = new AuditService(db); }

  async create(
    outsourcingRef: string,
    resolved: ResolvedOutsourcingProfile,
    context: OutsourcingMutationContext,
  ): Promise<number> {
    assertContext(context);
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`
        INSERT INTO outsourcing_orders(id,
          outsourcing_ref,status_code,operator_employee_id,contractor_id,contractor_name_snapshot,
          order_date,outbound_date,paid_at,paid_by,voided_at,voided_by,
          created_at,created_by,updated_at,updated_by,revision
        ) VALUES(${nextEntityIdSql("outsourcing_orders")}, ?1,'pending_outbound',?2,?3,?4,?5,NULL,NULL,NULL,NULL,NULL,?6,?7,?6,?7,1)
      `).bind(outsourcingRef,resolved.operatorEmployeeId,resolved.contractorId,resolved.contractorName,resolved.orderDate,context.now,context.actorMemberId),
    ];
    resolved.parts.forEach((part)=>statements.push(partInsertStatement(this.db,"(SELECT MAX(id) FROM outsourcing_orders)",[],part)));
    statements.push(this.db.prepare("SELECT MAX(id) AS outsourcing_id FROM outsourcing_orders"));
    const results=await this.db.batch(statements);
    const id=Number((results[results.length-1]?.results?.[0] as {outsourcing_id?:number}|undefined)?.outsourcing_id??0);
    if(!Number.isSafeInteger(id)||id<=0)throw new Error("OUTSOURCING_CREATE_ID_UNAVAILABLE");
    return id;
  }

  async updatePending(
    orderId:number,
    input:NormalizedUpdateOutsourcingRequest,
    resolved:ResolvedOutsourcingProfile,
    context:OutsourcingMutationContext,
  ):Promise<boolean>{
    assertContext(context);
    const gate="EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=? AND revision=? AND status_code='pending_outbound')";
    const statements:D1PreparedStatement[]=[
      this.db.prepare(`DELETE FROM outsourcing_order_parts WHERE outsourcing_order_id=?1 AND ${gate}`).bind(orderId,orderId,input.expectedRevision),
    ];
    resolved.parts.forEach(part=>statements.push(this.db.prepare(`
      INSERT INTO outsourcing_order_parts(
        outsourcing_order_id,bom_recipe_id,finished_item_id,finished_item_no_snapshot,finished_item_name_snapshot,finished_spec_snapshot,
        component_item_id,component_item_no_snapshot,component_item_name_snapshot,component_spec_snapshot,quantity,unit_snapshot,note,sort_order
      ) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14 WHERE ${gate}
    `).bind(orderId,part.bomRecipeId,part.finishedItem?.id??null,part.finishedItem?.itemNo??null,part.finishedItem?.itemName??null,part.finishedItem?.spec??null,part.componentItem.id,part.componentItem.itemNo,part.componentItem.itemName,part.componentItem.spec,part.quantityScaled4,part.unit,part.note,part.sortOrder,orderId,input.expectedRevision)));
    statements.push(this.db.prepare(`UPDATE outsourcing_orders SET operator_employee_id=?1,contractor_id=?2,contractor_name_snapshot=?3,order_date=?4,updated_at=?5,updated_by=?6,revision=revision+1 WHERE id=?7 AND revision=?8 AND status_code='pending_outbound'`).bind(resolved.operatorEmployeeId,resolved.contractorId,resolved.contractorName,resolved.orderDate,context.now,context.actorMemberId,orderId,input.expectedRevision));
    const results=await this.db.batch(statements);
    return Number(results[results.length-1]?.meta?.changes??0)===1;
  }

  async confirmOutbound(
    state:OutsourcingRecordState,
    outboundDate:string,
    movements:readonly StockMovementPlan[],
    input:NormalizedTransitionRequest,
    context:OutsourcingMutationContext,
  ):Promise<boolean>{
    assertContext(context);
    const statements:D1PreparedStatement[]=[this.db.prepare(`UPDATE outsourcing_orders SET status_code='outbound',outbound_date=?1,updated_at=?2,updated_by=?3,revision=revision+1 WHERE id=?4 AND revision=?5 AND status_code='pending_outbound'`).bind(outboundDate,context.now,context.actorMemberId,state.id,state.revision)];
    movements.forEach(m=>statements.push(this.db.prepare(`INSERT INTO contractor_stock_movements(contractor_id,item_id,related_finished_item_id,movement_type,quantity_delta,occurred_at,operator_employee_id,outsourcing_order_id,reason,created_at) SELECT ?1,?2,?3,'outbound_supply',?4,?5,?6,?7,?8,?9 WHERE EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?7 AND revision=?10 AND status_code='pending_outbound')`).bind(m.contractorId,m.itemId,m.relatedFinishedItemId,m.quantityDeltaScaled4,context.now,context.actorMemberId,state.id,input.reason,context.now,state.revision)));
    statements.push(this.audit.prepareRecord({entityType:"outsourcing_order",entityKey:String(state.id),action:"outsourcing.outbound.confirmed",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,statusFrom:"pending_outbound",statusTo:"outbound",metadata:{outboundDate,reason:input.reason??null}}, {sql:"EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=? AND revision=? AND status_code='pending_outbound')",values:[state.id,state.revision]}));
    return this.commitTransition(statements,0);
  }

  async correctOutbound(
    state:OutsourcingRecordState,
    input:NormalizedUpdateOutsourcingRequest,
    resolved:ResolvedOutsourcingProfile,
    activeMovements:readonly StockMovementRef[],
    replacementMovements:readonly StockMovementPlan[],
    reason:string|null,
    context:OutsourcingMutationContext,
  ):Promise<boolean>{
    assertContext(context);
    const statements:D1PreparedStatement[]=[];
    activeMovements.forEach(m=>statements.push(this.db.prepare(`INSERT INTO contractor_stock_movements(contractor_id,item_id,movement_type,quantity_delta,occurred_at,operator_employee_id,outsourcing_order_id,reversal_of_movement_id,reason,created_at) SELECT ?1,?2,'reversal',?3,?4,?5,?6,?7,?8,?4 WHERE EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?6 AND revision=?9 AND status_code='outbound')`).bind(m.contractorId,m.itemId,-m.quantityDeltaScaled4,context.now,context.actorMemberId,state.id,m.id,reason,state.revision)));
    statements.push(this.db.prepare("DELETE FROM outsourcing_order_parts WHERE outsourcing_order_id=?1 AND EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?1 AND revision=?2 AND status_code='outbound')").bind(state.id,state.revision));
    resolved.parts.forEach(part=>statements.push(this.db.prepare(`INSERT INTO outsourcing_order_parts(outsourcing_order_id,bom_recipe_id,finished_item_id,finished_item_no_snapshot,finished_item_name_snapshot,finished_spec_snapshot,component_item_id,component_item_no_snapshot,component_item_name_snapshot,component_spec_snapshot,quantity,unit_snapshot,note,sort_order) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14 WHERE EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?1 AND revision=?15 AND status_code='outbound')`).bind(state.id,part.bomRecipeId,part.finishedItem?.id??null,part.finishedItem?.itemNo??null,part.finishedItem?.itemName??null,part.finishedItem?.spec??null,part.componentItem.id,part.componentItem.itemNo,part.componentItem.itemName,part.componentItem.spec,part.quantityScaled4,part.unit,part.note,part.sortOrder,state.revision)));
    statements.push(this.db.prepare(`UPDATE outsourcing_orders SET operator_employee_id=?1,contractor_id=?2,contractor_name_snapshot=?3,order_date=?4,updated_at=?5,updated_by=?6,revision=revision+1 WHERE id=?7 AND revision=?8 AND status_code='outbound'`).bind(resolved.operatorEmployeeId,resolved.contractorId,resolved.contractorName,resolved.orderDate,context.now,context.actorMemberId,state.id,state.revision));
    replacementMovements.forEach(m=>statements.push(this.db.prepare(`INSERT INTO contractor_stock_movements(contractor_id,item_id,related_finished_item_id,movement_type,quantity_delta,occurred_at,operator_employee_id,outsourcing_order_id,reason,created_at) SELECT ?1,?2,?3,'outbound_supply',?4,?5,?6,?7,?8,?5 WHERE EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?7 AND revision=?9 AND status_code='outbound')`).bind(m.contractorId,m.itemId,m.relatedFinishedItemId,m.quantityDeltaScaled4,context.now,context.actorMemberId,state.id,reason,state.revision)));
    statements.push(this.audit.prepareRecord({entityType:"outsourcing_order",entityKey:String(state.id),action:"outsourcing.outbound.corrected",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,before:{contractorId:state.contractorId,revision:state.revision},after:{contractorId:resolved.contractorId,revision:state.revision+1},metadata:{reason:reason??null}}, {sql:"EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=? AND revision=? AND status_code='outbound')",values:[state.id,state.revision]}));
    return this.commitTransition(statements,activeMovements.length+1+resolved.parts.length);
  }

  async cancelOutbound(state:OutsourcingRecordState,activeMovements:readonly StockMovementRef[],input:NormalizedTransitionRequest,context:OutsourcingMutationContext):Promise<boolean>{
    assertContext(context);const statements:D1PreparedStatement[]=[this.db.prepare(`UPDATE outsourcing_orders SET status_code='voided',voided_at=?1,voided_by=?2,updated_at=?1,updated_by=?2,revision=revision+1 WHERE id=?3 AND revision=?4 AND status_code='outbound'`).bind(context.now,context.actorMemberId,state.id,state.revision)];
    activeMovements.forEach(m=>statements.push(this.db.prepare(`INSERT INTO contractor_stock_movements(contractor_id,item_id,movement_type,quantity_delta,occurred_at,operator_employee_id,outsourcing_order_id,reversal_of_movement_id,reason,created_at) SELECT ?1,?2,'reversal',?3,?4,?5,?6,?7,?8,?4 WHERE EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?6 AND revision=?9 AND status_code='outbound')`).bind(m.contractorId,m.itemId,-m.quantityDeltaScaled4,context.now,context.actorMemberId,state.id,m.id,input.reason,state.revision)));
    statements.push(this.audit.prepareRecord({entityType:"outsourcing_order",entityKey:String(state.id),action:"outsourcing.outbound.cancelled",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,statusFrom:"outbound",statusTo:"voided",metadata:{reason:input.reason??null}}, {sql:"EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=? AND revision=? AND status_code='outbound')",values:[state.id,state.revision]}));
    return this.commitTransition(statements,0);
  }

  async receive(state:OutsourcingRecordState,plan:ResolvedReceiptPlan,context:OutsourcingMutationContext):Promise<boolean>{
    assertContext(context);
    const statements:D1PreparedStatement[]=[
      this.db.prepare(`UPDATE outsourcing_orders SET status_code='received',updated_at=?1,updated_by=?2,revision=revision+1 WHERE id=?3 AND revision=?4 AND status_code='outbound'`).bind(context.now,context.actorMemberId,state.id,state.revision),
      this.db.prepare(`INSERT INTO outsourcing_receipts(outsourcing_order_id,received_date,operator_employee_id,created_at) SELECT ?1,?2,?3,?4 WHERE EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?1 AND revision=?5 AND status_code='outbound')`).bind(state.id,plan.input.receivedDate,plan.input.operatorEmployeeId,context.now,state.revision),
    ];
    plan.items.forEach(item=>statements.push(this.db.prepare(`INSERT INTO outsourcing_receipt_items(receipt_id,item_id,bom_recipe_id,item_no_snapshot,item_name_snapshot,spec_snapshot,quantity,unit_snapshot,note,sort_order) SELECT (SELECT MAX(id) FROM outsourcing_receipts),?1,?2,?3,?4,?5,?6,?7,?8,?9 WHERE EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?10 AND revision=?11 AND status_code='outbound')`).bind(item.item.id,item.bomRecipeId,item.item.itemNo,item.item.itemName,item.item.spec,item.quantityScaled4,item.unit,item.note,item.sortOrder,state.id,state.revision)));
    plan.consumptionMovements.forEach(m=>statements.push(this.db.prepare(`INSERT INTO contractor_stock_movements(contractor_id,item_id,related_finished_item_id,movement_type,quantity_delta,occurred_at,operator_employee_id,outsourcing_order_id,outsourcing_receipt_id,reason,created_at) SELECT ?1,?2,?3,'receipt_consumption',?4,?5,?6,?7,(SELECT MAX(id) FROM outsourcing_receipts),NULL,?5 WHERE EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?7 AND revision=?8 AND status_code='outbound')`).bind(m.contractorId,m.itemId,m.relatedFinishedItemId,m.quantityDeltaScaled4,context.now,plan.input.operatorEmployeeId,state.id,state.revision)));
    statements.push(this.audit.prepareRecord({entityType:"outsourcing_order",entityKey:String(state.id),action:"outsourcing.received",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,statusFrom:"outbound",statusTo:"received",metadata:{receivedDate:plan.input.receivedDate,itemCount:plan.items.length}}, {sql:"EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=? AND revision=? AND status_code='outbound')",values:[state.id,state.revision]}));
    return this.commitTransition(statements,0);
  }

  async cancelReceipt(state:OutsourcingRecordState,receiptSnapshot:unknown,activeMovements:readonly StockMovementRef[],input:NormalizedTransitionRequest,context:OutsourcingMutationContext):Promise<boolean>{
    assertContext(context);const statements:D1PreparedStatement[]=[this.db.prepare(`UPDATE outsourcing_orders SET status_code='outbound',updated_at=?1,updated_by=?2,revision=revision+1 WHERE id=?3 AND revision=?4 AND status_code='received'`).bind(context.now,context.actorMemberId,state.id,state.revision)];
    activeMovements.forEach(m=>statements.push(this.db.prepare(`INSERT INTO contractor_stock_movements(contractor_id,item_id,movement_type,quantity_delta,occurred_at,operator_employee_id,outsourcing_order_id,reversal_of_movement_id,reason,created_at) SELECT ?1,?2,'reversal',?3,?4,?5,?6,?7,?8,?4 WHERE EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?6 AND revision=?9 AND status_code='received')`).bind(m.contractorId,m.itemId,-m.quantityDeltaScaled4,context.now,context.actorMemberId,state.id,m.id,input.reason,state.revision)));
    statements.push(this.audit.prepareRecord({entityType:"outsourcing_order",entityKey:String(state.id),action:"outsourcing.receipt.cancelled",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,statusFrom:"received",statusTo:"outbound",before:receiptSnapshot as never,metadata:{reason:input.reason??null}}, {sql:"EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=? AND revision=? AND status_code='received')",values:[state.id,state.revision]}));
    // Cancelled receipt facts remain in Audit; immutable ledger quantities and
    // reversal links survive removal of the active receipt projection.
    statements.push(this.db.prepare("UPDATE contractor_stock_movements SET outsourcing_receipt_id=NULL WHERE outsourcing_order_id=?1 AND outsourcing_receipt_id IN (SELECT id FROM outsourcing_receipts WHERE outsourcing_order_id=?1) AND EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?1 AND revision=?2 AND status_code='received')").bind(state.id,state.revision));
    statements.push(this.db.prepare("DELETE FROM outsourcing_receipt_items WHERE receipt_id IN (SELECT id FROM outsourcing_receipts WHERE outsourcing_order_id=?1) AND EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?1 AND revision=?2 AND status_code='received')").bind(state.id,state.revision));
    statements.push(this.db.prepare("DELETE FROM outsourcing_receipts WHERE outsourcing_order_id=?1 AND EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?1 AND revision=?2 AND status_code='received')").bind(state.id,state.revision));
    return this.commitTransition(statements,0);
  }

  async price(state:OutsourcingRecordState,plan:ResolvedPricingPlan,context:OutsourcingMutationContext):Promise<boolean>{
    assertContext(context);
    const statements:D1PreparedStatement[]=[
      this.db.prepare(`UPDATE outsourcing_orders SET status_code='priced',updated_at=?1,updated_by=?2,revision=revision+1 WHERE id=?3 AND revision=?4 AND status_code='received'`).bind(context.now,context.actorMemberId,state.id,state.revision),
      this.db.prepare(`INSERT INTO outsourcing_pricings(outsourcing_order_id,priced_date,operator_employee_id,total_amount,created_at,revision) SELECT ?1,?2,?3,?4,?5,1 WHERE EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?1 AND revision=?6 AND status_code='received')`).bind(state.id,plan.input.pricedDate,plan.input.operatorEmployeeId,plan.totalMoney2,context.now,state.revision),
    ];
    plan.items.forEach(item=>statements.push(this.db.prepare(`INSERT INTO outsourcing_pricing_items(pricing_id,item_id,item_no_snapshot,item_name_snapshot,unit_snapshot,quantity,unit_price,subtotal,note,sort_order) SELECT (SELECT MAX(id) FROM outsourcing_pricings),?1,?2,?3,?4,?5,?6,?7,?8,?9 WHERE EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?10 AND revision=?11 AND status_code='received')`).bind(item.item.id,item.item.itemNo,item.item.itemName,item.pricingUnit,item.quantityScaled4,item.unitPriceScaled4,item.subtotalMoney2,item.note,item.sortOrder,state.id,state.revision)));
    statements.push(this.audit.prepareRecord({entityType:"outsourcing_order",entityKey:String(state.id),action:"outsourcing.priced",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,statusFrom:"received",statusTo:"priced",metadata:{pricedDate:plan.input.pricedDate,totalMoney2:plan.totalMoney2,itemCount:plan.items.length}}, {sql:"EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=? AND revision=? AND status_code='received')",values:[state.id,state.revision]}));
    return this.commitTransition(statements,0);
  }

  async cancelPricing(state:OutsourcingRecordState,pricingSnapshot:unknown,input:NormalizedTransitionRequest,context:OutsourcingMutationContext):Promise<boolean>{
    assertContext(context);
    return this.commitTransition([
      this.db.prepare(`UPDATE outsourcing_orders SET status_code='received',updated_at=?1,updated_by=?2,revision=revision+1 WHERE id=?3 AND revision=?4 AND status_code='priced'`).bind(context.now,context.actorMemberId,state.id,state.revision),
      this.audit.prepareRecord({entityType:"outsourcing_order",entityKey:String(state.id),action:"outsourcing.pricing.cancelled",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,statusFrom:"priced",statusTo:"received",before:pricingSnapshot as never,metadata:{reason:input.reason??null}}, {sql:"EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=? AND revision=? AND status_code='priced')",values:[state.id,state.revision]}),
      this.db.prepare("DELETE FROM outsourcing_pricing_items WHERE pricing_id IN (SELECT id FROM outsourcing_pricings WHERE outsourcing_order_id=?1) AND EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?1 AND revision=?2 AND status_code='priced')").bind(state.id,state.revision),
      this.db.prepare("DELETE FROM outsourcing_pricings WHERE outsourcing_order_id=?1 AND EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?1 AND revision=?2 AND status_code='priced')").bind(state.id,state.revision),
    ],0);
  }

  async markPaid(state:OutsourcingRecordState,input:NormalizedTransitionRequest,context:OutsourcingMutationContext):Promise<boolean>{
    assertContext(context);
    return this.commitTransition([
      this.db.prepare(`UPDATE outsourcing_orders SET status_code='paid',paid_at=?1,paid_by=?2,updated_at=?1,updated_by=?2,revision=revision+1 WHERE id=?3 AND revision=?4 AND status_code='priced'`).bind(context.now,context.actorMemberId,state.id,state.revision),
      this.audit.prepareRecord({entityType:"outsourcing_order",entityKey:String(state.id),action:"outsourcing.paid",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,statusFrom:"priced",statusTo:"paid"}, {sql:"EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=? AND revision=? AND status_code='priced')",values:[state.id,state.revision]}),
    ],0);
  }

  async cancelPayment(state:OutsourcingRecordState,input:NormalizedTransitionRequest,context:OutsourcingMutationContext):Promise<boolean>{
    assertContext(context);
    return this.commitTransition([
      this.db.prepare(`UPDATE outsourcing_orders SET status_code='priced',paid_at=NULL,paid_by=NULL,updated_at=?1,updated_by=?2,revision=revision+1 WHERE id=?3 AND revision=?4 AND status_code='paid'`).bind(context.now,context.actorMemberId,state.id,state.revision),
      this.audit.prepareRecord({entityType:"outsourcing_order",entityKey:String(state.id),action:"outsourcing.payment.cancelled",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,statusFrom:"paid",statusTo:"priced",before:{paidAt:state.paidAt},metadata:{reason:input.reason??null}}, {sql:"EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=? AND revision=? AND status_code='paid')",values:[state.id,state.revision]}),
    ],0);
  }

  private async commitTransition(statements:D1PreparedStatement[],masterIndex:number):Promise<boolean>{
    // All child/Audit statements use the original revision/status. D1 batch is atomic;
    // advancing the master last keeps the same gate valid only for this winning batch.
    const [master]=statements.splice(masterIndex,1);
    if(!master)throw new Error("OUTSOURCING_TRANSITION_MASTER_MISSING");
    statements.push(master);
    const results=await this.db.batch(statements);
    return Number(results[results.length-1]?.meta?.changes??0)===1;
  }

  async deletePending(state:OutsourcingRecordState,context:OutsourcingMutationContext):Promise<boolean>{
    assertContext(context);
    const results=await this.db.batch([
      this.audit.prepareRecord({entityType:"outsourcing_order",entityKey:String(state.id),action:"outsourcing.deleted",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,before:{outsourcingRef:state.outsourcingRef,statusCode:state.statusCode,revision:state.revision}}, {sql:"EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=? AND revision=? AND status_code='pending_outbound')",values:[state.id,state.revision]}),
      this.db.prepare("DELETE FROM outsourcing_order_parts WHERE outsourcing_order_id=?1 AND EXISTS(SELECT 1 FROM outsourcing_orders WHERE id=?1 AND revision=?2 AND status_code='pending_outbound')").bind(state.id,state.revision),
      this.db.prepare("DELETE FROM outsourcing_orders WHERE id=?1 AND revision=?2 AND status_code='pending_outbound' RETURNING id").bind(state.id,state.revision),
    ]);return (results[2]?.results?.length ?? 0) === 1;
  }
}
