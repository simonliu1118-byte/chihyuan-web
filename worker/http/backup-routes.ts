import { resolveAppMember } from "../auth/app-access";
import { requireIdentity } from "../auth/guard";
import { backupService, type BackupRuntimeEnv } from "../backup/runtime";
import { loadBackupHistory } from "../backup/backup-service";
import { identityClient } from "./auth-routes";
import { failure, success } from "./response";
import { readJsonObject, RequestInputError } from "./request";
import { BACKUP_REHEARSAL_CONFIRMATION } from "../../shared/backups";

export async function handleBackupRoute(request: Request, env: BackupRuntimeEnv, requestId: string): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== "/api/admin/backups" && !path.startsWith("/api/admin/backups/")) return null;
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503);
  const gate = await requireIdentity(provider, request);
  if (!gate.ok) return failure({ code: gate.code, message: "Authentication required" }, requestId, gate.status);
  if (gate.principal.workspaceRole !== "SUPER_ADMIN") return failure({ code: "SUPER_ADMIN_REQUIRED", message: "需要最高管理員權限" }, requestId, 403);
  try {
    const member = await resolveAppMember(env.DB, gate.principal);
    if (!member.isActive) return failure({ code: "ACCESS_DENIED", message: "App member is inactive" }, requestId, 403);
    const service = backupService(env);
    if (request.method === "GET" && path === "/api/admin/backups")
      return success({ ...await loadBackupHistory(env.DB, gate.principal.workspaceId, !!service), recoveryConfigured: !!service && !!env.RECOVERY_DB,
        scheduleEnabled: !!service && env.BACKUP_SCHEDULE_ENABLED === "true" }, requestId);
    if (!service) return failure({ code: "BACKUP_NOT_CONFIGURED", message: "備份儲存尚未設定" }, requestId, 503);
    const context = { actorMemberId: member.id, now: new Date().toISOString(), requestId };
    const rehearsal = /^\/api\/admin\/backups\/([0-9a-f-]{36})\/rehearse$/.exec(path);
    if (request.method === "POST" && rehearsal) {
      if (request.headers.get("origin") !== new URL(request.url).origin)
        return failure({ code: "BACKUP_ORIGIN_INVALID", message: "操作來源網站不符" }, requestId, 403);
      if (!env.RECOVERY_DB) return failure({ code: "BACKUP_RECOVERY_NOT_CONFIGURED", message: "隔離還原環境尚未設定" }, requestId, 503);
      try {
        const body = await readJsonObject(request, 4096);
        if (Object.keys(body).some(key => !["selectionConfirmation", "reviewed", "confirmation", "provider"].includes(key))
          || body.selectionConfirmation !== rehearsal[1] || body.reviewed !== true
          || body.confirmation !== BACKUP_REHEARSAL_CONFIRMATION || (body.provider !== "r2" && body.provider !== "gcs"))
          return failure({ code: "BACKUP_RECOVERY_CONFIRMATION_REQUIRED", message: "請核對來源備份並輸入確認文字" }, requestId, 400);
        const result = await service.isolatedRecovery(env.RECOVERY_DB, { backupId: rehearsal[1], selectionConfirmation: rehearsal[1],
          targetConfirmation: "isolated_empty_database", role: gate.principal.workspaceRole, isActive: member.isActive,
          provider: body.provider as "r2" | "gcs" }, context);
        return success({ verified: true, backupId: rehearsal[1], ...result }, requestId);
      } catch (error) {
        if (error instanceof RequestInputError) return failure({ code: error.code, message: "確認資料格式不正確" }, requestId, 400);
        const messages: Record<string, string> = {
          BACKUP_TARGET_NOT_EMPTY: "隔離驗證副本已使用，不能覆寫；重做須另行準備核准的空白目標。",
          BACKUP_SCHEMA_MISMATCH: "備份與隔離目標結構不符，請先核對版本。",
          BACKUP_NO_VERIFIED_COPY_AVAILABLE: "所選儲存副本目前無法驗證，請更新備份紀錄。",
          BACKUP_RECOVERY_TARGET_NOT_ISOLATED: "隔離目標設定不正確，已停止操作。",
        };
        const code = error instanceof Error && Object.hasOwn(messages, error.message) ? error.message : "BACKUP_RECOVERY_UNAVAILABLE";
        return failure({ code, message: messages[code] ?? "隔離還原未完成；請先更新紀錄，不要直接重送。" }, requestId, 409);
      }
    }
    if (request.method === "POST" && path === "/api/admin/backups") {
      const id = await service.create("manual", context);
      return success({ backupId: id, ...await service.list() }, requestId);
    }
    const retry = /^\/api\/admin\/backups\/([0-9a-f-]{36})\/retry$/.exec(path);
    if (request.method === "POST" && retry) {
      await service.retry(retry[1], context);
      return success(await service.list(), requestId);
    }
    return failure({ code: "METHOD_NOT_ALLOWED", message: "Unsupported backup action" }, requestId, 405);
  } catch { return failure({ code: "BACKUP_UNAVAILABLE", message: "備份暫時無法執行" }, requestId, 503); }
}
