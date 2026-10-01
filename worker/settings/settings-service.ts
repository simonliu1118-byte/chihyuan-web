import type {
  AppTagSetting,
  CreateAppTagRequest,
  CreateLookupSettingRequest,
  CreateWorkLogCategorySettingRequest,
  CreateWorkLogPlatformSettingRequest,
  LookupSetting,
  SettingsAuthority,
  SettingsSnapshot,
  StructuralLookupKind,
  UpdateAppTagRequest,
  UpdateLookupSettingRequest,
  UpdateWorkLogCategorySettingRequest,
  UpdateWorkLogPlatformSettingRequest,
  UpdateWorkLogScoringConfigRequest,
  UpsertWorkLogScoringRowRequest,
  WorkLogCategorySetting,
  WorkLogPlatformSetting,
  WorkLogScoringRowSetting,
} from "../../shared/settings";
import { formatScaled4, parseScaled4 } from "../../shared/fixed-point";
import { AuditService, type AuditEventInput } from "../audit/audit-service";
import { FieldValidationError } from "../validation/fields";

export interface SettingsMutationContext {
  actorMemberId: number;
  role: SettingsAuthority;
  now: string;
  requestId?: string | null;
}

export type SettingsServiceErrorCode =
  | "SETTINGS_ADMIN_REQUIRED"
  | "SETTINGS_SUPER_ADMIN_REQUIRED"
  | "SETTINGS_NOT_FOUND"
  | "SETTINGS_CONFLICT"
  | "SETTINGS_REFERENCE_INVALID";

export class SettingsServiceError extends Error {
  constructor(
    readonly code: SettingsServiceErrorCode,
    readonly status: 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = "SettingsServiceError";
  }
}

const LOOKUP_TABLES: Record<StructuralLookupKind, { table: string; entityType: string; hasParent: boolean }> = {
  department: { table: "departments", entityType: "setting.department", hasParent: false },
  customer_category: { table: "customer_categories", entityType: "setting.customer_category", hasParent: false },
  customer_status: { table: "customer_statuses", entityType: "setting.customer_status", hasParent: false },
  item_category: { table: "item_categories", entityType: "setting.item_category", hasParent: true },
};

function assertContext(context: SettingsMutationContext): void {
  if (!Number.isInteger(context.actorMemberId) || context.actorMemberId <= 0) throw new Error("SETTINGS_ACTOR_REQUIRED");
  if (!context.now || Number.isNaN(Date.parse(context.now))) throw new Error("SETTINGS_TIMESTAMP_REQUIRED");
}

function requiredText(value: unknown, path: string, maxLength: number, errors: Record<string, string>): string {
  if (typeof value !== "string" || !value.trim()) {
    errors[path] = "必填";
    return "";
  }
  const text = value.trim();
  if (text.length > maxLength) errors[path] = `不可超過 ${maxLength} 個字元`;
  return text;
}

function optionalText(value: unknown, path: string, maxLength: number, errors: Record<string, string>): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    errors[path] = "必須是文字";
    return null;
  }
  const text = value.trim();
  if (!text) return null;
  if (text.length > maxLength) errors[path] = `不可超過 ${maxLength} 個字元`;
  return text;
}

function positiveId(value: unknown, path: string, errors: Record<string, string>, nullable = false): number | null {
  if (nullable && (value == null || value === "")) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    errors[path] = "必須是正整數";
    return nullable ? null : 0;
  }
  return value;
}

function nonNegativeInteger(value: unknown, path: string, errors: Record<string, string>, fallback = 0): number {
  if (value == null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    errors[path] = "必須是 0 以上整數";
    return fallback;
  }
  return value;
}

function requiredBoolean(value: unknown, path: string, errors: Record<string, string>): boolean {
  if (typeof value !== "boolean") {
    errors[path] = "必須是布林值";
    return false;
  }
  return value;
}

function expectedUpdatedAt(value: unknown, errors: Record<string, string>): string {
  const text = requiredText(value, "expectedUpdatedAt", 80, errors);
  if (text && Number.isNaN(Date.parse(text))) errors.expectedUpdatedAt = "時間格式無效";
  return text;
}

