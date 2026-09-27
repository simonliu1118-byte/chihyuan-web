import type {
  CreateOutsourcingRequest,
  OutsourcingPartInput,
  OutsourcingTransitionRequest,
  PriceOutsourcingRequest,
  ReceiveOutsourcingRequest,
  UpdateOutsourcingRequest,
} from "../../shared/contractor-outsourcing";
import { parseScaled4 } from "../../shared/fixed-point";
import { FieldValidationError, ValidationBag } from "../validation/fields";

const MAX_PARTS = 100;
const MAX_RECEIPT_ITEMS = 100;

export interface NormalizedOutsourcingPart {
  bomRecipeId: number | null;
  finishedItemId: number | null;
  componentItemId: number;
  quantityScaled4: number;
  unit: string;
  note: string | null;
  sortOrder: number;
}

export interface NormalizedOutsourcingProfile {
  contractorId: number;
  operatorEmployeeId: number;
  orderDate: string;
  parts: readonly NormalizedOutsourcingPart[];
}

export interface NormalizedUpdateOutsourcingRequest extends NormalizedOutsourcingProfile {
  expectedRevision: number;
}

export interface NormalizedTransitionRequest {
  expectedRevision: number;
  effectiveDate: string | null;
  reason: string | null;
}

export interface NormalizedReceiptItem {
  itemId: number;
  bomRecipeId: number | null;
  quantityScaled4: number;
  unit: string;
  note: string | null;
  sortOrder: number;
}

export interface NormalizedReceiveRequest {
  expectedRevision: number;
  receivedDate: string;
  operatorEmployeeId: number;
  items: readonly NormalizedReceiptItem[];
}

export interface NormalizedPriceRequest {
  expectedRevision: number;
  pricedDate: string;
  operatorEmployeeId: number;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new FieldValidationError({ _request: "Request body must be a JSON object" });
  return value as Record<string, unknown>;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(y,m-1,d));
  return parsed.getUTCFullYear()===y && parsed.getUTCMonth()===m-1 && parsed.getUTCDate()===d;
}

function positiveScaled4(value: unknown, path: string, errors: Record<string,string>): number {
  if (typeof value !== "string") { errors[path] = "請以十進位文字輸入"; return 0; }
  try {
    const parsed = parseScaled4(value);
    if (parsed <= 0) errors[path] = "必須大於 0";
    return parsed;
  } catch {
    errors[path] = "最多支援 4 位小數";
    return 0;
  }
}

function positiveId(value: unknown, path: string, errors: Record<string,string>, nullable = false): number | null {
  if (nullable && (value == null || value === "")) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) { errors[path] = "必須是正整數"; return nullable ? null : 0; }
  return value;
}

function normalizeParts(value: unknown, errors: Record<string,string>): readonly NormalizedOutsourcingPart[] {
  if (!Array.isArray(value) || value.length === 0) { errors.parts = "至少需要 1 筆出庫料件"; return []; }
  if (value.length > MAX_PARTS) errors.parts = `出庫料件最多 ${MAX_PARTS} 筆`;
  return value.slice(0,MAX_PARTS).map((entry,index)=>{
    const path=`parts.${index}`;
    const row=entry!=null&&typeof entry==="object"&&!Array.isArray(entry)?entry as Record<string,unknown>:{};
    const componentItemId=positiveId(row.componentItemId,`${path}.componentItemId`,errors)??0;
    const finishedItemId=positiveId(row.finishedItemId,`${path}.finishedItemId`,errors,true);
    const bomRecipeId=positiveId(row.bomRecipeId,`${path}.bomRecipeId`,errors,true);
    const quantityScaled4=positiveScaled4(row.quantity,`${path}.quantity`,errors);
    const unit=typeof row.unit==="string"?row.unit.trim():"";
    if(!unit)errors[`${path}.unit`]="單位必填";
    const note=typeof row.note==="string"?(row.note.trim()||null):row.note==null?null:null;
    if(typeof row.note==="string"&&row.note.length>1000)errors[`${path}.note`]="不可超過 1000 個字元";
    let sortOrder=index;
    if(row.sortOrder!=null){if(typeof row.sortOrder!=="number"||!Number.isInteger(row.sortOrder)||row.sortOrder<0)errors[`${path}.sortOrder`]="必須是 0 以上整數";else sortOrder=row.sortOrder;}
    return{bomRecipeId,finishedItemId,componentItemId,quantityScaled4,unit,note,sortOrder};
  });
}

