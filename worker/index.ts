import type { HealthData } from "../shared/api";
import { backupService, type BackupRuntimeEnv } from "./backup/runtime";
import { handleBackupRoute } from "./http/backup-routes";
import { handleSettingsAuditRoute } from "./http/settings-audit-routes";
import { handleAuthRoute, type IdentityRuntimeEnv } from "./http/auth-routes";
import { handleIdentityManagementRoute } from "./http/identity-management-routes";
import { handleModuleAccessRoute } from "./http/module-access-routes";
import { handleBusinessApiRoute } from "./http/business-api-routes";
import { handleBusinessApiPhase2Route } from "./http/business-api-phase2-routes";
import { failure, success } from "./http/response";

interface Env extends IdentityRuntimeEnv, BackupRuntimeEnv {}

async function health(env: Env, requestId: string): Promise<Response> {
  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
    const data: HealthData = {
      service: "cyweb",
      database: "ok",
      time: new Date().toISOString(),
      identityConsumerVersion: env.IDENTITY_CONSUMER_VERSION ?? null,
      version: env.SOURCE_VERSION ?? null,
      sourceCommit: env.SOURCE_COMMIT ?? null,
    };
    return success(data, requestId);
  } catch {
    return failure(
      { code: "SERVICE_UNAVAILABLE", message: "Local database is not ready" },
      requestId,
      503,
    );
  }
}

export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (env.BACKUP_SCHEDULE_ENABLED !== "true") return;
    const service = backupService(env);
    if (service) await service.scheduled({ now: new Date(controller.scheduledTime).toISOString(), actorMemberId: null, requestId: crypto.randomUUID() });
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return health(env, requestId);
    }

    const authResponse = await handleAuthRoute(request, env, requestId);
    if (authResponse) return authResponse;

    const identityResponse = await handleIdentityManagementRoute(request, env, requestId);
    if (identityResponse) return identityResponse;

    const moduleAccessResponse = await handleModuleAccessRoute(request, env, requestId);
    if (moduleAccessResponse) return moduleAccessResponse;

    const backupResponse = await handleBackupRoute(request, env, requestId);
    if (backupResponse) return backupResponse;

    const settingsAuditResponse = await handleSettingsAuditRoute(request, env, requestId);
    if (settingsAuditResponse) return settingsAuditResponse;

    const businessResponse = await handleBusinessApiRoute(request, env, requestId);
    if (businessResponse) return businessResponse;

    const businessPhase2Response = await handleBusinessApiPhase2Route(request, env, requestId);
    if (businessPhase2Response) return businessPhase2Response;

    if (url.pathname.startsWith("/api/")) {
      return failure({ code: "NOT_FOUND", message: "API route not found" }, requestId, 404);
    }

    return failure({ code: "NOT_FOUND", message: "Route not found" }, requestId, 404);
  },
} satisfies ExportedHandler<Env>;