function normalizeModuleCodes(value: unknown, errors: Record<string, string>): readonly string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.moduleCodes = "必須是陣列";
    return [];
  }
  if (value.length > 100) errors.moduleCodes = "模組最多 100 筆";
  const result: string[] = [];
  const seen = new Set<string>();
  value.slice(0, 100).forEach((entry, index) => {
    if (typeof entry !== "string" || !entry.trim()) {
      errors[`moduleCodes.${index}`] = "模組代碼必填";
      return;
    }
    const code = entry.trim();
    if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(code)) errors[`moduleCodes.${index}`] = "模組代碼格式無效";
    if (seen.has(code)) errors[`moduleCodes.${index}`] = "模組代碼不可重複";
    seen.add(code);
    result.push(code);
  });
  return result;
}

export class SettingsService {
  private readonly audit: AuditService;

  constructor(private readonly db: D1Database) {
    this.audit = new AuditService(db);
  }

  async snapshot(): Promise<SettingsSnapshot> {
    const results = await this.db.batch([
      this.db.prepare("SELECT id,code,name,sort_order,is_active,updated_at FROM departments ORDER BY sort_order,id"),
      this.db.prepare("SELECT id,code,name,sort_order,is_active,updated_at FROM customer_categories ORDER BY sort_order,id"),
      this.db.prepare("SELECT id,code,name,sort_order,is_active,updated_at FROM customer_statuses ORDER BY sort_order,id"),
      this.db.prepare("SELECT id,code,name,group_code,sort_order,is_active FROM regions ORDER BY sort_order,id"),
      this.db.prepare("SELECT id,code,name,parent_id,sort_order,is_active,updated_at FROM item_categories ORDER BY sort_order,id"),
      this.db.prepare("SELECT id,code,name,sort_order,is_active,updated_at FROM app_tags ORDER BY sort_order,id"),
      this.db.prepare("SELECT tag_id,module_code FROM app_tag_modules ORDER BY tag_id,module_code"),
      this.db.prepare("SELECT id,code,name,input_mode,unit_label,sort_order,is_active,updated_at FROM work_log_categories ORDER BY sort_order,id"),
      this.db.prepare("SELECT id,code,name,sort_order,is_active,updated_at FROM work_log_platforms ORDER BY sort_order,id"),
      this.db.prepare("SELECT id,work_log_category_id,custom_name,score_value,description,note,sort_order,is_active,updated_at FROM work_log_scoring_rows ORDER BY sort_order,id"),
      this.db.prepare("SELECT target_average_daily_score,minimum_average_daily_score,revision,updated_at FROM work_log_scoring_config WHERE id=1 LIMIT 1"),
    ]);
    const mapLookup = (rows: readonly Record<string, unknown>[]): LookupSetting[] => rows.map((row) => ({
      id: Number(row.id), code: String(row.code), name: String(row.name), sortOrder: Number(row.sort_order),
      isActive: Number(row.is_active) === 1, updatedAt: String(row.updated_at),
      ...(Object.prototype.hasOwnProperty.call(row, "parent_id") ? { parentId: row.parent_id == null ? null : Number(row.parent_id) } : {}),
    }));
    const tagRows = (results[5]?.results ?? []) as Array<{id:number;code:string;name:string;sort_order:number;is_active:number;updated_at:string}>;
    const tagModules = (results[6]?.results ?? []) as Array<{tag_id:number;module_code:string}>;
    const moduleMap = new Map<number, string[]>();
    tagModules.forEach((row) => { const list = moduleMap.get(row.tag_id) ?? []; list.push(row.module_code); moduleMap.set(row.tag_id, list); });
    const workCategories = (results[7]?.results ?? []) as Array<{id:number;code:string;name:string;input_mode:"boolean"|"quantity";unit_label:string|null;sort_order:number;is_active:number;updated_at:string}>;
    const workPlatforms = (results[8]?.results ?? []) as Array<{id:number;code:string;name:string;sort_order:number;is_active:number;updated_at:string}>;
    const scoringRows = (results[9]?.results ?? []) as Array<{id:number;work_log_category_id:number|null;custom_name:string|null;score_value:number|null;description:string|null;note:string|null;sort_order:number;is_active:number;updated_at:string}>;
    const scoringConfig = (results[10]?.results?.[0] ?? null) as {target_average_daily_score:number|null;minimum_average_daily_score:number|null;revision:number;updated_at:string}|null;
    return {
      departments: mapLookup((results[0]?.results ?? []) as Record<string, unknown>[]),
      customerCategories: mapLookup((results[1]?.results ?? []) as Record<string, unknown>[]),
      customerStatuses: mapLookup((results[2]?.results ?? []) as Record<string, unknown>[]),
      regions: ((results[3]?.results ?? []) as { id: number; code: string; name: string; group_code: string | null; sort_order: number; is_active: number }[]).map(row => ({ id: row.id, code: row.code, name: row.name, groupCode: row.group_code, sortOrder: row.sort_order, isActive: row.is_active === 1 })),
      itemCategories: mapLookup((results[4]?.results ?? []) as Record<string, unknown>[]),
      appTags: tagRows.map<AppTagSetting>((row) => ({id:row.id,code:row.code,name:row.name,sortOrder:row.sort_order,isActive:row.is_active===1,moduleCodes:moduleMap.get(row.id)??[],updatedAt:row.updated_at})),
      workLogCategories: workCategories.map<WorkLogCategorySetting>((row) => ({id:row.id,code:row.code,name:row.name,inputMode:row.input_mode,unitLabel:row.unit_label,sortOrder:row.sort_order,isActive:row.is_active===1,updatedAt:row.updated_at})),
      workLogPlatforms: workPlatforms.map<WorkLogPlatformSetting>((row) => ({id:row.id,code:row.code,name:row.name,sortOrder:row.sort_order,isActive:row.is_active===1,updatedAt:row.updated_at})),
      workLogScoringRows: scoringRows.map<WorkLogScoringRowSetting>((row) => ({id:row.id,workLogCategoryId:row.work_log_category_id,customName:row.custom_name,scoreValue:row.score_value==null?null:formatScaled4(row.score_value),description:row.description,note:row.note,sortOrder:row.sort_order,isActive:row.is_active===1,updatedAt:row.updated_at})),
      workLogScoringConfig: scoringConfig ? {targetAverageDailyScore:scoringConfig.target_average_daily_score==null?null:formatScaled4(scoringConfig.target_average_daily_score),minimumAverageDailyScore:scoringConfig.minimum_average_daily_score==null?null:formatScaled4(scoringConfig.minimum_average_daily_score),revision:scoringConfig.revision,updatedAt:scoringConfig.updated_at} : null,
    };
  }

