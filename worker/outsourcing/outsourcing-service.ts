import type {
  ContractorStockBalance,
  OutsourcingDetail,
  OutsourcingListResult,
  OutsourcingSearchQuery,
  OutsourcingStatusCode,
} from "../../shared/contractor-outsourcing";
import { FieldValidationError } from "../validation/fields";
import {
  convertScaled4Exact,
  scaled4ProductToMoney2Exact,
} from "../item/unit-conversion";
import {
  OutsourcingPersistence,
  type OutsourcingMutationContext,
  type PricingPlanItem,
  type ResolvedOutsourcingPart,
  type ResolvedOutsourcingProfile,
  type ResolvedPricingPlan,
  type ResolvedReceiptItem,
  type ResolvedReceiptPlan,
  type StockMovementPlan,
} from "./outsourcing-persistence";
import {
  OutsourcingRepository,
  type BomRef,
  type OutsourcingItemRef,
  type OutsourcingRecordState,
} from "./outsourcing-repository";
import {
  normalizeCreateOutsourcingRequest,
  normalizePriceRequest,
  normalizeReceiveRequest,
  normalizeTransitionRequest,
  normalizeUpdateOutsourcingRequest,
  type NormalizedOutsourcingProfile,
  type NormalizedReceiptItem,
} from "./outsourcing-validation";

export interface OutsourcingReferenceProvider { nextReference(): Promise<string> }

export type OutsourcingServiceErrorCode =
  | "OUTSOURCING_NOT_FOUND"
  | "OUTSOURCING_REVISION_CONFLICT"
  | "OUTSOURCING_EDIT_NOT_ALLOWED"
  | "OUTSOURCING_TRANSITION_NOT_ALLOWED"
  | "OUTSOURCING_REFERENCE_INVALID"
  | "OUTSOURCING_CONTRACTOR_INACTIVE"
  | "OUTSOURCING_BOM_SELECTION_REQUIRED"
  | "OUTSOURCING_BOM_INVALID"
  | "OUTSOURCING_UNIT_CONVERSION_FAILED"
  | "OUTSOURCING_PRICE_MISSING"
  | "OUTSOURCING_PRICE_PRECISION_INVALID"
  | "OUTSOURCING_DELETE_NOT_ALLOWED";

export class OutsourcingServiceError extends Error {
  constructor(
    readonly code: OutsourcingServiceErrorCode,
    readonly status: 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = "OutsourcingServiceError";
  }
}

const STATUSES: readonly OutsourcingStatusCode[] = ["pending_outbound","outbound","received","priced","paid","voided"];

function normalizeId(value:number,field="outsourcingId"):number{
  if(!Number.isInteger(value)||value<=0)throw new FieldValidationError({[field]:"必須是正整數"});return value;
}
function exactMultiplyDivideScaled4(left:number,right:number,divisor:number):number{
  const numerator=BigInt(left)*BigInt(right);const denominator=BigInt(divisor);
  if(denominator===0n)throw new Error("DIVIDE_BY_ZERO");
  if(numerator%denominator!==0n)throw new Error("SCALED4_PRECISION_EXCEEDED");
  const value=Number(numerator/denominator);if(!Number.isSafeInteger(value))throw new Error("SCALED4_RESULT_OUT_OF_RANGE");return value;
}
function validDate(value:string|undefined):boolean{
  if(!value)return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const[y,m,d]=value.split("-").map(Number);const parsed=new Date(Date.UTC(y,m-1,d));return parsed.getUTCFullYear()===y&&parsed.getUTCMonth()===m-1&&parsed.getUTCDate()===d;
}

export class OutsourcingService {
  private readonly repository:OutsourcingRepository;
  private readonly persistence:OutsourcingPersistence;
  constructor(db:D1Database,private readonly referenceProvider:OutsourcingReferenceProvider){this.repository=new OutsourcingRepository(db);this.persistence=new OutsourcingPersistence(db)}

  async search(query:OutsourcingSearchQuery):Promise<OutsourcingListResult>{
    const errors:Record<string,string>={};if(query.statusCode&&!STATUSES.includes(query.statusCode))errors.statusCode="狀態無效";
    if(!validDate(query.orderDateFrom))errors.orderDateFrom="日期格式必須為 YYYY-MM-DD";if(!validDate(query.orderDateTo))errors.orderDateTo="日期格式必須為 YYYY-MM-DD";
    if(query.orderDateFrom&&query.orderDateTo&&query.orderDateFrom>query.orderDateTo)errors.orderDateTo="結束日期不可早於開始日期";
    if(Object.keys(errors).length>0)throw new FieldValidationError(errors);return this.repository.search(query);
  }

