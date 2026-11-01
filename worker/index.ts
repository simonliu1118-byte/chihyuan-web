import type { HealthData } from "../shared/api";
import { backupService, type BackupRuntimeEnv } from "./backup/runtime";
import { handleBackupRoute } from "./http/backup-routes";
import { handleSettingsAuditRoute } from "./http/settings-audit-routes";
import { handleAuthRoute, type IdentityRuntimeEnv } from "./http/auth-routes";
import { handleIdentityManagementRoute } from "./http/identity-management-routes";
import { handleModuleAccessRoute } from "./http/module-access-routes";
import { groupManagedSystemAccess } from "./http/module-access-group-routes";
import { handleCyInvoiceRecoveryRoute, type CyInvoiceRecoveryEnv } from "./http/cyinvoice-recovery-routes";
import { handleBusinessApiRoute } from "./http/business-api-routes";
import { handleHrRoute } from "./http/hr-routes";
import {handleOrderingRoute} from "./http/ordering-routes";
import {handleStoreRoute} from "./http/store-routes";
import {handleStoreStocktakeRoute} from "./http/store-stocktake-routes";
import {handleStoreMonthlyRoute} from "./http/store-monthly-routes";
import {ensureMonthlyRows} from "./store/monthly-service";
import {STORE_MONTHLY_CRON} from "../shared/store-monthly";
import { handleUsageRoute } from "./http/usage-routes";
import { handleBusinessApiPhase2Route } from "./http/business-api-phase2-routes";
import { handleProgramCatalogRoute } from "./http/program-catalog-routes";
import { handleErpItemQueryRoute, type ErpBridgeEnv } from "./http/erp-item-query-routes";
import { runErpHousekeeping } from "./http/erp-housekeeping";
import { ERP_HOUSEKEEPING_CRON } from "../shared/erp-housekeeping";
import { failure, success } from "./http/response";
import { PROGRAM_CATALOG_CRON } from "../shared/program-catalog";
import { updateProgramCatalog } from "./programs/release-catalog";

interface Env extends IdentityRuntimeEnv, BackupRuntimeEnv, ErpBridgeEnv, CyInvoiceRecoveryEnv {
  ASSETS?: Fetcher;
  HR_FILES?: R2Bucket;
  CF_ACCOUNT_ID?: string;
  CF_USAGE_API_TOKEN?: string;
}

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

async function routeRequest(request: Request, env: Env, url: URL): Promise<Response> {
  const requestId = crypto.randomUUID();

  if (request.method === "GET" && url.pathname === "/api/health") {
    return health(env, requestId);
  }

  const authResponse = await handleAuthRoute(request, env, requestId);
  if (authResponse) return authResponse;

  const groupManaged = await groupManagedSystemAccess(request, env, requestId);
  if (groupManaged) return groupManaged;

  const identityResponse = await handleIdentityManagementRoute(request, env, requestId);
  if (identityResponse) return identityResponse;

  const recoveryResponse = await handleCyInvoiceRecoveryRoute(request, env, requestId);
  if (recoveryResponse) return recoveryResponse;

  const moduleAccessResponse = await handleModuleAccessRoute(request, env, requestId);
  if (moduleAccessResponse) return moduleAccessResponse;

  const programResponse = await handleProgramCatalogRoute(request, env, requestId);
  if (programResponse) return programResponse;

  const backupResponse = await handleBackupRoute(request, env, requestId);
  if (backupResponse) return backupResponse;

  const settingsAuditResponse = await handleSettingsAuditRoute(request, env, requestId);
  if (settingsAuditResponse) return settingsAuditResponse;

  const erpResponse = await handleErpItemQueryRoute(request, env, requestId);
  if (erpResponse) return erpResponse;

  const usageResponse = await handleUsageRoute(request, env, requestId);
  if (usageResponse) return usageResponse;

  const orderingResponse = await handleOrderingRoute(request, env, requestId);
  if(orderingResponse)return orderingResponse;
  const stocktakeResponse = await handleStoreStocktakeRoute(request,env,requestId);
  if(stocktakeResponse)return stocktakeResponse;
  const monthlyResponse = await handleStoreMonthlyRoute(request,env,requestId);
  if(monthlyResponse)return monthlyResponse;
  const storeResponse = await handleStoreRoute(request, env, requestId);
  if (storeResponse) return storeResponse;
  const hrResponse = await handleHrRoute(request, env, requestId);
  if (hrResponse) return hrResponse;

  const businessResponse = await handleBusinessApiRoute(request, env, requestId);
  if (businessResponse) return businessResponse;

  const businessPhase2Response = await handleBusinessApiPhase2Route(request, env, requestId);
  if (businessPhase2Response) return businessPhase2Response;

  if (url.pathname.startsWith("/api/")) {
    return failure({ code: "NOT_FOUND", message: "API route not found" }, requestId, 404);
  }

  if (env.ASSETS) return env.ASSETS.fetch(request);
  return failure({ code: "NOT_FOUND", message: "Route not found" }, requestId, 404);
}

export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if(controller.cron===STORE_MONTHLY_CRON){await ensureMonthlyRows(env.DB,new Date(controller.scheduledTime).toISOString());return;}
    if (controller.cron === ERP_HOUSEKEEPING_CRON) {
      await runErpHousekeeping(env.DB, controller.scheduledTime);
      return;
    }
    if (controller.cron === PROGRAM_CATALOG_CRON) {
      await updateProgramCatalog(env.DB, new Date(controller.scheduledTime).toISOString());
      return;
    }
    if (controller.cron !== "30 19 * * *") return;
    if (env.BACKUP_SCHEDULE_ENABLED !== "true") return;
    const service = backupService(env);
    if (service) await service.scheduled({ now: new Date(controller.scheduledTime).toISOString(), actorMemberId: null, requestId: crypto.randomUUID() });
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol === "http:" && !loopback) {
      url.protocol = "https:";
      return new Response(null, {
        status: 308,
        headers: { location: url.toString(), "cache-control": "no-store" },
      });
    }
    const response = await routeRequest(request, env, url);
    if (url.protocol !== "https:" || loopback) return response;
    const secured = new Response(response.body, response);
    secured.headers.set("strict-transport-security", "max-age=31536000");
    return secured;
  },
} satisfies ExportedHandler<Env>;
