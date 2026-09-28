import type {
  ContractorStockBalance,
  OutsourcingDetail,
  OutsourcingListResult,
  OutsourcingSearchQuery,
  OutsourcingStatusCode,
  OutsourcingSummary,
} from "../../shared/contractor-outsourcing";
import { formatMoney2, formatScaled4 } from "../../shared/fixed-point";
import { allowedUnits, type UnitConversionEdge } from "../item/unit-conversion";

type D1Scalar = string | number | null;

type OrderRow = {
  id:number; outsourcing_ref:string; status_code:OutsourcingStatusCode; operator_employee_id:number;
  contractor_id:number; contractor_name_snapshot:string; order_date:string; outbound_date:string|null;
  paid_at:string|null; voided_at:string|null; created_at?:string; updated_at:string; revision:number;
};

export interface OutsourcingRecordState {
  id:number;
  outsourcingRef:string;
  statusCode:OutsourcingStatusCode;
  contractorId:number;
  contractorNameSnapshot:string;
  outboundDate:string|null;
  paidAt:string|null;
  revision:number;
}

export interface ContractorRef { id:number; displayName:string; isActive:boolean }
export interface OperatorRef { id:number }
export interface OutsourcingItemRef {
  id:number; itemNo:string; itemName:string; spec:string|null; baseUnit:string;
  conversions:readonly UnitConversionEdge[]; allowedUnits:ReadonlySet<string>;
}
export interface BomComponentRef {
  itemId:number; quantityScaled4:number; unit:string;
}
export interface BomRef {
  id:number; finishedItemId:number; outputQuantityScaled4:number; outputUnit:string; isActive:boolean;
  components:readonly BomComponentRef[];
}
export interface ContractorPriceRef {
  itemId:number; pricingUnit:string; unitPriceScaled4:number;
}
export interface StockMovementRef {
  id:number; contractorId:number; itemId:number; quantityDeltaScaled4:number;
  movementType:"outbound_supply"|"receipt_consumption"|"manual_adjustment"|"reversal";
}