  async createStructuralLookup(kind: StructuralLookupKind, raw: CreateLookupSettingRequest, context: SettingsMutationContext): Promise<void> {
    this.assertSuperAdmin(context);
    const meta = LOOKUP_TABLES[kind];
    const errors: Record<string, string> = {};
    const code = requiredText(raw.code, "code", 80, errors);
    const name = requiredText(raw.name, "name", 200, errors);
    const sortOrder = nonNegativeInteger(raw.sortOrder, "sortOrder", errors, 0);
    const parentId = meta.hasParent ? positiveId(raw.parentId, "parentId", errors, true) : null;
    if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
    if (meta.hasParent && parentId != null) await this.assertItemCategoryParent(null, parentId);
    const mutation = meta.hasParent
      ? this.db.prepare(`INSERT INTO ${meta.table}(code,name,parent_id,sort_order,is_active,updated_at,updated_by) VALUES(?1,?2,?3,?4,1,?5,?6)`).bind(code,name,parentId,sortOrder,context.now,context.actorMemberId)
      : this.db.prepare(`INSERT INTO ${meta.table}(code,name,sort_order,is_active,updated_at,updated_by) VALUES(?1,?2,?3,1,?4,?5)`).bind(code,name,sortOrder,context.now,context.actorMemberId);
    try { await this.commitAudited(mutation, {entityType:meta.entityType,entityKey:code,action:"setting.created",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,after:{name,sortOrder,isActive:true,parentId}}); }
    catch { throw new SettingsServiceError("SETTINGS_CONFLICT",409,"設定代碼已存在或參照無效"); }
  }

