import { ERP_QUERY_TYPES, ERP_QUERY_TYPE_LABELS, type ErpQueryType } from "../../../shared/erp-item-query";
import { formatDate, formatDateTime } from "../../ui/foundation/format";
import type { AuditEvent } from "../api/settings-audit-client";

const entityNames: Record<string,string> = {
  customer:"客戶",customer_visit:"拜訪紀錄",customer_item_quote:"報價紀錄",customer_frequent_item:"常用商品",
  item:"商品",defect:"瑕疵",sales_work_order:"銷售工單",outsourcing_order:"代工單",
  outsourcing:"代工單",contractor:"協力廠商",contractor_price:"代工單價",bom_recipe:"材料清單",
  work_log:"工作日誌",setting:"設定",customer_category:"客戶分類",customer_status:"客戶狀態",
  department:"部門",item_category:"商品分類",work_log_category:"日誌類別",
  work_log_platform:"日誌平台",work_log_scoring_row:"計分參考列",work_log_scoring_config:"計分門檻",
  module_access:"使用權",module_access_group:"權限群組",app_tag:"標籤",
  backup:"備份",erp_item_query:"ERP 查詢",erp_item_agent:"ERP 連線服務",
};
export const entityLabel = (type: string): string => entityNames[type] ?? "資料";
export const actionLabels: Record<string,string> = {
  "customer.created":"新增客戶","customer.updated":"修改客戶","customer.deleted":"刪除客戶",
  "customer.number.changed":"更改客戶編號",
  "customer_visit.created":"新增拜訪紀錄","customer_visit.updated":"修改拜訪紀錄",
  "customer_visit.deleted":"刪除拜訪紀錄","customer_visit.corrected":"修正拜訪紀錄",
  "customer_item_quote.created":"新增報價紀錄","customer_item_quote.corrected":"修正報價紀錄",
  "customer_item_quote.deleted":"刪除報價紀錄",
  "customer_frequent_item.created":"加入常用商品","customer_frequent_item.deleted":"移除常用商品",
  "customer.visit.created":"新增拜訪紀錄","customer.visit.updated":"修改拜訪紀錄",
  "customer.visit.deleted":"刪除拜訪紀錄","customer.quote.created":"新增報價紀錄",
  "customer.quote.corrected":"修正報價紀錄","customer.frequent_item.created":"加入常用商品",
  "customer.frequent_item.deleted":"移除常用商品",
  "item.created":"新增商品","item.updated":"修改商品","item.deleted":"刪除商品",
  "item.number.changed":"更改品號",
  "defect.created":"新增瑕疵","defect.updated":"修改瑕疵","defect.processing":"開始處理瑕疵",
  "defect.resolved":"完成瑕疵處理","defect.reopened":"重新開啟瑕疵",
  "defect.invalidated":"作廢瑕疵","defect.deleted":"刪除瑕疵",
  "sales_work_order.created":"新增銷售工單","sales_work_order.updated":"修改銷售工單",
  "sales_work_order.waiting_stock":"等待備貨","sales_work_order.picked":"完成備貨",
  "sales_work_order.shipped":"出貨","sales_work_order.voided":"作廢銷售工單",
  "sales_work_order.deleted":"刪除銷售工單","sales_work_order.erp.filled":"填入 ERP 單號",
  "sales_work_order.erp.corrected":"更正 ERP 單號",
  "outsourcing.created":"新增代工單","outsourcing.updated":"修改代工單",
  "outsourcing.outbound.confirmed":"確認出庫","outsourcing.outbound.corrected":"更正出庫",
  "outsourcing.outbound.cancelled":"取消出庫","outsourcing.received":"確認入庫",
  "outsourcing.receipt.cancelled":"取消入庫","outsourcing.priced":"完成計價",
  "outsourcing.pricing.cancelled":"取消計價","outsourcing.paid":"確認付款",
  "outsourcing.payment.cancelled":"取消付款","outsourcing.deleted":"刪除代工單",
  "contractor.created":"新增協力廠商","contractor.updated":"修改協力廠商",
  "contractor.deleted":"刪除協力廠商","contractor_price.created":"新增代工單價",
  "contractor_price.changed":"修改代工單價","bom.created":"新增材料清單",
  "bom.changed":"修改材料清單","bom_recipe.created":"新增材料清單","bom_recipe.changed":"修改材料清單",
  "work_log.created":"新增工作日誌","work_log.updated":"修改工作日誌",
  "work_log.submitted":"送審工作日誌","work_log.withdrawn":"撤回送審",
  "work_log.review.submitted":"送出工作日誌審核","work_log.review.withdrawn":"撤回工作日誌審核",
  "work_log.reviewed":"審核工作日誌","work_log.review.cancelled":"取消工作日誌審核",
  "work_log.deleted":"刪除工作日誌",
  "setting.created":"新增設定","setting.changed":"修改設定",
  "app_tag.created":"新增標籤","app_tag.changed":"修改標籤",
  "module_access.updated":"修改使用權","module_access.group_assigned":"指派權限群組",
  "module_access_group.created":"新增權限群組","module_access_group.updated":"修改權限群組",
  "module_access_group.deleted":"刪除權限群組",
  "erp_item_query.created":"送出 ERP 查詢","erp_item_query.completed":"完成 ERP 查詢",
  "erp_item_query.failed":"ERP 查詢失敗","erp_item_query.expired":"ERP 查詢逾時",
  "erp_item_agent.credential_rotated":"更新 ERP 連線密鑰",
  "erp_item_agent.credential_revoked":"撤銷 ERP 連線密鑰",
  "backup.started":"開始備份","backup.completed":"完成備份","backup.failed":"備份失敗",
  "backup.rehearsal.started":"開始還原演練","backup.rehearsal.verified":"還原演練驗證成功",
  "backup.rehearsal.failed":"還原演練失敗","backup.copy.failed":"備份副本失敗",
  "backup.copy.verified":"備份副本完成",
};
export function actionLabel(action: string, type = ""): string {
  if (actionLabels[action]) return actionLabels[action];
  const suffix = action.split(".").at(-1) ?? "";
  const verb = /^(created|added)$/.test(suffix) ? "新增"
    : /^(deleted|removed)$/.test(suffix) ? "刪除"
    : /^(updated|changed|corrected|modified)$/.test(suffix) ? "修改" : "異動";
  return verb + entityLabel(type || action.split(".")[0]);
}
const fields:Record<string,string> = {
  name:"名稱",shortName:"簡稱",fullName:"完整名稱",displayName:"姓名",employeeNo:"員工編號",
  code:"代碼",customerNo:"客戶編號",itemNo:"品號",workOrderRef:"工單編號",
  outsourcingRef:"代工單號",customerNameSnapshot:"客戶名稱",itemNameSnapshot:"商品名稱",
  taxId:"統一編號",phone:"電話",mobile:"手機",fax:"傳真",address:"地址",note:"備註",
  description:"說明",content:"內容",reason:"原因",quantity:"數量",unit:"單位",
  unitPrice:"單價",totalAmount:"總金額",amount:"金額",scoreValue:"分數",
  categoryId:"分類",customerCategoryId:"客戶分類",customerStatusId:"客戶狀態",
  regionId:"地區",ownerDepartmentId:"負責部門",departmentId:"部門",
  ownerEmployeeId:"負責人",operatorEmployeeId:"作業人員",
  itemCategoryId:"商品分類",itemId:"商品",customerId:"客戶",
  status:"狀態",statusCode:"狀態",statusFrom:"原狀態",statusTo:"新狀態",
  isActive:"啟用",enabled:"開放使用",sortOrder:"排序",revision:"資料版本",
  visitDate:"拜訪日期",quoteDate:"報價日期",orderDate:"工單日期",logDate:"日誌日期",
  reportedDate:"回報日期",outboundDate:"出庫日期",receivedDate:"入庫日期",
  shippedDate:"出貨日期",paidAt:"付款時間",updatedAt:"最後修改",
  createdAt:"建立時間",targetEmployeeId:"使用者",moduleCode:"模組",
  modules:"模組使用權",applications:"系統使用權",groupId:"權限群組",
  inputMode:"輸入方式",unitLabel:"數量單位",minimumAverageDailyScore:"最低日平均分數",
  targetAverageDailyScore:"目標日平均分數",priceBreaks:"報價級距",
  phones:"電話",contacts:"聯絡人",addresses:"地址",notes:"備註",parts:"出庫料件",
};
export function fieldLabel(_entityType:string,key:string):string { return fields[key] ?? key; }
export type FieldLookup = Record<string,Record<string,string>>;
const statusText:Record<string,string> = {
  created:"已建檔",processing:"處理中",resolved:"已完成",voided:"已作廢",
  issued:"已開單",waiting_stock:"待貨",picked:"已撿貨",shipped:"已出貨",
  pending_outbound:"待出庫",outbound:"已出庫",received:"已入庫",priced:"已計價",paid:"已付款",
  pending_review:"待審核",reviewed:"已審核",QUEUED:"排隊中",RUNNING:"查詢中",DONE:"已完成",
  FAILED:"失敗",EXPIRED:"逾時",NOT_FOUND:"查無資料",
};
const lookupKey:Record<string,string> = {
  categoryId:"customerCategories",customerCategoryId:"customerCategories",
  customerStatusId:"customerStatuses",regionId:"regions",departmentId:"departments",
  ownerDepartmentId:"departments",itemCategoryId:"itemCategories",
  ownerEmployeeId:"employees",operatorEmployeeId:"employees",itemId:"items",
  groupId:"groups",
};
export function fieldValue(type:string,key:string,value:unknown,lookups:FieldLookup = {}):string {
  if(value===null || value===undefined || value==="")return "—";
  if(typeof value==="boolean")return value?"是":"否";
  if(key==="inputMode")return value==="quantity"?"數量":"是否完成";
  if((key==="status"||key==="statusCode") && typeof value==="string")return statusText[value] ?? "未定義狀態";
  const category=lookupKey[key];
  if(category && (typeof value==="number"||typeof value==="string"))return lookups[category]?.[String(value)] ?? String(value);
  if(/(?:At|Time)$/.test(key) && typeof value==="string")return formatDateTime(value);
  if(/Date$/.test(key) && typeof value==="string")return formatDate(value);
  if(typeof value==="number")return String(value);
  if(typeof value==="string")return value;
  if(Array.isArray(value))return "共 " + value.length + " 筆";
  if(typeof value==="object")return "資料內容";
  return String(value);
}
const names = ["shortName", "name", "displayName", "customerNameSnapshot", "itemNameSnapshot",
  "fullName", "workOrderRef", "outsourcingRef", "itemNo", "customerNo", "code"];
