import {apiRequest} from "../../api/client";
type Dict = Record<string, string | number | boolean | undefined>;
function params(values:Dict={}) {
  const q=new URLSearchParams();
  Object.entries(values).forEach(([k,v])=>{if(v!==undefined&&v!=="")q.set(k,String(v));});
  const s=q.toString();return s?"?"+s:"";
}
const root="/api/business/outsourcing";
export interface FlowProduct {
  id:number; item_id:number; item_no:string; item_name:string; bom_recipe_id:number|null;
  recipe_ref:string|null; planned_quantity:number; delivered_quantity:number; unit:string; progress:number;
}
export interface FlowIssue {
  id:number;issued_date:string;note:string|null;cancelled_at:string|null;
  items:readonly {id:number;item_id:number;item_no:string;name:string;quantity:number;unit:string}[];
}
export interface FlowReceipt {
  id:number;received_date:string;erp_no:string|null;note:string|null;cancelled_at:string|null;
  items:readonly {id:number;item_id:number;item_no:string;name:string;order_product_id:number;quantity:number;unit:string;unit_price:number|null;pricing_unit:string|null;statement_status:string|null}[];
}
export interface FlowOrder {
  id:number;outsourcing_ref:string;contractor_id:number;contractor_name_snapshot:string;order_date:string;
  note:string|null;closed_at:string|null;closed_reason:string|null;revision:number;
  statusCode:"pending_issue"|"in_production"|"delivered"|"closed";
  products:readonly FlowProduct[];issues:readonly FlowIssue[];receipts:readonly FlowReceipt[];
}
export interface FlowStock {
  contractorId:number;contractorName:string;billingMethod:"single"|"monthly";
  itemId:number;itemNo:string;itemName:string;unit:string;quantity:string;baseline:string;percentage:number|null;tone:"green"|"yellow"|"red";
}
export interface StatementLine {
  id:number;receipt_item_id:number;quantity:number;pricing_unit:string;unit_price:number|null;amount:number|null;
  item_no:string;item_name:string;received_date:string;erp_no:string|null;outsourcing_ref:string;
}
export interface Statement {
  id:number;contractor_id:number;contractor_name:string;billing_method:"single"|"monthly";
  statement_date:string;period_month:string|null;revision:number;status_code:"draft"|"confirmed";
  total_amount:number;paid_amount:number;paymentStatus:"draft"|"confirmed"|"partial"|"paid";
  lines:readonly StatementLine[];adjustments:readonly {id:number;description:string;amount:number}[];
  payments:readonly {id:number;payment_date:string;method:string;amount:number;note:string|null}[];
}
export const flowApi={
  listOrders:(q:Dict={})=>apiRequest<{items:FlowOrder[];nextCursor:null}>(root+"/orders"+params(q)),
  order:(id:number)=>apiRequest<FlowOrder>(root+"/orders/"+id),
  createOrder:(data:unknown)=>apiRequest<FlowOrder>(root+"/orders",{method:"POST",json:data}),
  issue:(id:number,data:unknown)=>apiRequest<FlowOrder>(root+"/orders/"+id+"/issues",{method:"POST",json:data}),
  receive:(id:number,data:unknown)=>apiRequest<FlowOrder>(root+"/orders/"+id+"/receipts",{method:"POST",json:data}),
  cancelIssue:(id:number,entry:number,revision:number)=>apiRequest<FlowOrder>(root+`/orders/${id}/issues/${entry}/cancel`,{method:"POST",json:{expectedRevision:revision}}),
  cancelReceipt:(id:number,entry:number,revision:number)=>apiRequest<FlowOrder>(root+`/orders/${id}/receipts/${entry}/cancel`,{method:"POST",json:{expectedRevision:revision}}),
  close:(id:number,revision:number,reason:string)=>apiRequest<FlowOrder>(root+`/orders/${id}/close`,{method:"POST",json:{expectedRevision:revision,reason}}),
  reopen:(id:number,revision:number)=>apiRequest<FlowOrder>(root+`/orders/${id}/reopen`,{method:"POST",json:{expectedRevision:revision}}),
  deleteOrder:(id:number,revision:number)=>apiRequest<{deleted:boolean}>(root+"/orders/"+id,{method:"DELETE",json:{expectedRevision:revision}}),
  groupedStock:(contractorId?:number,showAll=false)=>apiRequest<{items:{contractorId:number;contractorName:string;billingMethod:string;groups:{title:string;bomName:string|null;capacity:number|null;shortage:boolean;items:FlowStock[]}[]}[]}>(root+"/stock/groups"+params({contractorId,showAll})),
  issueSuggestion:(id:number)=>apiRequest<{items:{itemId:number;itemNo:string;itemName:string;unit:string;quantity:string}[]}>(root+`/orders/${id}/issue-suggestion`),
  consumptionPreview:(id:number,items:unknown[])=>apiRequest<{items:{itemId:number;itemNo:string;itemName:string;unit:string;quantity:string}[]}>(root+`/orders/${id}/consumption-preview`,{method:"POST",json:{items}}),
  stock:(contractorId?:number,showAll=false)=>apiRequest<{items:FlowStock[]}>(root+"/stock"+params({contractorId,showAll})),
  history:(contractorId?:number)=>apiRequest<{items:Record<string,unknown>[]}>(root+"/stock/history"+params({contractorId})),
  stockEvent:(data:unknown)=>apiRequest<{items:FlowStock[]}>(root+"/stock",{method:"POST",json:data}),
  statements:(contractorId?:number)=>apiRequest<{items:Statement[]}>(root+"/statements"+params({contractorId})),
  statement:(id:number)=>apiRequest<Statement>(root+"/statements/"+id),
  unbilled:(contractorId:number,month?:string)=>apiRequest<{items:Record<string,any>[]}>(root+"/statements/unbilled"+params({contractorId,month})),
  createStatement:(data:unknown)=>apiRequest<Statement>(root+"/statements",{method:"POST",json:data}),
  editStatement:(id:number,data:unknown)=>apiRequest<Statement>(root+"/statements/"+id,{method:"PATCH",json:data}),
  confirmStatement:(id:number,revision:number)=>apiRequest<Statement>(root+`/statements/${id}/confirm`,{method:"POST",json:{expectedRevision:revision}}),
  unconfirmStatement:(id:number,revision:number)=>apiRequest<Statement>(root+`/statements/${id}/unconfirm`,{method:"POST",json:{expectedRevision:revision}}),
  deleteStatement:(id:number,revision:number)=>apiRequest<{deleted:boolean}>(root+"/statements/"+id,{method:"DELETE",json:{expectedRevision:revision}}),
  addPayment:(id:number,data:unknown)=>apiRequest<Statement>(root+`/statements/${id}/payments`,{method:"POST",json:data}),
  deletePayment:(id:number,paymentId:number,revision:number)=>apiRequest<Statement>(root+`/statements/${id}/payments/${paymentId}`,{method:"DELETE",json:{expectedRevision:revision}})
};