  async getDetail(orderId:number):Promise<OutsourcingDetail>{const id=normalizeId(orderId);const detail=await this.repository.getDetail(id);if(!detail)throw new OutsourcingServiceError("OUTSOURCING_NOT_FOUND",404,"Outsourcing order not found");return detail}
  async stockBalances(contractorId:number):Promise<readonly ContractorStockBalance[]>{return this.repository.stockBalances(normalizeId(contractorId,"contractorId"))}

  async create(raw:unknown,context:OutsourcingMutationContext):Promise<OutsourcingDetail>{
    const input=normalizeCreateOutsourcingRequest(raw);const resolved=await this.resolveProfile(input,true);const ref=(await this.referenceProvider.nextReference()).trim();
    if(!ref||ref.length>120)throw new OutsourcingServiceError("OUTSOURCING_REFERENCE_INVALID",422,"Generated Outsourcing reference is invalid");
    const id=await this.persistence.create(ref,resolved,context);return this.getDetail(id);
  }

  async updatePending(orderId:number,raw:unknown,context:OutsourcingMutationContext):Promise<OutsourcingDetail>{
    const id=normalizeId(orderId);const input=normalizeUpdateOutsourcingRequest(raw);const state=await this.requireState(id);this.assertRevision(state,input.expectedRevision);
    if(state.statusCode!=="pending_outbound")throw new OutsourcingServiceError("OUTSOURCING_EDIT_NOT_ALLOWED",409,"Confirmed outbound facts are not ordinarily editable");
    const resolved=await this.resolveProfile(input,true);const changed=await this.persistence.updatePending(id,input,resolved,context);if(!changed)this.throwRevisionConflict();return this.getDetail(id);
  }

  async confirmOutbound(orderId:number,raw:unknown,context:OutsourcingMutationContext):Promise<OutsourcingDetail>{
    const id=normalizeId(orderId);const input=normalizeTransitionRequest(raw);const state=await this.requireState(id);this.assertRevision(state,input.expectedRevision);
    if(state.statusCode!=="pending_outbound")throw new OutsourcingServiceError("OUTSOURCING_TRANSITION_NOT_ALLOWED",422,"Only pending outbound orders can be confirmed");
    if(!input.effectiveDate)throw new FieldValidationError({effectiveDate:"確認出庫必須提供實際出庫日期"});
    const detail=await this.getDetail(id);const parts=await this.resolveStoredParts(detail);const movements=this.buildOutboundMovements(state.contractorId,parts);
    const changed=await this.persistence.confirmOutbound(state,input.effectiveDate,movements,input,context);if(!changed)this.throwRevisionConflict();return this.getDetail(id);
  }

  async correctOutbound(orderId:number,raw:unknown,reason:string|null,context:OutsourcingMutationContext):Promise<OutsourcingDetail>{
    if(context.allowOutboundCorrection!==true)throw new OutsourcingServiceError("OUTSOURCING_TRANSITION_NOT_ALLOWED",403,"Outbound correction permission is required");
    const id=normalizeId(orderId);const input=normalizeUpdateOutsourcingRequest(raw);const state=await this.requireState(id);this.assertRevision(state,input.expectedRevision);
    if(state.statusCode!=="outbound")throw new OutsourcingServiceError("OUTSOURCING_EDIT_NOT_ALLOWED",409,"Outbound correction is only available before receiving");
    const resolved=await this.resolveProfile(input,true);const active=await this.repository.listActiveMovements(id,"outbound_supply");const movements=this.buildOutboundMovements(resolved.contractorId,resolved.parts);
    const changed=await this.persistence.correctOutbound(state,input,resolved,active,movements,reason?.trim()||null,context);if(!changed)this.throwRevisionConflict();return this.getDetail(id);
  }

