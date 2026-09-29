# CY Web TODO

> 本文件只記錄 **current implementation status 與下一步**；不是永久規則來源，也不重複保存 Business Decision、module contract 或 architecture semantics。

## Current checkpoint — 2026-09-29

- Formal code baseline: `main`; current version: `0.1.49`.
- Forward product surface remains the integrated React operational application; temporary browser business-data persistence remains versioned `localStorage` pending Worker API → D1 migration.
- Frozen initial relational baseline remains `0001_initial.sql` + `0002_defect_invalidation.sql`; Identity compatibility history is `0003_identity_web_sessions.sql` followed by `0004_remove_local_identity_sessions.sql`.
- Source/schema contracts, browser TypeScript, Worker TypeScript, Vite build, Wrangler local D1 acceptance, Governance and deployment-contract validation are green for the current Identity management work.
- CYCloud Identity development authority is live. CY Web uses the private `IDENTITY` Service Binding and no longer owns a duplicate Identity session authority.
- Browser acceptance already passed for the first development highest-authority account: password login, authenticated navigation, F5 session resolve, logout and post-logout F5.
- Shared Identity account-management UI is now implemented and development-deployed in CY Web `0.1.49`.
- Self-service UI includes password change and Email change. Login page includes forgot-password and account activation flows.
- Highest-authority-only Workspace management UI includes Employee administration, Identity Groups/membership, Group/direct Application Access, Application `USER_ADMIN` compatibility mode, OTP security settings, highest-authority summary/Recovery Email and authority-transfer flow.
- Workspace highest authority is protected by CYCloud Identity backend and cannot be directly disabled before transfer.
- Current highest-authority Employee row no longer presents the normal enable/disable action. This UI correction was merged as PR `#56` without an additional version bump and is included in the latest successful development deployment.
- Highest-authority Application access is represented as protected automatic access, not as a misleading ordinary direct-grant checkbox.
- CYInvoice compatibility mapping is consumed from CYCloud Identity: `SUPER_ADMIN > ADMIN > USER`; ordinary Groups only map to `USER`/`ADMIN`; ordinary Group membership cannot create `SUPER_ADMIN`.
- CY Web continues to own only app-local module authorization/tags; shared Employee/Group/session/OTP authority stays in CYCloud Identity.
- Development deployment remains manual-only through the GitHub `development` Environment. Real operational targets/Workspace identifiers are not stored in Public source.
- CYInvoice Cloud remains unchanged. CY Accounting Web remains a separate consumer workstream.
- Production D1/Worker/DNS/custom domain, backup rollout and SMART ERP remain untouched.

## Active next sequence

1. [x] Cut login/session/logout to CYCloud Identity and accept login/F5/logout in development.
2. [x] Add Shared Identity self-service UI, Employee/Group/Application Access UI and highest-authority-only OTP settings.
3. [x] Add highest-authority summary/Recovery Email and authority-transfer UI.
4. [x] Hide the normal Employee enable/disable action for the current Workspace highest authority; backend remains the final protection boundary.
5. [ ] Verify invalid/expired provider-session rejection through CY Web.
6. [ ] Create one ordinary non-highest-authority development Employee and accept activation/login.
7. [ ] Prove ordinary Employee sees self-service only and sees **no** Workspace management, OTP settings or highest-authority controls.
8. [ ] Exercise one controlled Group membership + Application Access path and verify effective `USER`/`ADMIN` compatibility projection.
9. [ ] Manually accept forgot-password and own Email-change paths. Do not expose passwords/OTP values in chat or screenshots.
10. [ ] Controlled highest-authority transfer acceptance only after a safe second verified Employee exists; preserve a working authority path throughout the test.
11. [ ] Add protected Worker business HTTP routes with server-side module authorization.
12. [ ] Replace temporary `localStorage` business-data persistence with Worker API → D1 while preserving the same React UI/workflows.
13. [ ] Perform Desktop／Tablet／Mobile real-browser/device acceptance.
14. [ ] Implement and acceptance-test backup runtime/providers/restore when the production Worker/D1 boundary is ready.
15. [ ] Bind/deploy production Worker／D1／custom domain only after explicit production acceptance.

UI polish is continuous and does **not** block Identity/API integration.

## Current Identity acceptance boundary

Accepted:

- dedicated CYCloud Identity Worker/D1 in development;
- Email-OTP bootstrap of the first development Workspace;
- 8–16 Unicode-character credential boundary;
- application-aware login and provider-owned session;
- CY Web HttpOnly Identity cookie boundary;
- same-origin `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` browser contract;
- F5 resolve, logout revocation and post-logout rejection;
- self-service / management UI load through the private Identity binding;
- highest-authority-only UI gating;
- server protection against directly disabling current highest authority;
- highest-authority summary and Recovery Email API/UI wiring;
- Group/direct Application Access and coarse compatibility-role UI;
- no real secrets/operational IDs committed to Public source.

Still required before protected multi-user business operation:

- invalid/expired session acceptance through CY Web;
- ordinary Employee activation/login/UI-visibility acceptance;
- controlled mutation acceptance for Employee/Group/access/security-policy/self-service/authority transfer;
- protected Worker business-route server authorization;
- Worker API → D1 business persistence cutover.

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
