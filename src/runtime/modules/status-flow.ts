import type { DefectStatusCode } from "../../../shared/defect";
import type { OutsourcingStatusCode } from "../../../shared/contractor-outsourcing";
import type { SalesWorkOrderStatusCode } from "../../../shared/sales-work-order";
import type { WorkLogStatusCode } from "../../../shared/work-log";

/**
 * One colour language for every workflow status:
 * warning = waiting on someone here to act, info = in progress, success = finished,
 * danger = voided, neutral = draft or inactive.
 */
export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

export const defectTone: Record<DefectStatusCode | "voided", StatusTone> = { created: "warning", processing: "info", resolved: "success", voided: "danger" };
export const orderTone: Record<SalesWorkOrderStatusCode, StatusTone> = { created: "warning", issued: "info", waiting_stock: "info", picked: "info", shipped: "success", voided: "danger" };
export const outsourcingTone: Record<OutsourcingStatusCode, StatusTone> = { pending_outbound: "warning", outbound: "info", received: "info", priced: "info", paid: "success", voided: "danger" };
export const workLogTone: Record<WorkLogStatusCode, StatusTone> = { created: "neutral", pending_review: "warning", reviewed: "success" };

/** "下一步" hint shown above a record: what the current status is waiting for, naming the button to press. */
export const defectNextStep: Record<DefectStatusCode | "voided", string> = {
  created: "確認問題後按「開始處理」；建錯了可以「刪除」。",
  processing: "處理完成後按「完成處理」，填寫處理結果。",
  resolved: "已結案。問題再次發生時可以「重新開啟」。",
  voided: "已作廢，僅供查詢。",
};
export const orderNextStep: Record<SalesWorkOrderStatusCode, string> = {
  created: "在 ERP 開好銷貨單後，按「ERP 回填／開單」填入 ERP 單號。",
  issued: "有貨就按「直接撿貨」；需要等貨按「轉待貨」。",
  waiting_stock: "貨到並撿好後按「完成撿貨」。",
  picked: "交貨後按「確認出貨」。",
  shipped: "已出貨。誤按時可以「撤銷出貨」。",
  voided: "已作廢，僅供查詢。",
};
export const outsourcingNextStep: Record<OutsourcingStatusCode, string> = {
  pending_outbound: "料件交給代工對象後按「確認出庫」。",
  outbound: "成品收回後按「確認入庫」。",
  received: "按「計價」，依代工單價計算應付金額。",
  priced: "付款後按「確認付款」。",
  paid: "流程已完成。",
  voided: "已作廢，僅供查詢。",
};
export const workLogNextStep: Record<WorkLogStatusCode, string> = {
  created: "內容確認後按「送出審核」。",
  pending_review: "等待審核；審核人按「審核計分」，需要修改時可以「撤回審核」。",
  reviewed: "已完成審核。",
};