function normalizeProfile(raw:unknown):NormalizedOutsourcingProfile{
  const input=asObject(raw as CreateOutsourcingRequest|UpdateOutsourcingRequest);
  const errors:Record<string,string>={};
  const contractorId=positiveId(input.contractorId,"contractorId",errors)??0;
  const operatorEmployeeId=positiveId(input.operatorEmployeeId,"operatorEmployeeId",errors)??0;
  const orderDate=typeof input.orderDate==="string"?input.orderDate.trim():"";
  if(!validDate(orderDate))errors.orderDate="日期格式必須為 YYYY-MM-DD";
  const parts=normalizeParts(input.parts,errors);
  if(Object.keys(errors).length>0)throw new FieldValidationError(errors);
  return{contractorId,operatorEmployeeId,orderDate,parts};
}

export function normalizeCreateOutsourcingRequest(raw:unknown):NormalizedOutsourcingProfile{return normalizeProfile(raw);}

export function normalizeUpdateOutsourcingRequest(raw:unknown):NormalizedUpdateOutsourcingRequest{
  const input=asObject(raw);
  const profile=normalizeProfile(input);
  const errors:Record<string,string>={};
  const expectedRevision=positiveId(input.expectedRevision,"expectedRevision",errors)??0;
  if(Object.keys(errors).length>0)throw new FieldValidationError(errors);
  return{...profile,expectedRevision};
}

export function normalizeTransitionRequest(raw:unknown):NormalizedTransitionRequest{
  const input=asObject(raw as OutsourcingTransitionRequest);
  const bag=new ValidationBag(input);
  const expectedRevision=bag.requiredPositiveInteger("expectedRevision")??0;
  const reason=bag.optionalText("reason",{maxLength:1000});
  const errors:Record<string,string>={...bag.fields()};
  let effectiveDate:string|null=null;
  if(input.effectiveDate!=null&&input.effectiveDate!==""){
    effectiveDate=typeof input.effectiveDate==="string"?input.effectiveDate.trim():"";
    if(!validDate(effectiveDate))errors.effectiveDate="日期格式必須為 YYYY-MM-DD";
  }
  if(Object.keys(errors).length>0)throw new FieldValidationError(errors);
  return{expectedRevision,effectiveDate,reason};
}

export function normalizeReceiveRequest(raw:unknown):NormalizedReceiveRequest{
  const input=asObject(raw as ReceiveOutsourcingRequest);
  const errors:Record<string,string>={};
  const expectedRevision=positiveId(input.expectedRevision,"expectedRevision",errors)??0;
  const operatorEmployeeId=positiveId(input.operatorEmployeeId,"operatorEmployeeId",errors)??0;
  const receivedDate=typeof input.receivedDate==="string"?input.receivedDate.trim():"";
  if(!validDate(receivedDate))errors.receivedDate="日期格式必須為 YYYY-MM-DD";
  const rawItems=input.items;
  const items:NormalizedReceiptItem[]=[];
  if(!Array.isArray(rawItems)||rawItems.length===0)errors.items="至少需要 1 筆入庫成品";
  else if(rawItems.length>MAX_RECEIPT_ITEMS)errors.items=`入庫成品最多 ${MAX_RECEIPT_ITEMS} 筆`;
  else rawItems.forEach((entry,index)=>{
    const path=`items.${index}`;
    const row=entry!=null&&typeof entry==="object"&&!Array.isArray(entry)?entry as Record<string,unknown>:{};
    const itemId=positiveId(row.itemId,`${path}.itemId`,errors)??0;
    const bomRecipeId=positiveId(row.bomRecipeId,`${path}.bomRecipeId`,errors,true);
    const quantityScaled4=positiveScaled4(row.quantity,`${path}.quantity`,errors);
    const unit=typeof row.unit==="string"?row.unit.trim():"";
    if(!unit)errors[`${path}.unit`]="單位必填";
    const note=typeof row.note==="string"?(row.note.trim()||null):null;
    let sortOrder=index;
    if(row.sortOrder!=null){if(typeof row.sortOrder!=="number"||!Number.isInteger(row.sortOrder)||row.sortOrder<0)errors[`${path}.sortOrder`]="必須是 0 以上整數";else sortOrder=row.sortOrder;}
    items.push({itemId,bomRecipeId,quantityScaled4,unit,note,sortOrder});
  });
  if(Object.keys(errors).length>0)throw new FieldValidationError(errors);
  return{expectedRevision,receivedDate,operatorEmployeeId,items};
}

export function normalizePriceRequest(raw:unknown):NormalizedPriceRequest{
  const input=asObject(raw as PriceOutsourcingRequest);
  const errors:Record<string,string>={};
  const expectedRevision=positiveId(input.expectedRevision,"expectedRevision",errors)??0;
  const operatorEmployeeId=positiveId(input.operatorEmployeeId,"operatorEmployeeId",errors)??0;
  const pricedDate=typeof input.pricedDate==="string"?input.pricedDate.trim():"";
  if(!validDate(pricedDate))errors.pricedDate="日期格式必須為 YYYY-MM-DD";
  if(Object.keys(errors).length>0)throw new FieldValidationError(errors);
  return{expectedRevision,pricedDate,operatorEmployeeId};
}
