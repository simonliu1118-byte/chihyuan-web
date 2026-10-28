import { resolveAppMember } from "../auth/app-access";
import { requireIdentity } from "../auth/guard";
import { backupService, type BackupRuntimeEnv } from "../backup/runtime";
import { loadBackupHistory, loadBackupRehearsals, loadQuarterlyRehearsalReminder, isRecoveryGenerationConsumed } from "../backup/backup-service";
import { isEmptyRecoveryTarget } from "../backup/portable-backup";
import { identityClient } from "./auth-routes";
import { failure, success } from "./response";
import { readJsonObject, RequestInputError } from "./request";
import { BACKUP_REHEARSAL_CONFIRMATION, BACKUP_REHEARSAL_ERROR_MESSAGES } from "../../shared/backups";

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
    if (request.method === "GET" && path === "/api/admin/backups/quarterly-reminder") {
      const reminder = await loadQuarterlyRehearsalReminder(env.DB, gate.principal.workspaceId, new Date().toISOString());
      return success(reminder, requestId);
    }
    if (request.method === "GET" && path === "/api/admin/backups") {
      const history = await loadBackupHistory(env.DB, gate.principal.workspaceId, !!service);
      let rehearsals = [] as Awaited<ReturnType<typeof loadBackupRehearsals>>, rehearsalHistoryAvailable = true;
      try { rehearsals = await loadBackupRehearsals(env.DB, gate.principal.workspaceId); }
      catch {
        // Do not mask the main backup catalog if the optional Audit history is unavailable.
        rehearsalHistoryAvailable = false;
        console.error("[backup_rehearsal_history_unavailable]", JSON.stringify({ requestId }));
      }
      let recoveryReady = false;
      if (service && env.RECOVERY_DB) {
        try {
          recoveryReady = !await isRecoveryGenerationConsumed(env.DB, gate.principal.workspaceId, env.RECOVERY_TARGET_GENERATION ?? "legacy")
            && await isEmptyRecoveryTarget(env.RECOVERY_DB);
        } catch {
          // Fail closed without hiding verified backup history.
          console.error("[backup_recovery_target_preflight_unavailable]", JSON.stringify({ requestId }));
        }
      }
      return success({ ...history, rehearsals, rehearsalHistoryAvailable,
        recoveryReady,
        recoveryBlockedReason: recoveryReady ? undefined : !env.RECOVERY_DB ? "上次用過的隔離資料庫已斷開，可在 Cloudflare 刪除；下次演練前需先輪替建立新目標。" : "隔離資料庫已使用或狀態不明，不可再次驗證。",
        recoveryConfigured: !!service && !!env.RECOVERY_DB,
        scheduleEnabled: !!service && env.BACKUP_SCHEDULE_ENABLED === "true" }, requestId);
    }
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
          provider: body.provider as "r2" | "gcs", targetGeneration: env.RECOVERY_TARGET_GENERATION ?? "legacy" }, context);
        return success({ verified: true, backupId: rehearsal[1], ...result }, requestId);
      } catch (error) {
        if (error instanceof RequestInputError) return failure({ code: error.code, message: "確認資料格式不正確" }, requestId, 400);
        const code = error instanceof Error && Object.hasOwn(BACKUP_REHEARSAL_ERROR_MESSAGES, error.message)
          ? error.message : "BACKUP_RECOVERY_UNAVAILABLE";
        return failure({ code, message: BACKUP_REHEARSAL_ERROR_MESSAGES[code] }, requestId, 409);
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
