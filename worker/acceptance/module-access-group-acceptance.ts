import { handleModuleAccessRoute } from "../http/module-access-routes";
import type { IdentityRuntimeEnv } from "../http/auth-routes";

/** 權限群組 (BD-057) through the real routes and D1; only the remote Identity binding is stubbed. */
export async function acceptModuleAccessGroups(db: D1Database): Promise<void> {
  const people = [
    { employee_id: "group-admin", employee_no: "0901", workspace_role: "SUPER_ADMIN", identity_admin: 0 },
    { employee_id: "group-member-a", employee_no: "0902", workspace_role: "USER", identity_admin: 0 },
    { employee_id: "group-member-b", employee_no: "0903", workspace_role: "USER", identity_admin: 0 },
  ];
  const env: IdentityRuntimeEnv = {
    DB: db, IDENTITY_APPLICATION_ID: "APP_TEST", IDENTITY_WORKSPACE_ID: "workspace-test",
    IDENTITY: { async fetch(input: RequestInfo) {
      const url = typeof input === "string" ? input : input.url;
      if (url.endsWith("/v1/admin/identity/snapshot")) return Response.json({ ok: true, employees: people });
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

  const created = await call("admin/groups", "POST", { name: "業務組", modules: ["CUSTOMERS", "ITEMS"] });
  check(created.status === 201 && created.data.group.revision === 1, "CREATE");
  const groupId = created.data.group.id as number;
  check((await call("admin/groups", "POST", { name: "業務組", modules: [] })).code === "MODULE_ACCESS_GROUP_NAME_TAKEN", "NAME_UNIQUE");
  check((await call("admin/groups", "POST", { name: "壞的", modules: ["NOT_A_MODULE"] })).status === 400, "UNKNOWN_MODULE");

  // Joining a group gives exactly the group's modules; individual changes are refused.
  check((await call("admin/employees/group-member-a/modules/WORKLOGS", "PUT", { enabled: true })).status === 200, "PERSONAL_BEFORE");
  check((await call("admin/employees/group-member-a/group", "PUT", { groupId })).status === 200, "ASSIGN");
  check(await grants("group-member-a") === "CUSTOMERS,ITEMS", "ASSIGN_MATERIALIZED");
  check((await call("admin/employees/group-member-a/modules/DEFECTS", "PUT", { enabled: true })).code === "MODULE_ACCESS_GROUP_MANAGED", "GROUP_MANAGED");
  check((await call("admin/employees/group-admin/group", "PUT", { groupId })).code === "SELF_ACCESS_CHANGE_NOT_ALLOWED", "SELF");

  // Changing the group updates every member at once; a stale revision changes nothing.
  check((await call("admin/employees/group-member-b/group", "PUT", { groupId })).status === 200, "ASSIGN_B");
  const updated = await call(`admin/groups/${groupId}`, "PATCH", { name: "業務組", modules: ["CUSTOMERS", "DEFECTS"], expectedRevision: 1 });
  check(updated.status === 200 && updated.data.group.revision === 2, "UPDATE");
  check(await grants("group-member-a") === "CUSTOMERS,DEFECTS" && await grants("group-member-b") === "CUSTOMERS,DEFECTS", "UPDATE_MATERIALIZED");
  const stale = await call(`admin/groups/${groupId}`, "PATCH", { name: "業務組", modules: ["ORDERS"], expectedRevision: 1 });
  check(stale.code === "MODULE_ACCESS_GROUP_REVISION_CONFLICT" && await grants("group-member-a") === "CUSTOMERS,DEFECTS", "STALE_UPDATE");

  // Leaving keeps the current grants as the person's own settings.
  check((await call("admin/employees/group-member-a/group", "PUT", { groupId: null })).status === 200, "LEAVE");
  check(await grants("group-member-a") === "CUSTOMERS,DEFECTS", "LEAVE_KEEPS");
  check((await call("admin/employees/group-member-a/modules/WORKLOGS", "PUT", { enabled: true })).status === 200, "PERSONAL_AFTER");

  const snapshot = await call("admin", "GET");
  check(snapshot.data.groups.length === 1 && snapshot.data.groups[0].memberCount === 1
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
