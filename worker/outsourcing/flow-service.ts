import { parseScaled4, formatScaled4 } from "../../shared/fixed-point";
import { convertScaled4Exact } from "../../shared/unit-conversion";
import { stockGaugeFromMovements, outsourcingLifecycle, outsourcingProgress } from "../../shared/outsourcing-flow";
import { AuditService } from "../audit/audit-service";
import { FieldValidationError } from "../validation/fields";

export interface FlowActor { actorMemberId: number; now: string; requestId?: string | null }
type Row = Record<string, any>;

function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FieldValidationError({ _request: "請提供資料物件" });
  return value as Row;
}
function id(value: unknown, name = "id"): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new FieldValidationError({ [name]: "必須是正整數" });
  return Number(value);
}
function text(value: unknown, name: string, required = true): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (required && !v) throw new FieldValidationError({ [name]: "必填" });
  return v;
}
function date(value: unknown, name: string): string {
  const v = text(value, name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(v+"T00:00:00Z").toISOString().slice(0,10) !== v)
    throw new FieldValidationError({[name]:"日期格式無效"});
  return v;
}
function qty(value: unknown, name: string, positive = true): number {
  let n: number; try { n = parseScaled4(String(value)); } catch { throw new FieldValidationError({[name]:"請輸入最多四位小數的數量"}); }
  if (positive && n <= 0) throw new FieldValidationError({[name]:"必須大於零"});
  if (!positive && n === 0) throw new FieldValidationError({[name]:"不得為零"});
  return n;
}
function rows(value: unknown, name: string): Row[] {
  if (!Array.isArray(value) || value.length === 0) throw new FieldValidationError({[name]:"至少需要一筆"});
  return value.map(object);
}
function uniqueIDs(numbers: number[]): number[] { return [...new Set(numbers)]; }

