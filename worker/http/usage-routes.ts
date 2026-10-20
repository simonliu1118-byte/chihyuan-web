import { requireIdentity } from "../auth/guard";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";
import { failure, success } from "./response";
import { CloudflareUsageError, fetchD1Usage, type UsageCloudflareEnv, type UsageFetchOptions } from "../usage/cloudflare-usage";

export type UsageRuntimeEnv = IdentityRuntimeEnv & UsageCloudflareEnv;

/** /api/business/usage/d1 is intentionally outside all CYWEB_MODULES permissions. */
export async function handleUsageRoute(
  request: Request, env: UsageRuntimeEnv, requestId: string, options: UsageFetchOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/business/usage/d1") return null;
  if (request.method !== "GET")
    return failure({ code: "METHOD_NOT_ALLOWED", message: "僅支援查詢" }, requestId, 405);
  const client = identityClient(env);
  if (!client) return failure({ code: "IDENTITY_UNAVAILABLE", message: "身分服務暫時不可用" }, requestId, 503);
  const gate = await requireIdentity(client, request);
  if (!gate.ok) return failure({ code: gate.code, message: "請先登入" }, requestId, gate.status);
  if (gate.principal.workspaceRole !== "SUPER_ADMIN")
    return failure({ code: "SUPER_ADMIN_REQUIRED", message: "只有超級管理員可查看用量" }, requestId, 403);
  const rawDays = url.searchParams.get("days") ?? "7";
  if (!/^[0-9]+$/.test(rawDays) || Number(rawDays) < 1 || Number(rawDays) > 31)
    return failure({ code: "USAGE_INVALID_DAYS", message: "天數必須是 1～31 的整數" }, requestId, 422);
  try {
    const report = await fetchD1Usage(env, Number(rawDays), options);
    return success(report, requestId);
  } catch (error) {
    const code = error instanceof CloudflareUsageError ? error.code : "USAGE_UNAVAILABLE";
    return failure({ code, message: code === "USAGE_NOT_CONFIGURED"
      ? "尚未設定用量查詢憑證" : "暫時無法讀取 Cloudflare 用量" }, requestId, 503);
  }
}