function escapeLike(value:string):string{return value.replace(/[\\%_]/g,(m)=>`\\${m}`)}
function encodeCursor(id:number):string{return btoa(String(id)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function decodeCursor(cursor:string|undefined):number|null{
  if(!cursor)return null;if(!/^[A-Za-z0-9_-]{1,32}$/.test(cursor))return null;
  try{const n=cursor.replace(/-/g,"+").replace(/_/g,"/");const id=Number(atob(n.padEnd(Math.ceil(n.length/4)*4,"=")));return Number.isSafeInteger(id)&&id>0?id:null}catch{return null}
}
function toSummary(row:OrderRow):OutsourcingSummary{return{
  id:row.id,outsourcingRef:row.outsourcing_ref,statusCode:row.status_code,contractorId:row.contractor_id,
  contractorNameSnapshot:row.contractor_name_snapshot,orderDate:row.order_date,outboundDate:row.outbound_date,
  paidAt:row.paid_at,voidedAt:row.voided_at,operatorEmployeeId:row.operator_employee_id,
  revision:row.revision,updatedAt:row.updated_at,
}}

export class OutsourcingRepository {
  constructor(private readonly db:D1Database){}

  async search(query:OutsourcingSearchQuery):Promise<OutsourcingListResult>{
    const where:string[]=[];const params:D1Scalar[]=[];
    const keyword=query.q?.trim()??"";
    if(keyword){const like=`%${escapeLike(keyword)}%`;where.push("(o.outsourcing_ref LIKE ? ESCAPE '\\' OR o.contractor_name_snapshot LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM outsourcing_order_parts p WHERE p.outsourcing_order_id=o.id AND (p.component_item_no_snapshot LIKE ? ESCAPE '\\' OR p.component_item_name_snapshot LIKE ? ESCAPE '\\' OR p.finished_item_no_snapshot LIKE ? ESCAPE '\\' OR p.finished_item_name_snapshot LIKE ? ESCAPE '\\')))" );params.push(like,like,like,like,like,like)}
    if(query.statusCode){where.push("o.status_code=?");params.push(query.statusCode)}
    if(query.contractorId!=null&&Number.isInteger(query.contractorId)&&query.contractorId>0){where.push("o.contractor_id=?");params.push(query.contractorId)}
    if(query.orderDateFrom){where.push("o.order_date>=?");params.push(query.orderDateFrom)}
    if(query.orderDateTo){where.push("o.order_date<=?");params.push(query.orderDateTo)}
    const cursor=decodeCursor(query.cursor);if(query.cursor&&cursor==null)return{items:[],nextCursor:null};if(cursor!=null){where.push("o.id<?");params.push(cursor)}
    const limit=query.limit!=null&&Number.isInteger(query.limit)&&query.limit>0?Math.min(query.limit,100):30;params.push(limit+1);
    const result=await this.db.prepare(`SELECT o.id,o.outsourcing_ref,o.status_code,o.operator_employee_id,o.contractor_id,o.contractor_name_snapshot,o.order_date,o.outbound_date,o.paid_at,o.voided_at,o.updated_at,o.revision FROM outsourcing_orders o ${where.length?`WHERE ${where.join(" AND ")}`:""} ORDER BY o.id DESC LIMIT ?`).bind(...params).all<OrderRow>();
    const rows=result.results??[];const hasMore=rows.length>limit;const visible=hasMore?rows.slice(0,limit):rows;const last=visible[visible.length-1];
    return{items:visible.map(toSummary),nextCursor:hasMore&&last?encodeCursor(last.id):null};
  }

  async getDetail(orderId:number):Promise<OutsourcingDetail|null>{
    const results=await this.db.batch([
      this.db.prepare(`SELECT id,outsourcing_ref,status_code,operator_employee_id,contractor_id,contractor_name_snapshot,order_date,outbound_date,paid_at,voided_at,created_at,updated_at,revision FROM outsourcing_orders WHERE id=? LIMIT 1`).bind(orderId),
      this.db.prepare(`SELECT id,bom_recipe_id,finished_item_id,finished_item_no_snapshot,finished_item_name_snapshot,finished_spec_snapshot,component_item_id,component_item_no_snapshot,component_item_name_snapshot,component_spec_snapshot,quantity,unit_snapshot,note,sort_order FROM outsourcing_order_parts WHERE outsourcing_order_id=? ORDER BY sort_order,id`).bind(orderId),
      this.db.prepare(`SELECT id,received_date,operator_employee_id,created_at FROM outsourcing_receipts WHERE outsourcing_order_id=? LIMIT 1`).bind(orderId),
      this.db.prepare(`SELECT ri.id,ri.item_id,ri.bom_recipe_id,ri.item_no_snapshot,ri.item_name_snapshot,ri.spec_snapshot,ri.quantity,ri.unit_snapshot,ri.note,ri.sort_order FROM outsourcing_receipt_items ri JOIN outsourcing_receipts r ON r.id=ri.receipt_id WHERE r.outsourcing_order_id=? ORDER BY ri.sort_order,ri.id`).bind(orderId),
      this.db.prepare(`SELECT id,priced_date,operator_employee_id,total_amount,created_at,revision FROM outsourcing_pricings WHERE outsourcing_order_id=? LIMIT 1`).bind(orderId),
      this.db.prepare(`SELECT pi.id,pi.item_id,pi.item_no_snapshot,pi.item_name_snapshot,pi.unit_snapshot,pi.quantity,pi.unit_price,pi.subtotal,pi.note,pi.sort_order FROM outsourcing_pricing_items pi JOIN outsourcing_pricings p ON p.id=pi.pricing_id WHERE p.outsourcing_order_id=? ORDER BY pi.sort_order,pi.id`).bind(orderId),
    ]);
    const order=(results[0]?.results?.[0]??null) as OrderRow|null;if(!order)return null;
    const parts=(results[1]?.results??[]) as Array<{id:number;bom_recipe_id:number|null;finished_item_id:number|null;finished_item_no_snapshot:string|null;finished_item_name_snapshot:string|null;finished_spec_snapshot:string|null;component_item_id:number;component_item_no_snapshot:string;component_item_name_snapshot:string;component_spec_snapshot:string|null;quantity:number;unit_snapshot:string;note:string|null;sort_order:number}>;
    const receiptRow=(results[2]?.results?.[0]??null) as {id:number;received_date:string;operator_employee_id:number;created_at:string}|null;
    const receiptItems=(results[3]?.results??[]) as Array<{id:number;item_id:number;bom_recipe_id:number|null;item_no_snapshot:string;item_name_snapshot:string;spec_snapshot:string|null;quantity:number;unit_snapshot:string;note:string|null;sort_order:number}>;
    const pricingRow=(results[4]?.results?.[0]??null) as {id:number;priced_date:string;operator_employee_id:number;total_amount:number;created_at:string;revision:number}|null;
    const pricingItems=(results[5]?.results??[]) as Array<{id:number;item_id:number;item_no_snapshot:string;item_name_snapshot:string;unit_snapshot:string;quantity:number;unit_price:number;subtotal:number;note:string|null;sort_order:number}>;
    return{
      ...toSummary(order),createdAt:order.created_at??order.updated_at,
      parts:parts.map(p=>({id:p.id,bomRecipeId:p.bom_recipe_id,finishedItemId:p.finished_item_id,finishedItemNoSnapshot:p.finished_item_no_snapshot,finishedItemNameSnapshot:p.finished_item_name_snapshot,finishedSpecSnapshot:p.finished_spec_snapshot,componentItemId:p.component_item_id,componentItemNoSnapshot:p.component_item_no_snapshot,componentItemNameSnapshot:p.component_item_name_snapshot,componentSpecSnapshot:p.component_spec_snapshot,quantity:formatScaled4(p.quantity),unitSnapshot:p.unit_snapshot,note:p.note,sortOrder:p.sort_order})),
      receipt:receiptRow?{id:receiptRow.id,receivedDate:receiptRow.received_date,operatorEmployeeId:receiptRow.operator_employee_id,createdAt:receiptRow.created_at,items:receiptItems.map(i=>({id:i.id,itemId:i.item_id,bomRecipeId:i.bom_recipe_id,itemNoSnapshot:i.item_no_snapshot,itemNameSnapshot:i.item_name_snapshot,specSnapshot:i.spec_snapshot,quantity:formatScaled4(i.quantity),unitSnapshot:i.unit_snapshot,note:i.note,sortOrder:i.sort_order}))}:null,
      pricing:pricingRow?{id:pricingRow.id,pricedDate:pricingRow.priced_date,operatorEmployeeId:pricingRow.operator_employee_id,totalAmount:formatMoney2(pricingRow.total_amount),revision:pricingRow.revision,createdAt:pricingRow.created_at,items:pricingItems.map(i=>({id:i.id,itemId:i.item_id,itemNoSnapshot:i.item_no_snapshot,itemNameSnapshot:i.item_name_snapshot,unitSnapshot:i.unit_snapshot,quantity:formatScaled4(i.quantity),unitPrice:formatScaled4(i.unit_price),subtotal:formatMoney2(i.subtotal),note:i.note,sortOrder:i.sort_order}))}:null,
    };
  }

  async getRecordState(orderId:number):Promise<OutsourcingRecordState|null>{
    const row=await this.db.prepare("SELECT id,outsourcing_ref,status_code,contractor_id,contractor_name_snapshot,outbound_date,paid_at,revision FROM outsourcing_orders WHERE id=? LIMIT 1").bind(orderId).first<{id:number;outsourcing_ref:string;status_code:OutsourcingStatusCode;contractor_id:number;contractor_name_snapshot:string;outbound_date:string|null;paid_at:string|null;revision:number}>();
    return row?{id:row.id,outsourcingRef:row.outsourcing_ref,statusCode:row.status_code,contractorId:row.contractor_id,contractorNameSnapshot:row.contractor_name_snapshot,outboundDate:row.outbound_date,paidAt:row.paid_at,revision:row.revision}:null;
  }

  async resolveContractor(contractorId:number):Promise<ContractorRef|null>{
    const row=await this.db.prepare("SELECT id,display_name,is_active FROM contractors WHERE id=? LIMIT 1").bind(contractorId).first<{id:number;display_name:string;is_active:number}>();
    return row?{id:row.id,displayName:row.display_name,isActive:row.is_active===1}:null;
  }

  async resolveOperator(employeeId:number):Promise<OperatorRef|null>{
    const row=await this.db.prepare("SELECT id FROM app_members WHERE id=? AND is_active=1 LIMIT 1").bind(employeeId).first<{id:number}>();return row?{id:row.id}:null;
  }

  async resolveItems(itemIds:readonly number[]):Promise<Map<number,OutsourcingItemRef>>{
    const ids=[...new Set(itemIds.filter(id=>Number.isInteger(id)&&id>0))];if(ids.length===0)return new Map();
    const placeholders=ids.map(()=>"?").join(",");
    const rows=await this.db.prepare(`SELECT id,item_no,name,spec,base_unit FROM items WHERE id IN (${placeholders})`).bind(...ids).all<{id:number;item_no:string;name:string;spec:string|null;base_unit:string}>();
    const map=new Map<number,OutsourcingItemRef>();
    for(const item of rows.results??[]){
      const conv=await this.db.prepare("SELECT from_unit,quantity,to_unit FROM item_unit_conversions WHERE item_id=? ORDER BY sort_order,id").bind(item.id).all<{from_unit:string;quantity:number;to_unit:string}>();
      const conversions=(conv.results??[]).map(r=>({fromUnit:r.from_unit,quantityScaled4:r.quantity,toUnit:r.to_unit}));
      map.set(item.id,{id:item.id,itemNo:item.item_no,itemName:item.name,spec:item.spec,baseUnit:item.base_unit,conversions,allowedUnits:allowedUnits(item.base_unit,conversions)});
    }
    return map;
  }

  async listActiveBomsForFinishedItem(itemId:number):Promise<readonly BomRef[]>{
    const rows=await this.db.prepare("SELECT id,finished_item_id,output_quantity,output_unit,is_active FROM bom_recipes WHERE finished_item_id=? AND is_active=1 ORDER BY id").bind(itemId).all<{id:number;finished_item_id:number;output_quantity:number;output_unit:string;is_active:number}>();
    const result:BomRef[]=[];
    for(const row of rows.results??[]){
      const parts=await this.db.prepare("SELECT component_item_id,quantity,unit FROM bom_components WHERE bom_recipe_id=? ORDER BY sort_order,id").bind(row.id).all<{component_item_id:number;quantity:number;unit:string}>();
      result.push({id:row.id,finishedItemId:row.finished_item_id,outputQuantityScaled4:row.output_quantity,outputUnit:row.output_unit,isActive:row.is_active===1,components:(parts.results??[]).map(p=>({itemId:p.component_item_id,quantityScaled4:p.quantity,unit:p.unit}))});
    }
    return result;
  }

  async getBom(bomId:number):Promise<BomRef|null>{
    const row=await this.db.prepare("SELECT id,finished_item_id,output_quantity,output_unit,is_active FROM bom_recipes WHERE id=? LIMIT 1").bind(bomId).first<{id:number;finished_item_id:number;output_quantity:number;output_unit:string;is_active:number}>();if(!row)return null;
    const parts=await this.db.prepare("SELECT component_item_id,quantity,unit FROM bom_components WHERE bom_recipe_id=? ORDER BY sort_order,id").bind(row.id).all<{component_item_id:number;quantity:number;unit:string}>();
    return{id:row.id,finishedItemId:row.finished_item_id,outputQuantityScaled4:row.output_quantity,outputUnit:row.output_unit,isActive:row.is_active===1,components:(parts.results??[]).map(p=>({itemId:p.component_item_id,quantityScaled4:p.quantity,unit:p.unit}))};
  }

  async listContractorPrices(contractorId:number,itemIds:readonly number[]):Promise<Map<number,ContractorPriceRef>>{
    const ids=[...new Set(itemIds)];if(ids.length===0)return new Map();const placeholders=ids.map(()=>"?").join(",");
    const rows=await this.db.prepare(`SELECT item_id,pricing_unit,unit_price FROM contractor_pricing WHERE contractor_id=? AND item_id IN (${placeholders})`).bind(contractorId,...ids).all<{item_id:number;pricing_unit:string;unit_price:number}>();
    return new Map((rows.results??[]).map(r=>[r.item_id,{itemId:r.item_id,pricingUnit:r.pricing_unit,unitPriceScaled4:r.unit_price}]));
  }

  async listActiveMovements(orderId:number,movementType:"outbound_supply"|"receipt_consumption"):Promise<readonly StockMovementRef[]>{
    const rows=await this.db.prepare(`
      SELECT m.id,m.contractor_id,m.item_id,m.quantity_delta,m.movement_type
        FROM contractor_stock_movements m
       WHERE m.outsourcing_order_id=? AND m.movement_type=?
         AND NOT EXISTS(SELECT 1 FROM contractor_stock_movements r WHERE r.reversal_of_movement_id=m.id)
       ORDER BY m.id
    `).bind(orderId,movementType).all<{id:number;contractor_id:number;item_id:number;quantity_delta:number;movement_type:StockMovementRef["movementType"]}>();
    return(rows.results??[]).map(r=>({id:r.id,contractorId:r.contractor_id,itemId:r.item_id,quantityDeltaScaled4:r.quantity_delta,movementType:r.movement_type}));
  }

  async stockBalances(contractorId:number):Promise<readonly ContractorStockBalance[]>{
    const rows=await this.db.prepare(`
      SELECT m.item_id,i.item_no,i.name,SUM(m.quantity_delta) AS qty
        FROM contractor_stock_movements m JOIN items i ON i.id=m.item_id
       WHERE m.contractor_id=?
       GROUP BY m.item_id,i.item_no,i.name
       HAVING SUM(m.quantity_delta)<>0
       ORDER BY i.item_no
    `).bind(contractorId).all<{item_id:number;item_no:string;name:string;qty:number}>();
    return(rows.results??[]).map(r=>({contractorId,itemId:r.item_id,itemNo:r.item_no,itemName:r.name,quantity:formatScaled4(r.qty)}));
  }
}
