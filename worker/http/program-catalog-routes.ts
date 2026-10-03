import { requireIdentity } from "../auth/guard";
import { loadProgramCatalog } from "../programs/release-catalog";
import type { ProgramCatalog } from "../../shared/program-catalog";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";
import { failure, success } from "./response";

export async function handleProgramCatalogRoute(request: Request, env: IdentityRuntimeEnv, requestId: string,
  load: () => Promise<ProgramCatalog> = loadProgramCatalog): Promise<Response | null> {
  if (new URL(request.url).pathname !== "/api/programs") return null;
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "帳號服務暫時無法使用" }, requestId, 503);
  const identity = await requireIdentity(provider, request);
  if (!identity.ok) return failure({ code: identity.code, message: "請先登入" }, requestId, identity.status);
  // Every valid CY Web user; intentionally no Role, Module Access or D1 gate.
  if (request.method !== "GET") return failure({ code: "METHOD_NOT_ALLOWED", message: "此頁只供查閱" }, requestId, 405);
  return success(await load(), requestId);
}