  async updateStructuralLookup(kind: StructuralLookupKind, id: number, raw: UpdateLookupSettingRequest, context: SettingsMutationContext): Promise<void> {
    this.assertSuperAdmin(context);
    const meta = LOOKUP_TABLES[kind];
    const errors: Record<string, string> = {};
    const settingId = positiveId(id, "id", errors) ?? 0;
    const name = requiredText(raw.name, "name", 200, errors);
    const sortOrder = nonNegativeInteger(raw.sortOrder, "sortOrder", errors, 0);
    const isActive = requiredBoolean(raw.isActive, "isActive", errors);
    const expected = expectedUpdatedAt(raw.expectedUpdatedAt, errors);
    const parentId = meta.hasParent ? positiveId(raw.parentId, "parentId", errors, true) : null;
    if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
    if (meta.hasParent && parentId != null) await this.assertItemCategoryParent(settingId, parentId);
    const before = await this.db.prepare(`SELECT code,name,sort_order,is_active,updated_at${meta.hasParent?',parent_id':''} FROM ${meta.table} WHERE id=?`).bind(settingId).first<Record<string, unknown>>();
    if (!before) throw new SettingsServiceError("SETTINGS_NOT_FOUND",404,"設定不存在");
    if (String(before.updated_at) !== expected) throw new SettingsServiceError("SETTINGS_CONFLICT",409,"設定已被其他人修改");
    const mutation = meta.hasParent
      ? this.db.prepare(`UPDATE ${meta.table} SET name=?1,parent_id=?2,sort_order=?3,is_active=?4,updated_at=?5,updated_by=?6 WHERE id=?7 AND updated_at=?8`).bind(name,parentId,sortOrder,isActive?1:0,context.now,context.actorMemberId,settingId,expected)
      : this.db.prepare(`UPDATE ${meta.table} SET name=?1,sort_order=?2,is_active=?3,updated_at=?4,updated_by=?5 WHERE id=?6 AND updated_at=?7`).bind(name,sortOrder,isActive?1:0,context.now,context.actorMemberId,settingId,expected);
    await this.commitAudited(mutation, {entityType:meta.entityType,entityKey:String(settingId),action:"setting.changed",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,before:{name:before.name,sortOrder:before.sort_order,isActive:Number(before.is_active)===1,parentId:before.parent_id??null},after:{name,sortOrder,isActive,parentId}});
  }

  async createAppTag(raw: CreateAppTagRequest, context: SettingsMutationContext): Promise<void> {
    this.assertSuperAdmin(context);
    const errors: Record<string, string> = {};
    const code = requiredText(raw.code,"code",80,errors);
    const name = requiredText(raw.name,"name",160,errors);
    const sortOrder = nonNegativeInteger(raw.sortOrder,"sortOrder",errors,0);
    const moduleCodes = normalizeModuleCodes(raw.moduleCodes,errors);
    if(Object.keys(errors).length>0)throw new FieldValidationError(errors);
    const statements:D1PreparedStatement[]=[this.db.prepare("INSERT INTO app_tags(code,name,sort_order,is_active,updated_at,updated_by) VALUES(?1,?2,?3,1,?4,?5)").bind(code,name,sortOrder,context.now,context.actorMemberId)];
    moduleCodes.forEach(moduleCode=>statements.push(this.db.prepare("INSERT INTO app_tag_modules(tag_id,module_code) SELECT (SELECT MAX(id) FROM app_tags),?1").bind(moduleCode)));
    statements.push(this.audit.prepareRecord({entityType:"app_tag",entityKey:code,action:"app_tag.created",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,after:{name,sortOrder,isActive:true,moduleCodes}}, {sql:"EXISTS(SELECT 1 FROM app_tags WHERE code=? AND updated_at=?)",values:[code,context.now]}));
    try{await this.db.batch(statements)}catch{throw new SettingsServiceError("SETTINGS_CONFLICT",409,"App Tag 代碼已存在")}
  }

