import { isValidTaiwanId } from "../../shared/national-id";
import type { HrStatus } from "../../shared/hr";

export class HrValidationError extends Error {
  constructor(readonly field: string, message: string, readonly status = 422) { super(message); }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HrValidationError("body", "資料格式不正確");
  return value as Record<string, unknown>;
}
export function required(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new HrValidationError(field, "必填或字數超出限制");
  return value.trim();
}
export function optional(value: unknown, field: string, max = 300): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new HrValidationError(field, "格式不正確");
  return value.trim() || null;
}
export function date(value: unknown, field: string): string {
  const text = required(value, field, 10);
  const d = new Date(text + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== text) throw new HrValidationError(field, "日期必須有效且為 YYYY-MM-DD");
  return text;
}
export function nullableDate(value: unknown, field: string): string | null {
  return value === undefined || value === null || value === "" ? null : date(value, field);
}
export function month(value: unknown, field: string): string | null {
  const text=optional(value,field,7);
  if (text && !/^\d{4}\/(0[1-9]|1[0-2])$/.test(text)) throw new HrValidationError(field,"年月格式須為 YYYY/MM");
  return text;
}
export function integer(value: unknown, field: string, positive=false): number {
  if (!Number.isSafeInteger(value) || (value as number)<(positive?1:0)) throw new HrValidationError(field, "必須是整數元");
  return value as number;
}
export function employeeNumber(value: unknown): string {
  const text=required(value,"employeeNo",30);
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(text)) throw new HrValidationError("employeeNo","員工編號格式錯誤");
  return text;
}
export function nationalId(value: unknown): string | null {
  const text=optional(value,"nationalId",10)?.toUpperCase() ?? null;
  if (text && !isValidTaiwanId(text)) throw new HrValidationError("nationalId","身分證／統一證號檢查碼錯誤");
  return text;
}
export function status(value: unknown): HrStatus {
  if (!["probation","active","leave","terminated"].includes(String(value))) throw new HrValidationError("status","人事狀態錯誤");
  return value as HrStatus;
}
export function rows(value: unknown, field: string, max=50): Record<string, unknown>[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length>max) throw new HrValidationError(field,"資料筆數或格式錯誤");
  return value.map(object);
}
