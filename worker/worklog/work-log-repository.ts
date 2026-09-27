import type {
  WorkLogConfiguration,
  WorkLogDetail,
  WorkLogListResult,
  WorkLogSearchQuery,
  WorkLogStatisticsQuery,
  WorkLogStatisticsResult,
  WorkLogStatusCode,
  WorkLogSummary,
} from "../../shared/work-log";
import { formatScaled4 } from "../../shared/fixed-point";

type D1Scalar = string | number | null;

type LogRow = {
  id: number;
  work_log_ref: string;
  log_date: string;
  date_from: string;
  date_to: string;
  work_days: number;
  type_code: string;
  employee_id: number;
  status_code: WorkLogStatusCode;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_remark?: string | null;
  final_score: number | null;
  average_daily_score: number | null;
  created_at?: string;
  updated_at: string;
  revision: number;
};

export interface WorkLogRecordState {
  id: number;
  workLogRef: string;
  employeeId: number;
  statusCode: WorkLogStatusCode;
  workDaysScaled4: number;
  revision: number;
}

export interface WorkLogCategoryRecord {
  id: number;
  code: string;
  name: string;
  inputMode: "boolean" | "quantity";
  unitLabel: string | null;
  isActive: boolean;
}

export interface WorkLogPlatformRecord {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function encodeCursor(id: number): string {
  return btoa(String(id)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCursor(cursor: string | undefined): number | null {
  if (!cursor) return null;
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(cursor)) return null;
  try {
    const normalized = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const id = Number(atob(padded));
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function toSummary(row: LogRow): WorkLogSummary {
  return {
    id: row.id,
    workLogRef: row.work_log_ref,
    logDate: row.log_date,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    workDays: formatScaled4(row.work_days),
    typeCode: row.type_code,
    employeeId: row.employee_id,
    statusCode: row.status_code,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    finalScore: row.final_score == null ? null : formatScaled4(row.final_score),
    averageDailyScore: row.average_daily_score == null ? null : formatScaled4(row.average_daily_score),
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

export class WorkLogRepository {
  constructor(private readonly db: D1Database) {}

  async search(query: WorkLogSearchQuery): Promise<WorkLogListResult> {
    const where: string[] = [];
    const params: D1Scalar[] = [];
    const keyword = query.q?.trim() ?? "";
    if (keyword) {
      const like = `%${escapeLike(keyword)}%`;
      where.push("(l.work_log_ref LIKE ? ESCAPE '\\' OR l.type_code LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM work_log_entries e WHERE e.work_log_id=l.id AND e.content LIKE ? ESCAPE '\\'))");
      params.push(like, like, like);
    }
    if (query.employeeId != null && Number.isInteger(query.employeeId) && query.employeeId > 0) {
      where.push("l.employee_id = ?");
      params.push(query.employeeId);
    }
    if (query.statusCode) {
      where.push("l.status_code = ?");
      params.push(query.statusCode);
    }
    if (query.typeCode?.trim()) {
      where.push("l.type_code = ?");
      params.push(query.typeCode.trim());
    }
    if (query.dateFrom) {
      where.push("l.log_date >= ?");
      params.push(query.dateFrom);
    }
    if (query.dateTo) {
      where.push("l.log_date <= ?");
      params.push(query.dateTo);
    }
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && cursor == null) return { items: [], nextCursor: null };
    if (cursor != null) {
      where.push("l.id < ?");
      params.push(cursor);
    }
    const limit = query.limit != null && Number.isInteger(query.limit) && query.limit > 0
      ? Math.min(query.limit, 100)
      : 30;
    params.push(limit + 1);
    const result = await this.db.prepare(`
      SELECT l.id,l.work_log_ref,l.log_date,l.date_from,l.date_to,l.work_days,l.type_code,
             l.employee_id,l.status_code,l.reviewed_by,l.reviewed_at,l.final_score,
             l.average_daily_score,l.updated_at,l.revision
        FROM work_logs l
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY l.id DESC
       LIMIT ?
    `).bind(...params).all<LogRow>();
    const rows = result.results ?? [];
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible[visible.length - 1];
    return { items: visible.map(toSummary), nextCursor: hasMore && last ? encodeCursor(last.id) : null };
  }

  async getDetail(workLogId: number): Promise<WorkLogDetail | null> {
    const results = await this.db.batch([
      this.db.prepare(`
        SELECT id,work_log_ref,log_date,date_from,date_to,work_days,type_code,employee_id,status_code,
               reviewed_by,reviewed_at,review_remark,final_score,average_daily_score,created_at,updated_at,revision
          FROM work_logs WHERE id=? LIMIT 1
      `).bind(workLogId),
      this.db.prepare(`
        SELECT id,entry_type_code,content,platform_id,review_remark,review_score,sort_order
          FROM work_log_entries WHERE work_log_id=? ORDER BY sort_order,id
      `).bind(workLogId),
      this.db.prepare(`
        SELECT c.id,c.work_log_entry_id,c.work_log_category_id,c.quantity,c.sort_order
          FROM work_log_entry_categories c
          JOIN work_log_entries e ON e.id=c.work_log_entry_id
         WHERE e.work_log_id=?
         ORDER BY e.sort_order,e.id,c.sort_order,c.id
      `).bind(workLogId),
    ]);
    const row = (results[0]?.results?.[0] ?? null) as LogRow | null;
    if (!row) return null;
    const entries = (results[1]?.results ?? []) as Array<{
      id:number;entry_type_code:string;content:string|null;platform_id:number|null;
      review_remark:string|null;review_score:number|null;sort_order:number;
    }>;
    const categories = (results[2]?.results ?? []) as Array<{
      id:number;work_log_entry_id:number;work_log_category_id:number;quantity:number;sort_order:number;
    }>;
    const byEntry = new Map<number, typeof categories>();
    categories.forEach((category) => {
      const list = byEntry.get(category.work_log_entry_id) ?? [];
      list.push(category);
      byEntry.set(category.work_log_entry_id, list);
    });
    return {
      ...toSummary(row),
      reviewRemark: row.review_remark ?? null,
      createdAt: row.created_at ?? row.updated_at,
      entries: entries.map((entry) => ({
        id: entry.id,
        entryTypeCode: entry.entry_type_code,
        content: entry.content,
        platformId: entry.platform_id,
        reviewRemark: entry.review_remark,
        reviewScore: entry.review_score == null ? null : formatScaled4(entry.review_score),
        sortOrder: entry.sort_order,
        categories: (byEntry.get(entry.id) ?? []).map((category) => ({
          id: category.id,
          workLogCategoryId: category.work_log_category_id,
          quantity: formatScaled4(category.quantity),
          sortOrder: category.sort_order,
        })),
      })),
    };
  }

  async getRecordState(workLogId: number): Promise<WorkLogRecordState | null> {
    const row = await this.db.prepare(`
      SELECT id,work_log_ref,employee_id,status_code,work_days,revision
        FROM work_logs WHERE id=? LIMIT 1
    `).bind(workLogId).first<{id:number;work_log_ref:string;employee_id:number;status_code:WorkLogStatusCode;work_days:number;revision:number}>();
    return row ? {
      id: row.id,
      workLogRef: row.work_log_ref,
      employeeId: row.employee_id,
      statusCode: row.status_code,
      workDaysScaled4: row.work_days,
      revision: row.revision,
    } : null;
  }

  async resolveCategories(ids: readonly number[]): Promise<Map<number, WorkLogCategoryRecord>> {
    const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
    if (unique.length === 0) return new Map();
    const placeholders = unique.map(() => "?").join(",");
    const result = await this.db.prepare(`
      SELECT id,code,name,input_mode,unit_label,is_active
        FROM work_log_categories WHERE id IN (${placeholders})
    `).bind(...unique).all<{id:number;code:string;name:string;input_mode:"boolean"|"quantity";unit_label:string|null;is_active:number}>();
    return new Map((result.results ?? []).map((row) => [row.id, {
      id: row.id,
      code: row.code,
      name: row.name,
      inputMode: row.input_mode,
      unitLabel: row.unit_label,
      isActive: row.is_active === 1,
    }]));
  }

  async resolvePlatforms(ids: readonly number[]): Promise<Map<number, WorkLogPlatformRecord>> {
    const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
    if (unique.length === 0) return new Map();
    const placeholders = unique.map(() => "?").join(",");
    const result = await this.db.prepare(`
      SELECT id,code,name,is_active FROM work_log_platforms WHERE id IN (${placeholders})
    `).bind(...unique).all<{id:number;code:string;name:string;is_active:number}>();
    return new Map((result.results ?? []).map((row) => [row.id, {
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.is_active === 1,
    }]));
  }

  async entryIds(workLogId: number): Promise<ReadonlySet<number>> {
    const result = await this.db.prepare("SELECT id FROM work_log_entries WHERE work_log_id=?").bind(workLogId).all<{id:number}>();
    return new Set((result.results ?? []).map((row) => row.id));
  }

  async getConfiguration(includeInactive = false): Promise<WorkLogConfiguration> {
    const active = includeInactive ? "" : " WHERE is_active=1";
    const results = await this.db.batch([
      this.db.prepare(`SELECT id,code,name,input_mode,unit_label,sort_order,is_active FROM work_log_categories${active} ORDER BY sort_order,id`),
      this.db.prepare(`SELECT id,code,name,sort_order,is_active FROM work_log_platforms${active} ORDER BY sort_order,id`),
      this.db.prepare(`SELECT id,work_log_category_id,custom_name,score_value,description,note,sort_order,is_active FROM work_log_scoring_rows${active} ORDER BY sort_order,id`),
      this.db.prepare("SELECT target_average_daily_score,minimum_average_daily_score,revision,updated_at FROM work_log_scoring_config WHERE id=1 LIMIT 1"),
    ]);
    const categories = (results[0]?.results ?? []) as Array<{id:number;code:string;name:string;input_mode:"boolean"|"quantity";unit_label:string|null;sort_order:number;is_active:number}>;
    const platforms = (results[1]?.results ?? []) as Array<{id:number;code:string;name:string;sort_order:number;is_active:number}>;
    const scoring = (results[2]?.results ?? []) as Array<{id:number;work_log_category_id:number|null;custom_name:string|null;score_value:number|null;description:string|null;note:string|null;sort_order:number;is_active:number}>;
    const config = (results[3]?.results?.[0] ?? null) as {target_average_daily_score:number|null;minimum_average_daily_score:number|null;revision:number;updated_at:string}|null;
    return {
      categories: categories.map((row) => ({id:row.id,code:row.code,name:row.name,inputMode:row.input_mode,unitLabel:row.unit_label,sortOrder:row.sort_order,isActive:row.is_active===1})),
      platforms: platforms.map((row) => ({id:row.id,code:row.code,name:row.name,sortOrder:row.sort_order,isActive:row.is_active===1})),
      scoringRows: scoring.map((row) => ({id:row.id,workLogCategoryId:row.work_log_category_id,customName:row.custom_name,scoreValue:row.score_value==null?null:formatScaled4(row.score_value),description:row.description,note:row.note,sortOrder:row.sort_order,isActive:row.is_active===1})),
      scoringConfig: config ? {targetAverageDailyScore:config.target_average_daily_score==null?null:formatScaled4(config.target_average_daily_score),minimumAverageDailyScore:config.minimum_average_daily_score==null?null:formatScaled4(config.minimum_average_daily_score),revision:config.revision,updatedAt:config.updated_at} : null,
    };
  }

  async statistics(query: WorkLogStatisticsQuery): Promise<WorkLogStatisticsResult> {
    const where = ["status_code='reviewed'"];
    const params: D1Scalar[] = [];
    if (query.employeeId != null && Number.isInteger(query.employeeId) && query.employeeId > 0) { where.push("employee_id=?"); params.push(query.employeeId); }
    if (query.dateFrom) { where.push("log_date>=?"); params.push(query.dateFrom); }
    if (query.dateTo) { where.push("log_date<=?"); params.push(query.dateTo); }
    const result = await this.db.prepare(`
      SELECT id,work_log_ref,log_date,work_days,final_score,average_daily_score
        FROM work_logs
       WHERE ${where.join(" AND ")}
       ORDER BY log_date ASC,id ASC
       LIMIT 1000
    `).bind(...params).all<{id:number;work_log_ref:string;log_date:string;work_days:number;final_score:number;average_daily_score:number}>();
    const rows = result.results ?? [];
    let totalWorkDays = 0;
    let totalFinalScore = 0;
    rows.forEach((row) => { totalWorkDays += row.work_days; totalFinalScore += row.final_score; });
    const weightedAverage = totalWorkDays > 0 ? Math.round((totalFinalScore * 10000) / totalWorkDays) : null;
    return {
      reviewedCount: rows.length,
      totalWorkDays: formatScaled4(totalWorkDays),
      totalFinalScore: formatScaled4(totalFinalScore),
      weightedAverageDailyScore: weightedAverage == null ? null : formatScaled4(weightedAverage),
      points: rows.map((row) => ({workLogId:row.id,workLogRef:row.work_log_ref,logDate:row.log_date,workDays:formatScaled4(row.work_days),finalScore:formatScaled4(row.final_score),averageDailyScore:formatScaled4(row.average_daily_score)})),
    };
  }
}