export class OutsourcingFlowService {
  private audit: AuditService;
  constructor(private db: D1Database) { this.audit = new AuditService(db); }
  private event(action:string,entityType:string,key:string,actor:FlowActor,metadata:Row = {}) {
    return this.audit.prepareRecord({entityType,entityKey:key,action,actorEmployeeId:actor.actorMemberId,occurredAt:actor.now,requestId:actor.requestId,metadata});
  }
  private async order(orderId:number): Promise<Row> {
    const row = await this.db.prepare("SELECT * FROM outsourcing_orders WHERE id=?").bind(orderId).first<Row>();
    if (!row) throw new FieldValidationError({orderId:"找不到代工單"});
    return row;
  }
  private async revision(orderId:number, expected:unknown):Promise<Row> {
    const row=await this.order(orderId);
    if(row.revision!==id(expected,"expectedRevision"))throw new FieldValidationError({expectedRevision:"資料已異動，請重新整理"});
    return row;
  }
  private async itemRefs(itemIds: number[]):Promise<Map<number,Row>> {
    const ids=uniqueIDs(itemIds);const map=new Map<number,Row>();
    if(!ids.length)return map;
    const res=await this.db.prepare(`SELECT id,item_no,name,base_unit FROM items WHERE id IN (${ids.map(()=>"?").join(",")})`).bind(...ids).all<Row>();
    for(const r of res.results??[]) {
      const conversions=await this.db.prepare("SELECT from_unit,to_unit,quantity FROM item_unit_conversions WHERE item_id=?").bind(r.id).all<Row>();
      map.set(r.id,{...r,conversions:(conversions.results??[]).map(c=>({fromUnit:c.from_unit,toUnit:c.to_unit,quantityScaled4:c.quantity}))});
    }
    return map;
  }
  private toBase(quantity:number,unit:string,item:Row):number {
    try{return convertScaled4Exact(quantity,unit,item.base_unit,item.base_unit,item.conversions);}
    catch{throw new FieldValidationError({unit:"料件單位無法換算到基準單位"});}
  }
  async listOrders(query:{q?:string;contractorId?:number}={}) {
    const terms=["1=1"],values:(string|number)[]=[];
    if(query.q){terms.push("(instr(o.outsourcing_ref,?)>0 OR instr(c.display_name,?)>0)");values.push(query.q,query.q);}
    if(query.contractorId){terms.push("o.contractor_id=?");values.push(query.contractorId);}
    const result=await this.db.prepare(`SELECT o.*,c.display_name AS contractor_name,c.billing_method,
      (SELECT COUNT(*) FROM outsourcing_issues i WHERE i.outsourcing_order_id=o.id AND i.cancelled_at IS NULL) AS issue_count
      FROM outsourcing_orders o JOIN contractors c ON c.id=o.contractor_id WHERE ${terms.join(" AND ")}
      ORDER BY o.order_date DESC,o.id DESC LIMIT 100`).bind(...values).all<Row>();
    const items=[];
    for(const row of result.results??[]){const p=await this.productProgress(row.id);items.push({...row,statusCode:outsourcingLifecycle(row.closed_at,row.issue_count,p.map(x=>({planned:x.planned_quantity,delivered:x.delivered_quantity})))});}
    return {items,nextCursor:null};
  }
  private async productProgress(orderId:number) {
    const r=await this.db.prepare(`SELECT p.*,i.item_no,i.name AS item_name,b.recipe_ref,
      COALESCE((SELECT SUM(ri.quantity) FROM outsourcing_receipt_items ri
        JOIN outsourcing_receipts r ON r.id=ri.receipt_id
        WHERE ri.order_product_id=p.id AND r.cancelled_at IS NULL),0) AS delivered_quantity
      FROM outsourcing_order_products p JOIN items i ON i.id=p.item_id
      LEFT JOIN bom_recipes b ON b.id=p.bom_recipe_id
      WHERE p.outsourcing_order_id=? ORDER BY p.sort_order,p.id`).bind(orderId).all<Row>();
    return (r.results??[]).map(p=>({...p,progress:outsourcingProgress(p.planned_quantity,p.delivered_quantity)}));
  }
  async detail(orderId:number) {
    const order=await this.order(orderId);
    const [products,issues,receipts]=await Promise.all([
      this.productProgress(orderId),
      this.db.prepare("SELECT * FROM outsourcing_issues WHERE outsourcing_order_id=? ORDER BY id DESC").bind(orderId).all<Row>(),
      this.db.prepare("SELECT * FROM outsourcing_receipts WHERE outsourcing_order_id=? ORDER BY id DESC").bind(orderId).all<Row>()
    ]);
    const issueRows=[];for(const r of issues.results??[]) {
      const items=await this.db.prepare(`SELECT ii.*,i.item_no,i.name FROM outsourcing_issue_items ii JOIN items i ON i.id=ii.item_id WHERE ii.issue_id=? ORDER BY ii.sort_order`).bind(r.id).all<Row>();
      issueRows.push({...r,items:items.results??[]});
    }
    const receiptRows=[];for(const r of receipts.results??[]) {
      const items=await this.db.prepare(`SELECT ri.*,i.item_no,i.name,sl.statement_id,s.status_code AS statement_status
        FROM outsourcing_receipt_items ri JOIN items i ON i.id=ri.item_id
        LEFT JOIN outsourcing_statement_lines sl ON sl.receipt_item_id=ri.id
        LEFT JOIN outsourcing_statements s ON s.id=sl.statement_id WHERE ri.receipt_id=? ORDER BY ri.sort_order`).bind(r.id).all<Row>();
      receiptRows.push({...r,items:items.results??[]});
    }
    return {...order,products,issues:issueRows,receipts:receiptRows,
      statusCode:outsourcingLifecycle(order.closed_at,issueRows.filter(r=>!r.cancelled_at).length,products.map(p=>({planned:p.planned_quantity,delivered:p.delivered_quantity})))};
  }
  async createOrder(raw:unknown,actor:FlowActor) {
    const body=object(raw), contractorId=id(body.contractorId,"contractorId"),orderDate=date(body.orderDate,"orderDate"),products=rows(body.products,"products");
    const contractor=await this.db.prepare("SELECT display_name FROM contractors WHERE id=? AND is_active=1").bind(contractorId).first<{display_name:string}>();
    if(!contractor)throw new FieldValidationError({contractorId:"協力廠商無效"});
    const refs=await this.itemRefs(products.map(x=>id(x.itemId,"itemId")));
    const normalized=[];
    for(const [index,p] of products.entries()) {
      const itemId=id(p.itemId,"itemId"),item=refs.get(itemId);if(!item)throw new FieldValidationError({itemId:"找不到成品"});
      const bomId=p.bomRecipeId == null ? null : id(p.bomRecipeId,"bomRecipeId");
      if(bomId){const bom=await this.db.prepare("SELECT id FROM bom_recipes WHERE id=? AND finished_item_id=? AND is_active=1").bind(bomId,itemId).first();if(!bom)throw new FieldValidationError({bomRecipeId:"BOM 與成品不符"});}
      normalized.push({itemId,bomId,quantity:qty(p.quantity,"quantity"),unit:text(p.unit,"unit"),sort:index});
    }
    const reference="OUT-"+actor.now.slice(0,10).replace(/-/g,"")+"-"+crypto.randomUUID().slice(0,8).toUpperCase();
    const stmts:D1PreparedStatement[]=[this.db.prepare(`INSERT INTO outsourcing_orders
      (outsourcing_ref,contractor_id,contractor_name_snapshot,order_date,note,created_at,created_by,updated_at,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(reference,contractorId,contractor.display_name,orderDate,text(body.note,"note",false)||null,actor.now,actor.actorMemberId,actor.now,actor.actorMemberId)];
    for(const p of normalized)stmts.push(this.db.prepare(`INSERT INTO outsourcing_order_products
      (outsourcing_order_id,item_id,bom_recipe_id,planned_quantity,unit,sort_order)
      VALUES((SELECT MAX(id) FROM outsourcing_orders),?,?,?,?,?)`).bind(p.itemId,p.bomId,p.quantity,p.unit,p.sort));
    stmts.push(this.event("outsourcing.created","outsourcing_order",reference,actor,{contractorId,productCount:normalized.length}));
    await this.db.batch(stmts);
    const order=await this.db.prepare("SELECT id FROM outsourcing_orders WHERE outsourcing_ref=?").bind(reference).first<{id:number}>();
    return this.detail(order!.id);
  }
  async issue(orderId:number,raw:unknown,actor:FlowActor) {
    const b=object(raw),o=await this.revision(orderId,b.expectedRevision);
    if(o.closed_at)throw new FieldValidationError({orderId:"已結案不可發料"});
    const lines=rows(b.items,"items"),refs=await this.itemRefs(lines.map(x=>id(x.itemId,"itemId")));
    const d=date(b.date,"date");
    const data=lines.map((p,index)=>{const itemId=id(p.itemId,"itemId"),item=refs.get(itemId);
      if(!item)throw new FieldValidationError({itemId:"料件不存在"});
      const unit=text(p.unit,"unit"),quantity=qty(p.quantity,"quantity");
      return{itemId,quantity,unit,delta:this.toBase(quantity,unit,item),index};});
    const stmts:D1PreparedStatement[]=[
      this.db.prepare("INSERT INTO outsourcing_issues(outsourcing_order_id,issued_date,note,created_at,created_by) VALUES(?,?,?,?,?)").bind(orderId,d,text(b.note,"note",false)||null,actor.now,actor.actorMemberId)];
    for(const p of data) {
      stmts.push(this.db.prepare("INSERT INTO outsourcing_issue_items(issue_id,item_id,quantity,unit,sort_order) VALUES((SELECT MAX(id) FROM outsourcing_issues),?,?,?,?)").bind(p.itemId,p.quantity,p.unit,p.index));
      stmts.push(this.db.prepare(`INSERT INTO contractor_stock_movements
        (contractor_id,item_id,movement_type,quantity_delta,occurred_at,issue_id,created_at,operator_employee_id)
        VALUES(?,?,'issue',?, ?, (SELECT MAX(id) FROM outsourcing_issues),?,?)`).bind(o.contractor_id,p.itemId,p.delta,d,actor.now,actor.actorMemberId));
    }
    stmts.push(this.db.prepare("UPDATE outsourcing_orders SET revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?").bind(actor.now,actor.actorMemberId,orderId,o.revision));
    stmts.push(this.event("outsourcing.issued","outsourcing_order",o.outsourcing_ref,actor,{itemCount:data.length}));
    await this.db.batch(stmts);return this.detail(orderId);
  }
  async cancelIssue(orderId:number,issueId:number,raw:unknown,actor:FlowActor) {
    const b=object(raw),o=await this.revision(orderId,b.expectedRevision);
    const issue=await this.db.prepare("SELECT id FROM outsourcing_issues WHERE id=? AND outsourcing_order_id=? AND cancelled_at IS NULL").bind(issueId,orderId).first();
    if(!issue)throw new FieldValidationError({issueId:"發料紀錄不存在或已取消"});
    const moves=await this.db.prepare("SELECT * FROM contractor_stock_movements WHERE issue_id=? AND movement_type='issue'").bind(issueId).all<Row>();
    const stmts:D1PreparedStatement[]=[];
    for(const m of moves.results??[])stmts.push(this.db.prepare(`INSERT INTO contractor_stock_movements
      (contractor_id,item_id,movement_type,quantity_delta,occurred_at,issue_id,reversal_of_movement_id,created_at,operator_employee_id)
      VALUES(?,?,'reversal',?,?,?,?,?,?)`).bind(m.contractor_id,m.item_id,-m.quantity_delta,actor.now,issueId,m.id,actor.now,actor.actorMemberId));
    stmts.push(this.db.prepare("UPDATE outsourcing_issues SET cancelled_at=? WHERE id=? AND cancelled_at IS NULL").bind(actor.now,issueId));
    stmts.push(this.db.prepare("UPDATE outsourcing_orders SET revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?").bind(actor.now,actor.actorMemberId,orderId,o.revision));
    stmts.push(this.event("outsourcing.issue_cancelled","outsourcing_order",o.outsourcing_ref,actor,{issueId}));
    await this.db.batch(stmts);return this.detail(orderId);
  }
  async stock(contractorId?:number,showAll=false) {
    const q=contractorId?"WHERE m.contractor_id=?":"";
    const values=contractorId?[contractorId]:[];
    const res=await this.db.prepare(`SELECT m.id,m.contractor_id,m.item_id,m.movement_type,m.quantity_delta,m.reversal_of_movement_id,
      i.item_no,i.name AS item_name,i.base_unit,c.display_name AS contractor_name,c.billing_method
      FROM contractor_stock_movements m JOIN items i ON i.id=m.item_id JOIN contractors c ON c.id=m.contractor_id
      ${q} ORDER BY m.contractor_id,m.item_id,m.id`).bind(...values).all<Row>();
    const byKey=new Map<string,Row[]>();
    for(const m of res.results??[]){const key=m.contractor_id+":"+m.item_id;byKey.set(key,[...(byKey.get(key)??[]),m]);}
    const items=[];for(const group of byKey.values()){
      const g=stockGaugeFromMovements(group.map(m=>({id:m.id,type:m.movement_type,quantityDelta:m.quantity_delta,reversalOfMovementId:m.reversal_of_movement_id})));
      if(!showAll&&g.balance===0)continue;
      const row=group[0];items.push({contractorId:row.contractor_id,contractorName:row.contractor_name,billingMethod:row.billing_method,itemId:row.item_id,itemNo:row.item_no,itemName:row.item_name,unit:row.base_unit,
        quantity:formatScaled4(g.balance),baseline:formatScaled4(g.baseline),percentage:g.percentage,tone:g.tone});
    }
    return {items};
  }
  async adjustStock(raw:unknown,actor:FlowActor) {
    const b=object(raw),contractorId=id(b.contractorId,"contractorId"),eventType=text(b.type,"type");
    if(eventType!=="return"&&eventType!=="adjust")throw new FieldValidationError({type:"種類錯誤"});
    const reason=eventType==="adjust"?text(b.reason,"reason"):text(b.reason,"reason",false);
    if(eventType==="adjust"&&!["損耗","盤點差異","其他"].includes(reason))throw new FieldValidationError({reason:"請選擇盤點調整原因"});
    if(reason==="其他"&&!text(b.note,"note",false))throw new FieldValidationError({note:"請說明原因"});
    const dateValue=date(b.date,"date"),lines=rows(b.items,"items"),stock=(await this.stock(contractorId,true)).items;
    const refs=await this.itemRefs(lines.map(x=>id(x.itemId,"itemId")));
    const data=[];
    for(const p of lines) {
      const itemId=id(p.itemId,"itemId"),item=refs.get(itemId);
      const previouslyIssued=await this.db.prepare("SELECT 1 FROM contractor_stock_movements WHERE contractor_id=? AND item_id=? AND movement_type='issue' LIMIT 1").bind(contractorId,itemId).first();
      if(!previouslyIssued)throw new FieldValidationError({itemId:"此料件尚未發料，不能退料或調整"});
      if(!item)throw new FieldValidationError({itemId:"料件不存在"});
      const unit=text(p.unit,"unit"),before=qty(stock.find(x=>x.itemId===itemId)?.quantity??"0","quantity",false);
      let delta=eventType==="return"?-this.toBase(qty(p.quantity,"quantity"),unit,item):0;
      if(eventType==="adjust")delta=p.actualQuantity!=null
        ? this.toBase(qty(p.actualQuantity,"actualQuantity",false),unit,item)-before
        : this.toBase(qty(p.delta,"delta",false),unit,item);
      if(delta===0)continue;
      data.push({itemId,unit,delta});
    }
    const stmts:D1PreparedStatement[]=[this.db.prepare("INSERT INTO contractor_stock_events(contractor_id,event_type,event_date,reason,note,created_at,created_by) VALUES(?,?,?,?,?,?,?)").bind(contractorId,eventType,dateValue,reason||null,text(b.note,"note",false)||null,actor.now,actor.actorMemberId)];
    for(const p of data){
      stmts.push(this.db.prepare("INSERT INTO contractor_stock_event_items(event_id,item_id,quantity_delta,unit) VALUES((SELECT MAX(id) FROM contractor_stock_events),?,?,?)").bind(p.itemId,p.delta,p.unit));
      stmts.push(this.db.prepare(`INSERT INTO contractor_stock_movements(contractor_id,item_id,movement_type,quantity_delta,occurred_at,stock_event_id,reason,created_at,operator_employee_id)
        VALUES(?,?,?,?,?,(SELECT MAX(id) FROM contractor_stock_events),?,?,?)`).bind(contractorId,p.itemId,eventType,p.delta,dateValue,reason||null,actor.now,actor.actorMemberId));
    }
    stmts.push(this.event("outsourcing.stock_"+eventType,"contractor",String(contractorId),actor,{itemCount:data.length}));
    await this.db.batch(stmts);return this.stock(contractorId);
  }

  /** Every delivery is independent; consumption is derived from the selected BOM. */
  async receive(orderId:number,raw:unknown,actor:FlowActor) {
    const b=object(raw),o=await this.revision(orderId,b.expectedRevision);
    if(o.closed_at)throw new FieldValidationError({orderId:"已結案不可交貨"});
    const issue=await this.db.prepare("SELECT 1 FROM outsourcing_issues WHERE outsourcing_order_id=? AND cancelled_at IS NULL LIMIT 1").bind(orderId).first();
    if(!issue)throw new FieldValidationError({orderId:"請先登記發料"});
    const dateValue=date(b.date,"date"),lines=rows(b.items,"items");
    const productIds=uniqueIDs(lines.map(x=>id(x.orderProductId,"orderProductId")));
    const products=await this.db.prepare(`SELECT p.*,i.base_unit FROM outsourcing_order_products p JOIN items i ON i.id=p.item_id
      WHERE p.outsourcing_order_id=? AND p.id IN (${productIds.map(()=>"?").join(",")})`).bind(orderId,...productIds).all<Row>();
    const productMap=new Map((products.results??[]).map(p=>[p.id,p]));
    const refs=await this.itemRefs((products.results??[]).map(p=>p.item_id));
    const received=[],movements:{itemId:number;finishedId:number;quantity:number}[]=[];
    for(const [index,x] of lines.entries()) {
      const productId=id(x.orderProductId,"orderProductId"),p=productMap.get(productId);
      if(!p)throw new FieldValidationError({orderProductId:"成品不屬於此代工單"});
      const quantity=qty(x.quantity,"quantity"),unit=text(x.unit,"unit"),finished=refs.get(p.item_id)!;
      const bomId=x.bomRecipeId == null ? p.bom_recipe_id : id(x.bomRecipeId,"bomRecipeId");
      const currentPrice=await this.db.prepare("SELECT pricing_unit,unit_price FROM contractor_pricing WHERE contractor_id=? AND item_id=?").bind(o.contractor_id,p.item_id).first<Row>();
      let pricedUnit=currentPrice?.pricing_unit??null,unitPrice=currentPrice?.unit_price??null;
      if(bomId != null) {
        const bom=await this.db.prepare("SELECT * FROM bom_recipes WHERE id=? AND finished_item_id=? AND is_active=1").bind(bomId,p.item_id).first<Row>();
        if(!bom)throw new FieldValidationError({bomRecipeId:"無效的 BOM"});
        let units:number;
        try{units=convertScaled4Exact(quantity,unit,bom.output_unit,finished.base_unit,finished.conversions);}
        catch{throw new FieldValidationError({unit:"成品數量無法依 BOM 換算"});}
        const bomComponents=await this.db.prepare("SELECT component_item_id,quantity,unit FROM bom_components WHERE bom_recipe_id=?").bind(bomId).all<Row>();
        const componentRefs=await this.itemRefs((bomComponents.results??[]).map(c=>c.component_item_id));
        for(const c of bomComponents.results??[]){
          const numerator=BigInt(units)*BigInt(c.quantity),divisor=BigInt(bom.output_quantity);
          if(numerator%divisor!==0n)throw new FieldValidationError({quantity:"BOM 用料數量超出四位小數精度"});
          const exact=Number(numerator/divisor),material=componentRefs.get(c.component_item_id)!;
          movements.push({itemId:c.component_item_id,finishedId:p.item_id,quantity:-this.toBase(exact,c.unit,material)});
        }
      }
      if(pricedUnit&&!finished.conversions.some((c:Row)=>c.fromUnit===pricedUnit)&&pricedUnit!==finished.base_unit) {
        pricedUnit=null;unitPrice=null;
      }
      received.push({productId,itemId:p.item_id,bomId,quantity,unit,pricedUnit,unitPrice,index});
    }
    const stmt:D1PreparedStatement[]=[this.db.prepare(`INSERT INTO outsourcing_receipts
      (outsourcing_order_id,received_date,erp_no,note,created_at,created_by) VALUES(?,?,?,?,?,?)`)
      .bind(orderId,dateValue,text(b.erpNo,"erpNo",false)||null,text(b.note,"note",false)||null,actor.now,actor.actorMemberId)];
    for(const p of received)stmt.push(this.db.prepare(`INSERT INTO outsourcing_receipt_items
      (receipt_id,order_product_id,item_id,bom_recipe_id,quantity,unit,pricing_unit,unit_price,sort_order)
      VALUES((SELECT MAX(id) FROM outsourcing_receipts),?,?,?,?,?,?,?,?)`).bind(p.productId,p.itemId,p.bomId,p.quantity,p.unit,p.pricedUnit,p.unitPrice,p.index));
    for(const m of movements)stmt.push(this.db.prepare(`INSERT INTO contractor_stock_movements
      (contractor_id,item_id,related_finished_item_id,movement_type,quantity_delta,occurred_at,receipt_id,created_at,operator_employee_id)
      VALUES(?,?,?,'consumption',?, ?, (SELECT MAX(id) FROM outsourcing_receipts),?,?)`)
      .bind(o.contractor_id,m.itemId,m.finishedId,m.quantity,dateValue,actor.now,actor.actorMemberId));
    stmt.push(this.db.prepare("UPDATE outsourcing_orders SET revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?").bind(actor.now,actor.actorMemberId,orderId,o.revision));
    stmt.push(this.event("outsourcing.received","outsourcing_order",o.outsourcing_ref,actor,{itemCount:received.length,erpNo:text(b.erpNo,"erpNo",false)}));
    await this.db.batch(stmt);return this.detail(orderId);
  }

  async cancelReceipt(orderId:number,receiptId:number,raw:unknown,actor:FlowActor){
    const b=object(raw),o=await this.revision(orderId,b.expectedRevision);
    const receipt=await this.db.prepare("SELECT id FROM outsourcing_receipts WHERE id=? AND outsourcing_order_id=? AND cancelled_at IS NULL").bind(receiptId,orderId).first();
    if(!receipt)throw new FieldValidationError({receiptId:"交貨批次不存在或已取消"});
    const confirmed=await this.db.prepare(`SELECT 1 FROM outsourcing_statement_lines sl JOIN outsourcing_statements s ON s.id=sl.statement_id
      JOIN outsourcing_receipt_items ri ON ri.id=sl.receipt_item_id WHERE ri.receipt_id=? AND s.status_code='confirmed' LIMIT 1`).bind(receiptId).first();
    if(confirmed)throw new FieldValidationError({receiptId:"此交貨已進入已確認對帳單"});
    const movements=await this.db.prepare("SELECT * FROM contractor_stock_movements WHERE receipt_id=? AND movement_type='consumption'").bind(receiptId).all<Row>();
    const stmt:D1PreparedStatement[]=[];
    // Draft lines no longer represent valid delivery and must be released.
    stmt.push(this.db.prepare(`DELETE FROM outsourcing_statement_lines WHERE receipt_item_id IN
      (SELECT id FROM outsourcing_receipt_items WHERE receipt_id=?)`).bind(receiptId));
    for(const m of movements.results??[])stmt.push(this.db.prepare(`INSERT INTO contractor_stock_movements
      (contractor_id,item_id,related_finished_item_id,movement_type,quantity_delta,occurred_at,receipt_id,reversal_of_movement_id,created_at,operator_employee_id)
      VALUES(?,?,?,'reversal',?,?,?,?,?,?)`).bind(m.contractor_id,m.item_id,m.related_finished_item_id,-m.quantity_delta,actor.now,receiptId,m.id,actor.now,actor.actorMemberId));
    stmt.push(this.db.prepare("UPDATE outsourcing_receipts SET cancelled_at=? WHERE id=?").bind(actor.now,receiptId));
    stmt.push(this.db.prepare("UPDATE outsourcing_orders SET revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?").bind(actor.now,actor.actorMemberId,orderId,o.revision));
    stmt.push(this.event("outsourcing.receipt_cancelled","outsourcing_order",o.outsourcing_ref,actor,{receiptId}));
    await this.db.batch(stmt);return this.detail(orderId);
  }

  async setClosed(orderId:number,raw:unknown,actor:FlowActor,reopen=false){
    const b=object(raw),o=await this.revision(orderId,b.expectedRevision);
    if(!reopen&&!text(b.reason,"reason"))throw new FieldValidationError({reason:"結案原因必填"});
    if(reopen&&!o.closed_at)throw new FieldValidationError({orderId:"尚未結案"});
    if(!reopen&&o.closed_at)throw new FieldValidationError({orderId:"已結案"});
    await this.db.batch([
      this.db.prepare("UPDATE outsourcing_orders SET closed_at=?,closed_reason=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?")
        .bind(reopen?null:actor.now,reopen?null:text(b.reason,"reason"),actor.now,actor.actorMemberId,orderId,o.revision),
      this.event(reopen?"outsourcing.reopened":"outsourcing.closed","outsourcing_order",o.outsourcing_ref,actor,{reason:reopen?null:text(b.reason,"reason")})
    ]);
    return this.detail(orderId);
  }
  async deleteEmptyOrder(orderId:number,raw:unknown,actor:FlowActor){
    const b=object(raw),o=await this.revision(orderId,b.expectedRevision);
    const hasIssues=await this.db.prepare("SELECT 1 FROM outsourcing_issues WHERE outsourcing_order_id=? LIMIT 1").bind(orderId).first();
    const hasReceipts=await this.db.prepare("SELECT 1 FROM outsourcing_receipts WHERE outsourcing_order_id=? LIMIT 1").bind(orderId).first();
    if(hasIssues||hasReceipts)throw new FieldValidationError({orderId:"已有發料或交貨紀錄，不可刪除"});
    await this.db.batch([
      this.db.prepare("DELETE FROM outsourcing_order_products WHERE outsourcing_order_id=?").bind(orderId),
      this.db.prepare("DELETE FROM outsourcing_orders WHERE id=? AND revision=?").bind(orderId,o.revision),
      this.event("outsourcing.deleted","outsourcing_order",o.outsourcing_ref,actor)
    ]);return {deleted:true,orderId};
  }

}
