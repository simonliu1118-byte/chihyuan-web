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