const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const internalToken = /^(?:[A-Z][A-Z_0-9]{2,}|#?\\d+)$/;
function safeDisplay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || uuidPattern.test(text) || internalToken.test(text) || /#\\d+/.test(text)) return null;
  return text;
}
/** Names must be real business labels, never database keys or internal UUIDs. */
export function recordName(event: AuditEvent): string {
  for (const payload of [event.after, event.before, event.metadata]) {
    if (!payload) continue;
    for (const name of names) {
      const value = safeDisplay(payload[name]);
      if (value) return value;
    }
  }
  return entityLabel(event.entityType);
}
function erpQuerySentence(event: AuditEvent): string {
  const meta = event.metadata ?? event.after ?? event.before ?? {};
  const code = meta.queryType;
  const kind = typeof code === "string" && ERP_QUERY_TYPES.some(type => type === code)
    ? ERP_QUERY_TYPE_LABELS[code as ErpQueryType] : "資料";
  const query = [meta.itemNo, meta.keyword, meta.code, meta.targetCode, meta.orderNo]
    .find(value => typeof value === "string" && value.trim() && !uuidPattern.test(value));
  const safeQuery = typeof query === "string" ? query.trim().replace(/[「」]/g, "") : "查詢內容未保留";
  const status = event.statusTo === "EXPIRED" || event.action.endsWith(".expired")
    ? "逾時" : event.statusTo === "FAILED" || event.action.endsWith(".failed")
      ? "失敗" : "成功";
  return `查詢 ERP ${kind}「${safeQuery}」：${status}`;
}
export function auditChanges(event:AuditEvent, lookups:FieldLookup={}):
  {key:string;label:string;before:string;after:string}[] {
  const a=event.before??{},b=event.after??{};
  const keys=new Set([...Object.keys(a),...Object.keys(b)]);
  const results=[...keys].filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(key=>({
    key,label:fieldLabel(event.entityType,key),
    before:fieldValue(event.entityType,key,a[key],lookups),
    after:fieldValue(event.entityType,key,b[key],lookups),
  }));
  if(event.statusFrom!==event.statusTo && (event.statusFrom || event.statusTo)){
    results.push({key:"status",label:"狀態",before:fieldValue(event.entityType,"status",event.statusFrom,lookups),
      after:fieldValue(event.entityType,"status",event.statusTo,lookups)});
  }
  return results;
}
/** Sentence only: the shared list supplies its own time and actor prefix. */
export function auditSentence(event: AuditEvent, lookups: FieldLookup = {}): string {
  if (event.entityType === "erp_item_query") return erpQuerySentence(event);
  const label = actionLabel(event.action, event.entityType);
  const name = recordName(event);
  const target = name === entityLabel(event.entityType) ? "" : `「${name}」`;
  const changes = auditChanges(event, lookups);
  const status = changes.find(row => row.key === "status" || row.key === "statusCode");
  const shown = status && (status.before !== "—" || status.after !== "—")
    ? `：狀態：${status.before} → ${status.after}` : "";
  return label + target + shown;
}
