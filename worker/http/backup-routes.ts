import { resolveAppMember } from "../auth/app-access";
import { requireIdentity } from "../auth/guard";
import { backupService, type BackupRuntimeEnv } from "../backup/runtime";
import { loadBackupHistory } from "../backup/backup-service";
import { identityClient } from "./auth-routes";
import { failure, success } from "./response";

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
      return success(await loadBackupHistory(env.DB, gate.principal.workspaceId, !!service), requestId);
    if (!service) return failure({ code: "BACKUP_NOT_CONFIGURED", message: "備份儲存尚未設定" }, requestId, 503);
    const context = { actorMemberId: member.id, now: new Date().toISOString(), requestId };
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