  async updateAppTag(id:number,raw:UpdateAppTagRequest,context:SettingsMutationContext):Promise<void>{
    this.assertSuperAdmin(context);const errors:Record<string,string>={};const tagId=positiveId(id,"id",errors)??0;const name=requiredText(raw.name,"name",160,errors);const sortOrder=nonNegativeInteger(raw.sortOrder,"sortOrder",errors);const isActive=requiredBoolean(raw.isActive,"isActive",errors);const expected=expectedUpdatedAt(raw.expectedUpdatedAt,errors);const moduleCodes=normalizeModuleCodes(raw.moduleCodes,errors);if(Object.keys(errors).length>0)throw new FieldValidationError(errors);
    const before=await this.db.prepare("SELECT code,name,sort_order,is_active,updated_at FROM app_tags WHERE id=?").bind(tagId).first<{code:string;name:string;sort_order:number;is_active:number;updated_at:string}>();if(!before)throw new SettingsServiceError("SETTINGS_NOT_FOUND",404,"App Tag 不存在");if(before.updated_at!==expected)throw new SettingsServiceError("SETTINGS_CONFLICT",409,"App Tag 已被其他人修改");const oldModules=(await this.db.prepare("SELECT module_code FROM app_tag_modules WHERE tag_id=? ORDER BY module_code").bind(tagId).all<{module_code:string}>()).results?.map(r=>r.module_code)??[];
    const statements:D1PreparedStatement[]=[this.db.prepare("DELETE FROM app_tag_modules WHERE tag_id=?1 AND EXISTS(SELECT 1 FROM app_tags WHERE id=?1 AND updated_at=?2)").bind(tagId,expected)];moduleCodes.forEach(code=>statements.push(this.db.prepare("INSERT INTO app_tag_modules(tag_id,module_code) SELECT ?1,?2 WHERE EXISTS(SELECT 1 FROM app_tags WHERE id=?1 AND updated_at=?3)").bind(tagId,code,expected)));statements.push(this.db.prepare("UPDATE app_tags SET name=?1,sort_order=?2,is_active=?3,updated_at=?4,updated_by=?5 WHERE id=?6 AND updated_at=?7").bind(name,sortOrder,isActive?1:0,context.now,context.actorMemberId,tagId,expected));statements.push(this.audit.prepareRecord({entityType:"app_tag",entityKey:String(tagId),action:"app_tag.changed",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,before:{name:before.name,sortOrder:before.sort_order,isActive:before.is_active===1,moduleCodes:oldModules},after:{name,sortOrder,isActive,moduleCodes}}, {sql:"changes() = 1",values:[]}));const results=await this.db.batch(statements);const updateIndex=1+moduleCodes.length;if(Number(results[updateIndex]?.meta?.changes??0)!==1)throw new SettingsServiceError("SETTINGS_CONFLICT",409,"App Tag 已被其他人修改");
  }

  async createWorkLogCategory(raw:CreateWorkLogCategorySettingRequest,context:SettingsMutationContext):Promise<void>{this.assertAdmin(context);const normalized=this.normalizeWorkLogCategory(raw);try{const mutation=this.db.prepare("INSERT INTO work_log_categories(code,name,input_mode,unit_label,sort_order,is_active,updated_at,updated_by) VALUES(?1,?2,?3,?4,?5,1,?6,?7)").bind(normalized.code,normalized.name,normalized.inputMode,normalized.unitLabel,normalized.sortOrder,context.now,context.actorMemberId);await this.commitAudited(mutation,{entityType:"work_log_category",entityKey:normalized.code,action:"setting.created",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,after:normalized})}catch{throw new SettingsServiceError("SETTINGS_CONFLICT",409,"WorkLog 分類代碼已存在")}}

  async updateWorkLogCategory(id:number,raw:UpdateWorkLogCategorySettingRequest,context:SettingsMutationContext):Promise<void>{this.assertAdmin(context);const errors:Record<string,string>={};const settingId=positiveId(id,"id",errors)??0;const name=requiredText(raw.name,"name",200,errors);const inputMode=raw.inputMode==="boolean"||raw.inputMode==="quantity"?raw.inputMode:"boolean";if(raw.inputMode!==inputMode)errors.inputMode="必須是 boolean 或 quantity";const unitLabel=optionalText(raw.unitLabel,"unitLabel",40,errors);const sortOrder=nonNegativeInteger(raw.sortOrder,"sortOrder",errors);const isActive=requiredBoolean(raw.isActive,"isActive",errors);const expected=expectedUpdatedAt(raw.expectedUpdatedAt,errors);if(Object.keys(errors).length>0)throw new FieldValidationError(errors);const before=await this.db.prepare("SELECT code,name,input_mode,unit_label,sort_order,is_active,updated_at FROM work_log_categories WHERE id=?").bind(settingId).first<Record<string,unknown>>();if(!before)throw new SettingsServiceError("SETTINGS_NOT_FOUND",404,"WorkLog 分類不存在");if(String(before.updated_at)!==expected)throw new SettingsServiceError("SETTINGS_CONFLICT",409,"WorkLog 分類已被其他人修改");const mutation=this.db.prepare("UPDATE work_log_categories SET name=?1,input_mode=?2,unit_label=?3,sort_order=?4,is_active=?5,updated_at=?6,updated_by=?7 WHERE id=?8 AND updated_at=?9").bind(name,inputMode,unitLabel,sortOrder,isActive?1:0,context.now,context.actorMemberId,settingId,expected);await this.commitAudited(mutation,{entityType:"work_log_category",entityKey:String(settingId),action:"setting.changed",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,before:{name:before.name,inputMode:before.input_mode,unitLabel:before.unit_label,sortOrder:before.sort_order,isActive:Number(before.is_active)===1},after:{name,inputMode,unitLabel,sortOrder,isActive}})}