  async cancelOutbound(orderId:number,raw:unknown,context:OutsourcingMutationContext):Promise<OutsourcingDetail>{
    if(context.allowOutboundCancellation!==true)throw new OutsourcingServiceError("OUTSOURCING_TRANSITION_NOT_ALLOWED",403,"Outbound cancellation permission is required");
    const id=normalizeId(orderId);const input=normalizeTransitionRequest(raw);const state=await this.requireState(id);this.assertRevision(state,input.expectedRevision);
    if(state.statusCode!=="outbound")throw new OutsourcingServiceError("OUTSOURCING_TRANSITION_NOT_ALLOWED",422,"Downstream receiving/pricing/payment must be reversed before outbound cancellation");
    const active=await this.repository.listActiveMovements(id,"outbound_supply");const changed=await this.persistence.cancelOutbound(state,active,input,context);if(!changed)this.throwRevisionConflict();return this.getDetail(id);
  }

  async receive(orderId:number,raw:unknown,context:OutsourcingMutationContext):Promise<OutsourcingDetail>{
    const id=normalizeId(orderId);const input=normalizeReceiveRequest(raw);const state=await this.requireState(id);this.assertRevision(state,input.expectedRevision);
    if(state.statusCode!=="outbound")throw new OutsourcingServiceError("OUTSOURCING_TRANSITION_NOT_ALLOWED",422,"Receiving requires confirmed outbound state");
    if(!await this.repository.resolveOperator(input.operatorEmployeeId))throw new FieldValidationError({operatorEmployeeId:"操作人員不存在或已停用"});
    const plan=await this.buildReceiptPlan(state,input.items,input);const changed=await this.persistence.receive(state,plan,context);if(!changed)this.throwRevisionConflict();return this.getDetail(id);
  }

  async cancelReceipt(orderId:number,raw:unknown,context:OutsourcingMutationContext):Promise<OutsourcingDetail>{
    const id=normalizeId(orderId);const input=normalizeTransitionRequest(raw);const state=await this.requireState(id);this.assertRevision(state,input.expectedRevision);
    if(state.statusCode!=="received")throw new OutsourcingServiceError("OUTSOURCING_TRANSITION_NOT_ALLOWED",422,"Pricing/payment must be reversed before receiving can be cancelled");
    const detail=await this.getDetail(id);if(!detail.receipt)throw new OutsourcingServiceError("OUTSOURCING_TRANSITION_NOT_ALLOWED",409,"Receiving record is missing");
    const active=await this.repository.listActiveMovements(id,"receipt_consumption");const snapshot={receivedDate:detail.receipt.receivedDate,items:detail.receipt.items.map(i=>({itemId:i.itemId,bomRecipeId:i.bomRecipeId,quantity:i.quantity,unit:i.unitSnapshot}))};
    const changed=await this.persistence.cancelReceipt(state,snapshot,active,input,context);if(!changed)this.throwRevisionConflict();return this.getDetail(id);
  }

  async price(orderId:number,raw:unknown,context:OutsourcingMutationContext):Promise<OutsourcingDetail>{
    const id=normalizeId(orderId);const input=normalizePriceRequest(raw);const state=await this.requireState(id);this.assertRevision(state,input.expectedRevision);
    if(state.statusCode!=="received")throw new OutsourcingServiceError("OUTSOURCING_TRANSITION_NOT_ALLOWED",422,"Pricing requires received state");
    if(!await this.repository.resolveOperator(input.operatorEmployeeId))throw new FieldValidationError({operatorEmployeeId:"操作人員不存在或已停用"});
    const detail=await this.getDetail(id);if(!detail.receipt)throw new OutsourcingServiceError("OUTSOURCING_TRANSITION_NOT_ALLOWED",409,"Receiving record is missing");
    const plan=await this.buildPricingPlan(state,detail,input);const changed=await this.persistence.price(state,plan,context);if(!changed)this.throwRevisionConflict();return this.getDetail(id);
  }

