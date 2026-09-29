# CY Web TODO

> 本文件只記錄 **current implementation status 與下一步**；不是永久規則來源，也不重複保存 Business Decision、module contract 或 architecture semantics。

## Current checkpoint — 2026-09-29

- Formal code baseline remains `main`; current source version is `0.1.51`.
- CYCloud Identity development authority is live and CY Web uses the private `IDENTITY` Service Binding for login/session/logout.
- Browser acceptance already passed for the first development Super Admin account: password login, authenticated navigation, F5 resolve, logout and post-logout F5.
- Invalid-provider-session handling is accepted through the deployed CY Web runtime; literal expired-session evidence remains outstanding.
- CY Web `0.1.51` source contains the earlier Employee lifecycle/Super Admin UI correction but has not yet been manually development-deployed.
- **The forward Identity model changed before `0.1.51` management UI acceptance was completed.** Do not spend further design effort extending the current Identity Group / `USER_ADMIN` management UI. Next Identity implementation must migrate to the finalized three-role contract first.
- Approved shared model: CYID roles are `SUPER_ADMIN / ADMIN / USER`; `Identity Admin` is an ADMIN capability, not a fourth role; all integrated CY Apps consume the same role directly.
- CY Web is the mandatory core account-management App: every valid Employee has CY Web entry access locked TRUE so self-service remains available even with zero business Module Access.
- CY Web is the multi-module exception: module access is owned/enforced by CY Web, not CYID. Super Admin has all modules automatically. Identity Admin / Super Admin can manage eligible USER/ADMIN/other Identity Admin module access; normal ADMIN cannot manage Module Access; ADMIN with a module Access has full management authority in that module.
- Normal ADMIN may manage ordinary USER lifecycle only; Identity Admin adds USER<->ADMIN, App Access, CY Web Module Access and activated-account forced Email recovery; Super Admin retains Identity Admin grant/revoke, protected transfer and Workspace security-core authority.
- Identity Admin cannot modify its own App/Module Access or Super Admin protected state. Another Identity Admin or Super Admin may adjust an Identity Admin's normal Access.
- Employee creation target: normal ADMIN can create USER only; Identity Admin / Super Admin can directly create USER or ADMIN. Role is selected at creation; Access is configured afterward.
- First activation target: CYID automatically sends an activation email immediately after Employee creation. The message contains a direct link opening CY Web activation; the link itself is not authentication and does not bypass OTP/Email verification/first-password setup. Pending UI exposes edit/resend/delete; send failure keeps the pending account and allows resend.
- Activated-account Email recovery target: Identity Admin / Super Admin may replace an unusable Email, keep the account activated/password intact, mark new Email unverified, revoke sessions and resend verification.
- Only never-activated Employees may be physically deleted. Activated Employees remain historical records and are disabled/re-enabled.
- Current CYCloud Identity `0.1.14` still implements legacy Identity Groups and Group/direct App grants; provider migration is required before CY Web adopts the target principal contract.
- CYInvoice remains unchanged/reference-only in this workstream. CYACC-web and CYInvoice integrations happen separately after the shared contract stabilizes.
- Production D1/Worker/DNS/custom domain, backup rollout and SMART ERP remain untouched.

## Active next sequence

