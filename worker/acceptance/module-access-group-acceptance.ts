import { handleIdentityManagementRoute } from "../http/identity-management-routes";
import { groupManagedSystemAccess } from "../http/module-access-group-routes";
import { handleModuleAccessRoute } from "../http/module-access-routes";
import type { IdentityRuntimeEnv } from "../http/auth-routes";

/** 權限群組 (BD-057) through the real routes and D1; only the remote Identity (CYID) binding is stubbed. */
export async function acceptModuleAccessGroups(db: D1Database): Promise<void> {
  const people = [
    { employee_id: "group-admin", employee_no: "0901", workspace_role: "SUPER_ADMIN", identity_admin: 0 },
    { employee_id: "group-member-a", employee_no: "0902", workspace_role: "USER", identity_admin: 0 },
    { employee_id: "group-member-b", employee_no: "0903", workspace_role: "USER", identity_admin: 0 },
  ];
  // CYID's application access, and employees whose access writes fail (to exercise re-sync).
  const cyidAccess = new Set<string>();
  const cyidFailing = new Set<string>();
  const applications = [
    { application_id: "APP_TEST", enabled: 1, core_access_locked: 1 },
    { application_id: "CYACCOUNTINGWEB", enabled: 1, core_access_locked: 0 },
    { application_id: "CYINVOICE", enabled: 1, core_access_locked: 0 },
  ];
  const env: IdentityRuntimeEnv = {
    DB: db, IDENTITY_APPLICATION_ID: "APP_TEST", IDENTITY_WORKSPACE_ID: "workspace-test",
    IDENTITY: { async fetch(input: RequestInfo) {
      const request = typeof input === "string" ? new Request(input) : input;
      const url = request.url;
      if (url.endsWith("/v1/admin/identity/snapshot")) {
        return Response.json({ ok: true, employees: people, applications,
          directAccess: [...cyidAccess].map((key) => ({ employee_id: key.split(":")[0], application_id: key.split(":")[1], enabled: 1 })) });
      }
      const access = /\/v1\/admin\/identity\/employees\/([^/]+)\/applications\/([^/]+)$/.exec(new URL(url).pathname);
      if (access && request.method === "PUT") {
        if (cyidFailing.has(access[1])) return Response.json({ ok: false, error: { code: "IDENTITY_UNAVAILABLE" } }, { status: 503 });
        const { enabled } = await request.json() as { enabled: boolean };
        if (enabled) cyidAccess.add(`${access[1]}:${access[2]}`); else cyidAccess.delete(`${access[1]}:${access[2]}`);
        return Response.json({ ok: true, access: { enabled } });
      }
      return Response.json({ ok: true, principal: {
        workspaceId: "workspace-test", employeeId: "group-admin", employeeNo: "0901", displayName: "Group Admin",
        workspaceRole: "SUPER_ADMIN", isIdentityAdmin: false, emailVerified: true, isWorkspaceSuperAdmin: true,
        credentialVersion: 1, employeeRevision: 1,
      }, session: { expiresAt: "2999-01-01T00:00:00.000Z" } });
    } } as unknown as Fetcher,
  };
  function check(condition: unknown, code: string): asserts condition {
    if (!condition) throw new Error("ACCEPT_GROUP_" + code);
  }
  async function call(path: string, method: string, body?: unknown): Promise<{ status: number; data: any; code?: string }> {
    const response = await handleModuleAccessRoute(new Request("https://acceptance.test/api/module-access/" + path, {
      method, headers: { "content-type": "application/json", cookie: "cyweb_identity_session=cyid_" + "b".repeat(64) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env, "accept-module-access-groups");
    check(response, "ROUTE_" + path);
    const payload = await response.json() as { data?: unknown; error?: { code?: string } };
    return { status: response.status, data: payload.data, code: payload.error?.code };
  }
  async function grants(employeeId: string): Promise<string> {
    const rows = await db.prepare(`SELECT a.module_code FROM app_member_module_access a JOIN app_members m ON m.id=a.member_id
      WHERE m.identity_employee_id=?1 AND a.enabled=1 ORDER BY a.module_code`).bind(employeeId).all<{ module_code: string }>();
    return rows.results.map((row) => row.module_code).join(",");
  }

  async function proxyAccess(employeeId: string, applicationId: string, enabled: boolean): Promise<{ status: number; code?: string }> {
    // Same order as worker/index.ts: the group guard, then the CYID proxy.
    const request = () => new Request(`https://acceptance.test/api/identity/admin/employees/${employeeId}/applications/${applicationId}`, {
      method: "PUT", headers: { "content-type": "application/json", cookie: "cyweb_identity_session=cyid_" + "b".repeat(64) },
      body: JSON.stringify({ enabled }) });
    const response = await groupManagedSystemAccess(request(), env, "accept-module-access-groups")
      ?? await handleIdentityManagementRoute(request(), env, "accept-module-access-groups");
    check(response, "PROXY_ROUTE");
    const payload = await response.json() as { error?: { code?: string } };
    return { status: response.status, code: payload.error?.code };
  }
  const systems = (employeeId: string) => [...cyidAccess].filter((key) => key.startsWith(employeeId + ":")).map((key) => key.split(":")[1]).sort().join(",");

  const created = await call("admin/groups", "POST", { name: "業務組", modules: ["CUSTOMERS", "ITEMS"], applications: ["CYACCOUNTINGWEB"] });
  check(created.status === 201 && created.data.group.revision === 1, "CREATE");
  const groupId = created.data.group.id as number;
  check((await call("admin/groups", "POST", { name: "業務組", modules: [], applications: [] })).code === "MODULE_ACCESS_GROUP_NAME_TAKEN", "NAME_UNIQUE");
  check((await call("admin/groups", "POST", { name: "壞的", modules: ["NOT_A_MODULE"], applications: [] })).status === 400, "UNKNOWN_MODULE");
  check((await call("admin/groups", "POST", { name: "核心", modules: [], applications: ["APP_TEST"] })).status === 400, "CORE_APPLICATION");

  // Joining a group gives exactly the group's modules; individual changes are refused.
  check((await call("admin/employees/group-member-a/modules/WORKLOGS", "PUT", { enabled: true })).status === 200, "PERSONAL_BEFORE");
  check((await proxyAccess("group-member-a", "CYINVOICE", true)).status === 200, "PERSONAL_SYSTEM_BEFORE");
  const assigned = await call("admin/employees/group-member-a/group", "PUT", { groupId });
  check(assigned.status === 200 && assigned.data.applicationSyncFailed.length === 0, "ASSIGN");
  check(await grants("group-member-a") === "CUSTOMERS,ITEMS", "ASSIGN_MATERIALIZED");
  check(systems("group-member-a") === "CYACCOUNTINGWEB", "ASSIGN_SYSTEMS_SYNCED");
  check((await call("admin/employees/group-member-a/modules/DEFECTS", "PUT", { enabled: true })).code === "MODULE_ACCESS_GROUP_MANAGED", "GROUP_MANAGED");
  check((await proxyAccess("group-member-a", "CYINVOICE", true)).code === "MODULE_ACCESS_GROUP_MANAGED", "GROUP_MANAGED_SYSTEM");
  check((await call("admin/employees/group-admin/group", "PUT", { groupId })).code === "SELF_ACCESS_CHANGE_NOT_ALLOWED", "SELF");

  // Changing the group updates every member at once; a stale revision changes nothing.
  check((await call("admin/employees/group-member-b/group", "PUT", { groupId })).status === 200, "ASSIGN_B");
  // CYID failing for one member: modules still apply, that member is reported, and a re-sync fixes it.
  cyidFailing.add("group-member-b");
  const updated = await call(`admin/groups/${groupId}`, "PATCH", { name: "業務組", modules: ["CUSTOMERS", "DEFECTS"], applications: ["CYINVOICE"], expectedRevision: 1 });
  check(updated.status === 200 && updated.data.group.revision === 2, "UPDATE");
  check(await grants("group-member-a") === "CUSTOMERS,DEFECTS" && await grants("group-member-b") === "CUSTOMERS,DEFECTS", "UPDATE_MATERIALIZED");
  check(systems("group-member-a") === "CYINVOICE" && updated.data.applicationSyncFailed.join() === "group-member-b", "UPDATE_SYSTEMS_REPORTED");
  cyidFailing.clear();
  const resynced = await call(`admin/groups/${groupId}/sync`, "POST", {});
  check(resynced.status === 200 && resynced.data.applicationSyncFailed.length === 0 && systems("group-member-b") === "CYINVOICE", "RESYNC");
  const stale = await call(`admin/groups/${groupId}`, "PATCH", { name: "業務組", modules: ["ORDERS"], applications: [], expectedRevision: 1 });
  check(stale.code === "MODULE_ACCESS_GROUP_REVISION_CONFLICT" && await grants("group-member-a") === "CUSTOMERS,DEFECTS", "STALE_UPDATE");

  // Leaving keeps the current grants as the person's own settings.
  check((await call("admin/employees/group-member-a/group", "PUT", { groupId: null })).status === 200, "LEAVE");
  check(await grants("group-member-a") === "CUSTOMERS,DEFECTS" && systems("group-member-a") === "CYINVOICE", "LEAVE_KEEPS");
  check((await proxyAccess("group-member-a", "CYACCOUNTINGWEB", true)).status === 200, "PERSONAL_SYSTEM_AFTER");
  check((await call("admin/employees/group-member-a/modules/WORKLOGS", "PUT", { enabled: true })).status === 200, "PERSONAL_AFTER");

  const snapshot = await call("admin", "GET");
  check(snapshot.data.groups.length === 1 && snapshot.data.groups[0].memberCount === 1 && snapshot.data.groups[0].applications.join() === "CYINVOICE"
    && snapshot.data.memberships.some((row: { employee_id: string; group_id: number }) => row.employee_id === "group-member-b" && row.group_id === groupId), "SNAPSHOT");

  // Deleting a group releases its members with their grants intact.
  check((await call(`admin/groups/${groupId}`, "DELETE", { expectedRevision: 1 })).code === "MODULE_ACCESS_GROUP_REVISION_CONFLICT", "STALE_DELETE");
  check((await call(`admin/groups/${groupId}`, "DELETE", { expectedRevision: 2 })).status === 200, "DELETE");
  check(await grants("group-member-b") === "CUSTOMERS,DEFECTS", "DELETE_KEEPS");
  const left = await db.prepare("SELECT COUNT(*) AS n FROM app_member_module_groups").first<{ n: number }>();
  check(left?.n === 0, "DELETE_RELEASES");
  const audits = await db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action LIKE 'module_access_group.%' OR action='module_access.group_assigned'").first<{ n: number }>();
  check((audits?.n ?? 0) >= 6, "AUDIT");
}