  async cancelPricing(orderId:number,raw:unknown,context:OutsourcingMutationContext):Promise<OutsourcingDetail>{
    const id=normalizeId(orderId);const input=normalizeTransitionRequest(raw);const state=await this.requireState(id);this.assertRevision(state,input.expectedRevision);
    if(state.statusCode!=="priced")throw new OutsourcingServiceError("OUTSOURCING_TRANSITION_NOT_ALLOWED",422,"Payment must be reversed before pricing can be cancelled");
    const detail=await this.getDetail(id);if(!detail.pricing)throw new OutsourcingServiceError("OUTSOURCING_TRANSITION_NOT_ALLOWED",409,"Pricing record is missing");
    const snapshot={pricedDate:detail.pricing.pricedDate,totalAmount:detail.pricing.totalAmount,items:detail.pricing.items.map(i=>({itemId:i.itemId,quantity:i.quantity,unit:i.unitSnapshot,unitPrice:i.unitPrice,subtotal:i.subtotal}))};
    const changed=await this.persistence.cancelPricing(state,snapshot,input,context);if(!changed)this.throwRevisionConflict();return this.getDetail(id);
  }

  async markPaid(orderId:number,raw:unknown,context:OutsourcingMutationContext):Promise<OutsourcingDetail>{
    const id=normalizeId(orderId);const input=normalizeTransitionRequest(raw);const state=await this.requireState(id);this.assertRevision(state,input.expectedRevision);
    if(state.statusCode!=="priced")throw new OutsourcingServiceError("OUTSOURCING_TRANSITION_NOT_ALLOWED",422,"Payment requires priced state");
    const changed=await this.persistence.markPaid(state,input,context);if(!changed)this.throwRevisionConflict();return this.getDetail(id);
  }

  async cancelPayment(orderId:number,raw:unknown,context:OutsourcingMutationContext):Promise<OutsourcingDetail>{
    const id=normalizeId(orderId);const input=normalizeTransitionRequest(raw);const state=await this.requireState(id);this.assertRevision(state,input.expectedRevision);
    if(state.statusCode!=="paid")throw new OutsourcingServiceError("OUTSOURCING_TRANSITION_NOT_ALLOWED",422,"Only paid orders can cancel payment");
    const changed=await this.persistence.cancelPayment(state,input,context);if(!changed)this.throwRevisionConflict();return this.getDetail(id);
  }

  async deletePending(orderId:number,expectedRevision:number,context:OutsourcingMutationContext):Promise<void>{
    if(context.allowHardDelete!==true)throw new OutsourcingServiceError("OUTSOURCING_DELETE_NOT_ALLOWED",403,"Outsourcing hard-delete permission is required");
    const id=normalizeId(orderId);const state=await this.requireState(id);this.assertRevision(state,expectedRevision);
    if(state.statusCode!=="pending_outbound")throw new OutsourcingServiceError("OUTSOURCING_DELETE_NOT_ALLOWED",409,"Confirmed outbound order must never be hard-deleted");
    const changed=await this.persistence.deletePending(state,context);if(!changed)this.throwRevisionConflict();
  }

  private async resolveProfile(input:NormalizedOutsourcingProfile,requireActiveContractor:boolean):Promise<ResolvedOutsourcingProfile>{
    const [contractor,operator,items]=await Promise.all([this.repository.resolveContractor(input.contractorId),this.repository.resolveOperator(input.operatorEmployeeId),this.repository.resolveItems(input.parts.flatMap(p=>[p.componentItemId,...(p.finishedItemId?[p.finishedItemId]:[])]))]);
    const errors:Record<string,string>={};if(!contractor)errors.contractorId="代工對象不存在";else if(requireActiveContractor&&!contractor.isActive)errors.contractorId="代工對象已停用";if(!operator)errors.operatorEmployeeId="操作人員不存在或已停用";
    const parts:ResolvedOutsourcingPart[]=input.parts.map((part,index)=>{
      const component=items.get(part.componentItemId);const finished=part.finishedItemId?items.get(part.finishedItemId)??null:null;
      if(!component)errors[`parts.${index}.componentItemId`]="料件商品不存在";else if(!component.allowedUnits.has(part.unit))errors[`parts.${index}.unit`]=`單位必須是 ${[...component.allowedUnits].join(" / ")}`;
      if(part.finishedItemId&&!finished)errors[`parts.${index}.finishedItemId`]="成品不存在";
      if(part.bomRecipeId){/* linkage is validated when used for receiving; planned rows keep optional BOM context */}
      return{bomRecipeId:part.bomRecipeId,finishedItem:finished,componentItem:component??({id:0,itemNo:"",itemName:"",spec:null,baseUnit:"",conversions:[],allowedUnits:new Set()}),quantityScaled4:part.quantityScaled4,unit:part.unit,note:part.note,sortOrder:part.sortOrder};
    });
    if(Object.keys(errors).length>0)throw new FieldValidationError(errors);
    return{contractorId:contractor!.id,contractorName:contractor!.displayName,operatorEmployeeId:operator!.id,orderDate:input.orderDate,parts};
  }