  async createWorkLogPlatform(raw:CreateWorkLogPlatformSettingRequest,context:SettingsMutationContext):Promise<void>{this.assertAdmin(context);const errors:Record<string,string>={};const code=requiredText(raw.code,"code",80,errors);const name=requiredText(raw.name,"name",200,errors);const sortOrder=nonNegativeInteger(raw.sortOrder,"sortOrder",errors,0);if(Object.keys(errors).length>0)throw new FieldValidationError(errors);try{const mutation=this.db.prepare("INSERT INTO work_log_platforms(code,name,sort_order,is_active,updated_at,updated_by) VALUES(?1,?2,?3,1,?4,?5)").bind(code,name,sortOrder,context.now,context.actorMemberId);await this.commitAudited(mutation,{entityType:"work_log_platform",entityKey:code,action:"setting.created",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,after:{name,sortOrder,isActive:true}})}catch{throw new SettingsServiceError("SETTINGS_CONFLICT",409,"WorkLog 平台代碼已存在")}}

  async updateWorkLogPlatform(id:number,raw:UpdateWorkLogPlatformSettingRequest,context:SettingsMutationContext):Promise<void>{this.assertAdmin(context);const errors:Record<string,string>={};const settingId=positiveId(id,"id",errors)??0;const name=requiredText(raw.name,"name",200,errors);const sortOrder=nonNegativeInteger(raw.sortOrder,"sortOrder",errors);const isActive=requiredBoolean(raw.isActive,"isActive",errors);const expected=expectedUpdatedAt(raw.expectedUpdatedAt,errors);if(Object.keys(errors).length>0)throw new FieldValidationError(errors);const before=await this.db.prepare("SELECT code,name,sort_order,is_active,updated_at FROM work_log_platforms WHERE id=?").bind(settingId).first<Record<string,unknown>>();if(!before)throw new SettingsServiceError("SETTINGS_NOT_FOUND",404,"WorkLog 平台不存在");if(String(before.updated_at)!==expected)throw new SettingsServiceError("SETTINGS_CONFLICT",409,"WorkLog 平台已被其他人修改");const mutation=this.db.prepare("UPDATE work_log_platforms SET name=?1,sort_order=?2,is_active=?3,updated_at=?4,updated_by=?5 WHERE id=?6 AND updated_at=?7").bind(name,sortOrder,isActive?1:0,context.now,context.actorMemberId,settingId,expected);await this.commitAudited(mutation,{entityType:"work_log_platform",entityKey:String(settingId),action:"setting.changed",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,before:{name:before.name,sortOrder:before.sort_order,isActive:Number(before.is_active)===1},after:{name,sortOrder,isActive}})}