1. [x] Cut CY Web login/session/logout to CYCloud Identity and accept the initial Super Admin session path.
2. [x] Add initial Shared Identity management UI and pending Employee lifecycle protection.
3. [x] Finalize the replacement Identity contract: direct `SUPER_ADMIN / ADMIN / USER`, Identity Admin capability, App Access separation and CY Web core/multi-module rules.
4. [ ] Wait for / coordinate CYCloud Identity forward migration from legacy Group projection to direct Workspace Role + Identity Admin capability.
5. [ ] Update CY Web auth adapter/principal normalization to consume direct `role` + `isIdentityAdmin` provider authority.
6. [ ] Replace the current Super-Admin-only/Group management UI with role-aware USER / ADMIN / Identity Admin / Super Admin surfaces.
7. [ ] Implement CY Web Module Access persistence + server-side enforcement. Super Admin all modules; Identity Admin/Super Admin manage eligible accounts; normal Admin no access-management controls.
8. [ ] Keep CY Web core self-service entry available for every active Employee regardless of business Module Access.
9. [ ] Implement create-time Role selection and UI behavior: ADMIN creates USER only; Identity Admin/Super Admin create USER or ADMIN.
10. [ ] Surface activation email send state, pending edit/resend/delete, and direct-link activation UX after provider support exists.
11. [ ] Surface forced activated-account Email recovery for Identity Admin/Super Admin and `啟用 · Email 待驗證` state.
12. [ ] Browser-accept USER / ADMIN / Identity Admin / Super Admin visibility and mutation boundaries, including Identity Admin anti-self-escalation.
13. [ ] Browser-accept CY Web Module Access changes and immediate server-side enforcement.
14. [ ] Accept first activation email + resend + direct CY Web activation link through the configured Email provider.
15. [ ] Accept role/App Access changes and provider session invalidation behavior.
16. [ ] Obtain literal expired-session evidence through CY Web; invalid-session handling is already accepted.
17. [ ] Manually accept self-service forgot-password/own Email change and controlled Super Admin transfer without risking lockout.
18. [ ] Add protected Worker business HTTP routes with server-side module authorization.
19. [ ] Replace temporary `localStorage` business-data persistence with Worker API -> D1 while preserving the React workflow.
20. [ ] Perform Desktop/Tablet/Mobile real-browser acceptance.
21. [ ] Implement and accept backup/restore before production rollout.
22. [ ] Bind/deploy production Worker/D1/custom domain only after explicit production acceptance.

## Current Identity acceptance boundary

Already accepted:

- dedicated CYCloud Identity Worker/D1 in development;
- Email-OTP bootstrap of the first Workspace;
- 8-16 Unicode-character password boundary;
- application-aware login and provider-owned session;
- CY Web HttpOnly Identity cookie boundary;
- same-origin login/me/logout browser contract;
- F5 resolve, logout revocation and post-logout rejection;
- deployed rejection of provider-invalid session with `401 AUTH_INVALID` + cookie clearing;
- provider protection against directly disabling/deleting current Super Admin;
- pending-first-activation deletion in current provider runtime;
- Public-source secret/operational-ID boundaries.

Approved but not implemented/accepted yet:

- direct Workspace role principal (`SUPER_ADMIN / ADMIN / USER`);
- Identity Admin capability and its management boundaries;
- locked CY Web core entry for all valid Employees;
- target App Access model without Group-derived coarse role;
- CY Web Module Access for Admin/User identities;
- automatic first activation email + direct CY Web link + resend/failure state;
- forced activated-account Email recovery;
- target role/access session invalidation acceptance;
- literal expired-session evidence.

## Topic source map

- Architecture index: `docs/architecture/README.md`
- Business Decisions: `docs/architecture/decisions/README.md`
- Data model: `docs/architecture/CANONICAL_DATA_MODEL.md`
- Physical dictionary: `docs/architecture/FINAL_DATA_DICTIONARY.md`
- D1 schema gate/freeze: `docs/architecture/D1_SCHEMA_REVIEW.md`
- Operational local runtime: `docs/architecture/OPERATIONAL_LOCAL_RUNTIME.md`
- API contract: `docs/architecture/API_CONTRACT.md`
- Shared Identity boundary: `docs/architecture/IDENTITY_ADAPTER.md`
- CYCloud Identity deployment: `docs/development/IDENTITY_DEPLOYMENT.md`
- Backup/recovery: `docs/architecture/BACKUP_ARCHITECTURE.md`
- Domain namespace/rollout: `docs/DOMAIN_STRATEGY.md`
- AI continuity handoff only: `docs/development/IDENTITY_HANDOFF_2026-09-29.md`

Historical preview/audit/readiness/review documents under `docs/architecture/archive/` are evidence only. Handoff notes are also non-canonical and must not override current rules/contracts or later Business Decisions.