  private async resolveStoredParts(detail:OutsourcingDetail):Promise<readonly ResolvedOutsourcingPart[]>{
    const ids=detail.parts.flatMap(p=>[p.componentItemId,...(p.finishedItemId?[p.finishedItemId]:[])]);const items=await this.repository.resolveItems(ids);const errors:Record<string,string>={};
    const resolved=detail.parts.map((part,index)=>{const component=items.get(part.componentItemId);const finished=part.finishedItemId?items.get(part.finishedItemId)??null:null;if(!component)errors[`parts.${index}.componentItemId`]="料件商品不存在";return{bomRecipeId:part.bomRecipeId,finishedItem:finished,componentItem:component!,quantityScaled4:Number((part.quantity.includes(".")?part.quantity:""+part.quantity))/* replaced below */,unit:part.unitSnapshot,note:part.note,sortOrder:part.sortOrder};});
    // Re-read scaled integer values directly from the database-backed detail strings without floating arithmetic.
    const { parseScaled4 } = await import("../../shared/fixed-point");resolved.forEach((row,index)=>{row.quantityScaled4=parseScaled4(detail.parts[index].quantity)});
    if(Object.keys(errors).length>0)throw new FieldValidationError(errors);return resolved;
  }

  private buildOutboundMovements(contractorId:number,parts:readonly ResolvedOutsourcingPart[]):readonly StockMovementPlan[]{
    const aggregated=new Map<string,StockMovementPlan>();
    for(const part of parts){let baseQty:number;try{baseQty=convertScaled4Exact(part.quantityScaled4,part.unit,part.componentItem.baseUnit,part.componentItem.baseUnit,part.componentItem.conversions)}catch{throw new OutsourcingServiceError("OUTSOURCING_UNIT_CONVERSION_FAILED",422,`無法將 ${part.componentItem.itemNo} ${part.unit} 轉為基準單位 ${part.componentItem.baseUnit}`)}
      const key=`${part.componentItem.id}:${part.finishedItem?.id??0}`;const existing=aggregated.get(key);if(existing)existing.quantityDeltaScaled4+=baseQty;else aggregated.set(key,{contractorId,itemId:part.componentItem.id,relatedFinishedItemId:part.finishedItem?.id??null,movementType:"outbound_supply",quantityDeltaScaled4:baseQty});}
    return[...aggregated.values()];
  }

  private async buildReceiptPlan(state:OutsourcingRecordState,inputs:readonly NormalizedReceiptItem[],request:ReturnType<typeof normalizeReceiveRequest>):Promise<ResolvedReceiptPlan>{
    const itemMap=await this.repository.resolveItems(inputs.map(i=>i.itemId));const errors:Record<string,string>={};const items:ResolvedReceiptItem[]=[];const movementMap=new Map<string,StockMovementPlan>();
    for(let index=0;index<inputs.length;index++){
      const input=inputs[index];const item=itemMap.get(input.itemId);if(!item){errors[`items.${index}.itemId`]="成品不存在";continue}if(!item.allowedUnits.has(input.unit)){errors[`items.${index}.unit`]=`單位必須是 ${[...item.allowedUnits].join(" / ")}`;continue}
      const candidates=await this.repository.listActiveBomsForFinishedItem(item.id);let bom:BomRef|null=null;
      if(input.bomRecipeId!=null){bom=await this.repository.getBom(input.bomRecipeId);if(!bom||!bom.isActive||bom.finishedItemId!==item.id){errors[`items.${index}.bomRecipeId`]="BOM 不適用於此成品或已停用";continue}}
      else if(candidates.length===1)bom=candidates[0];else if(candidates.length>1){errors[`items.${index}.bomRecipeId`]="此成品有多套 BOM，必須選擇實際使用的 BOM";continue}
      items.push({item,bomRecipeId:bom?.id??null,quantityScaled4:input.quantityScaled4,unit:input.unit,note:input.note,sortOrder:input.sortOrder});
      if(!bom)continue;
      let receivedInOutput:number;try{receivedInOutput=convertScaled4Exact(input.quantityScaled4,input.unit,bom.outputUnit,item.baseUnit,item.conversions)}catch{errors[`items.${index}.unit`]="入庫單位無法精確換算至 BOM 產出單位";continue}
      const componentItems=await this.repository.resolveItems(bom.components.map(c=>c.itemId));
      for(const component of bom.components){const componentItem=componentItems.get(component.itemId);if(!componentItem){errors[`items.${index}.bomRecipeId`]="BOM 包含不存在的料件";continue}let consumed:number;try{const inBomUnit=exactMultiplyDivideScaled4(receivedInOutput,component.quantityScaled4,bom.outputQuantityScaled4);consumed=convertScaled4Exact(inBomUnit,component.unit,componentItem.baseUnit,componentItem.baseUnit,componentItem.conversions)}catch{errors[`items.${index}.bomRecipeId`]="BOM 耗料換算無法在 4 位小數內精確表示";continue}
        const key=`${componentItem.id}:${item.id}`;const existing=movementMap.get(key);if(existing)existing.quantityDeltaScaled4-=consumed;else movementMap.set(key,{contractorId:state.contractorId,itemId:componentItem.id,relatedFinishedItemId:item.id,movementType:"receipt_consumption",quantityDeltaScaled4:-consumed});}
    }
    if(Object.keys(errors).length>0)throw new FieldValidationError(errors);return{input:request,items,consumptionMovements:[...movementMap.values()]};
  }