  async upsertWorkLogScoringRow(raw: UpsertWorkLogScoringRowRequest, context: SettingsMutationContext): Promise<void> {
    this.assertAdmin(context);
    const normalized = this.normalizeScoringRow(raw);
    const event = { entityType: "work_log_scoring", actorEmployeeId: context.actorMemberId, occurredAt: context.now, requestId: context.requestId };
    try {
      if (raw.id == null) {
        const mutation = this.db.prepare("INSERT INTO work_log_scoring_rows(work_log_category_id,custom_name,score_value,description,note,sort_order,is_active,updated_at,updated_by) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(normalized.categoryId,normalized.customName,normalized.scoreValue,normalized.description,normalized.note,normalized.sortOrder,normalized.isActive?1:0,context.now,context.actorMemberId);
        await this.commitAudited(mutation, { ...event, entityKey: normalized.categoryId ? `category:${normalized.categoryId}` : `custom:${normalized.customName}`, action: "setting.created", after: normalized });
        return;
      }
      const errors: Record<string,string> = {};
      const id = positiveId(raw.id,"id",errors) ?? 0;
      const expected = expectedUpdatedAt(raw.expectedUpdatedAt,errors);
      if (Object.keys(errors).length) throw new FieldValidationError(errors);
      const before = await this.db.prepare("SELECT work_log_category_id,custom_name,score_value,description,note,sort_order,is_active,updated_at FROM work_log_scoring_rows WHERE id=?").bind(id).first<Record<string,unknown>>();
      if (!before) throw new SettingsServiceError("SETTINGS_NOT_FOUND",404,"WorkLog 計分列不存在");
      if (String(before.updated_at) !== expected) throw new SettingsServiceError("SETTINGS_CONFLICT",409,"WorkLog 計分列已被其他人修改");
      const mutation = this.db.prepare("UPDATE work_log_scoring_rows SET work_log_category_id=?1,custom_name=?2,score_value=?3,description=?4,note=?5,sort_order=?6,is_active=?7,updated_at=?8,updated_by=?9 WHERE id=?10 AND updated_at=?11").bind(normalized.categoryId,normalized.customName,normalized.scoreValue,normalized.description,normalized.note,normalized.sortOrder,normalized.isActive?1:0,context.now,context.actorMemberId,id,expected);
      await this.commitAudited(mutation, { ...event, entityKey: String(id), action: "setting.changed", before: { categoryId:before.work_log_category_id,customName:before.custom_name,scoreValue:before.score_value,description:before.description,note:before.note,sortOrder:before.sort_order,isActive:Number(before.is_active)===1 }, after: normalized });
    } catch (error) {
      if (error instanceof SettingsServiceError || error instanceof FieldValidationError) throw error;
      throw new SettingsServiceError("SETTINGS_CONFLICT",409,"WorkLog 計分列重複或參照無效");
    }
  }

  async updateWorkLogScoringConfig(raw: UpdateWorkLogScoringConfigRequest, context: SettingsMutationContext): Promise<void> {
    this.assertAdmin(context);
    const errors: Record<string,string> = {};
    const target = this.parseOptionalScore(raw.targetAverageDailyScore,"targetAverageDailyScore",errors);
    const minimum = this.parseOptionalScore(raw.minimumAverageDailyScore,"minimumAverageDailyScore",errors);
    if (Object.keys(errors).length) throw new FieldValidationError(errors);
    const before = await this.db.prepare("SELECT target_average_daily_score,minimum_average_daily_score,revision,updated_at FROM work_log_scoring_config WHERE id=1").first<{target_average_daily_score:number|null;minimum_average_daily_score:number|null;revision:number;updated_at:string}>();
    const event = { entityType:"work_log_scoring_config",entityKey:"1",actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,after:{targetAverageDailyScore:target,minimumAverageDailyScore:minimum} };
    if (!before) {
      if (raw.expectedRevision != null) throw new SettingsServiceError("SETTINGS_CONFLICT",409,"WorkLog 計分設定狀態已改變");
      try { await this.commitAudited(this.db.prepare("INSERT INTO work_log_scoring_config(id,target_average_daily_score,minimum_average_daily_score,updated_at,updated_by,revision) VALUES(1,?1,?2,?3,?4,1)").bind(target,minimum,context.now,context.actorMemberId), { ...event,action:"setting.created" }); }
      catch { throw new SettingsServiceError("SETTINGS_CONFLICT",409,"WorkLog 計分設定狀態已改變"); }
      return;
    }
    if (raw.expectedRevision !== before.revision) throw new SettingsServiceError("SETTINGS_CONFLICT",409,"WorkLog 計分設定已被其他人修改");
    await this.commitAudited(this.db.prepare("UPDATE work_log_scoring_config SET target_average_daily_score=?1,minimum_average_daily_score=?2,updated_at=?3,updated_by=?4,revision=revision+1 WHERE id=1 AND revision=?5").bind(target,minimum,context.now,context.actorMemberId,before.revision), { ...event, action:"setting.changed",before:{targetAverageDailyScore:before.target_average_daily_score,minimumAverageDailyScore:before.minimum_average_daily_score} });
  }

  private async commitAudited(mutation: D1PreparedStatement, event: AuditEventInput): Promise<void> {
    const results = await this.db.batch([mutation, this.audit.prepareRecord(event, { sql: "changes() = 1", values: [] })]);
    if (Number(results[0]?.meta?.changes ?? 0) !== 1) throw new SettingsServiceError("SETTINGS_CONFLICT",409,"設定已被其他人修改");
  }

  private normalizeWorkLogCategory(raw:CreateWorkLogCategorySettingRequest){const errors:Record<string,string>={};const code=requiredText(raw.code,"code",80,errors);const name=requiredText(raw.name,"name",200,errors);const inputMode=raw.inputMode==="boolean"||raw.inputMode==="quantity"?raw.inputMode:"boolean";if(raw.inputMode!==inputMode)errors.inputMode="必須是 boolean 或 quantity";const unitLabel=optionalText(raw.unitLabel,"unitLabel",40,errors);const sortOrder=nonNegativeInteger(raw.sortOrder,"sortOrder",errors,0);if(Object.keys(errors).length>0)throw new FieldValidationError(errors);return{code,name,inputMode,unitLabel,sortOrder}}
  private normalizeScoringRow(raw:UpsertWorkLogScoringRowRequest){const errors:Record<string,string>={};const categoryId=positiveId(raw.workLogCategoryId,"workLogCategoryId",errors,true);const customName=optionalText(raw.customName,"customName",200,errors);if((categoryId==null)===(customName==null))errors.customName="分類與自訂名稱必須二選一";const scoreValue=this.parseOptionalScore(raw.scoreValue,"scoreValue",errors);const description=optionalText(raw.description,"description",2000,errors);const note=optionalText(raw.note,"note",2000,errors);const sortOrder=nonNegativeInteger(raw.sortOrder,"sortOrder",errors,0);const isActive=raw.isActive==null?true:requiredBoolean(raw.isActive,"isActive",errors);if(Object.keys(errors).length>0)throw new FieldValidationError(errors);return{categoryId,customName,scoreValue,description,note,sortOrder,isActive}}
  private parseOptionalScore(value:unknown,path:string,errors:Record<string,string>):number|null{if(value==null||value==="")return null;if(typeof value!=="string"){errors[path]="請以十進位文字輸入";return null}try{return parseScaled4(value)}catch{errors[path]="最多支援 4 位小數";return null}}
  private async assertItemCategoryParent(id:number|null,parentId:number):Promise<void>{if(id!=null&&id===parentId)throw new SettingsServiceError("SETTINGS_REFERENCE_INVALID",422,"Item Category 不可把自己設為上層");const parent=await this.db.prepare("SELECT id FROM item_categories WHERE id=?").bind(parentId).first<{id:number}>();if(!parent)throw new SettingsServiceError("SETTINGS_REFERENCE_INVALID",422,"上層 Item Category 不存在");if(id!=null){const cycle=await this.db.prepare(`WITH RECURSIVE descendants(id) AS (SELECT id FROM item_categories WHERE parent_id=?1 UNION ALL SELECT c.id FROM item_categories c JOIN descendants d ON c.parent_id=d.id) SELECT 1 AS found FROM descendants WHERE id=?2 LIMIT 1`).bind(id,parentId).first<{found:number}>();if(cycle)throw new SettingsServiceError("SETTINGS_REFERENCE_INVALID",422,"Item Category 階層不可形成循環")}}
  private assertAdmin(context:SettingsMutationContext):void{assertContext(context);if(context.role!=="ADMIN"&&context.role!=="SUPER_ADMIN")throw new SettingsServiceError("SETTINGS_ADMIN_REQUIRED",403,"Admin authority is required")}
  private assertSuperAdmin(context:SettingsMutationContext):void{assertContext(context);if(context.role!=="SUPER_ADMIN")throw new SettingsServiceError("SETTINGS_SUPER_ADMIN_REQUIRED",403,"Super Admin authority is required")}
}