  private async buildPricingPlan(state:OutsourcingRecordState,detail:OutsourcingDetail,input:ReturnType<typeof normalizePriceRequest>):Promise<ResolvedPricingPlan>{
    const receipt=detail.receipt!;const ids=receipt.items.map(i=>i.itemId);const[itemMap,priceMap]=await Promise.all([this.repository.resolveItems(ids),this.repository.listContractorPrices(state.contractorId,ids)]);const errors:Record<string,string>={};const planItems:PricingPlanItem[]=[];let totalMoney2=0;
    const { parseScaled4 } = await import("../../shared/fixed-point");
    for(let index=0;index<receipt.items.length;index++){const row=receipt.items[index];const item=itemMap.get(row.itemId);const price=priceMap.get(row.itemId);if(!item){errors[`items.${index}.itemId`]="成品不存在";continue}if(!price){errors[`items.${index}.price`]="此代工對象尚未設定該商品的現行代工價";continue}
      let pricingQty:number;try{pricingQty=convertScaled4Exact(parseScaled4(row.quantity),row.unitSnapshot,price.pricingUnit,item.baseUnit,item.conversions)}catch{errors[`items.${index}.unit`]="入庫單位無法換算至代工計價單位";continue}
      let subtotal:number;try{subtotal=scaled4ProductToMoney2Exact(pricingQty,price.unitPriceScaled4)}catch{errors[`items.${index}.subtotal`]="計價結果超過 TWD 兩位小數精度；請修正數量、換算或單價";continue}
      totalMoney2+=subtotal;if(!Number.isSafeInteger(totalMoney2)){errors._total="計價總額超出可處理範圍";continue}
      planItems.push({item,pricingUnit:price.pricingUnit,quantityScaled4:pricingQty,unitPriceScaled4:price.unitPriceScaled4,subtotalMoney2:subtotal,note:row.note,sortOrder:row.sortOrder});}
    if(Object.keys(errors).length>0){const hasMissing=Object.values(errors).some(v=>v.includes("尚未設定"));if(hasMissing)throw new OutsourcingServiceError("OUTSOURCING_PRICE_MISSING",422,Object.values(errors)[0]);throw new FieldValidationError(errors)}
    return{input,items:planItems,totalMoney2};
  }

  private async requireState(id:number):Promise<OutsourcingRecordState>{const state=await this.repository.getRecordState(id);if(!state)throw new OutsourcingServiceError("OUTSOURCING_NOT_FOUND",404,"Outsourcing order not found");return state}
  private assertRevision(state:OutsourcingRecordState,expected:number):void{if(state.revision!==expected)this.throwRevisionConflict()}
  private throwRevisionConflict():never{throw new OutsourcingServiceError("OUTSOURCING_REVISION_CONFLICT",409,"Outsourcing order has changed since it was loaded")}
}
