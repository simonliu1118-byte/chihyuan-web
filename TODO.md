# CY Web TODO

> 本文件只記錄 **current implementation status 與下一步**；不是永久規則來源，也不重複保存 Business Decision、module contract 或 architecture semantics。

## Current checkpoint — 2026-09-29

- Formal code baseline: `main`; current version: `0.1.51`.
- Forward product surface remains the integrated React operational application; temporary browser business-data persistence remains versioned `localStorage` pending Worker API → D1 migration.
- Frozen initial relational baseline remains `0001_initial.sql` + `0002_defect_invalidation.sql`; Identity compatibility history is `0003_identity_web_sessions.sql` followed by `0004_remove_local_identity_sessions.sql`.
- Source/schema contracts, browser TypeScript, Worker TypeScript, Vite build, Wrangler local D1 acceptance, Governance and deployment-contract validation are green for the current Identity management work.
- CYCloud Identity development authority is live. CY Web uses the private `IDENTITY` Service Binding and no longer owns a duplicate Identity session authority.
- Browser acceptance already passed for the first development Super Admin account: password login, authenticated navigation, F5 session resolve, logout and post-logout F5.
- Shared Identity account-management UI is implemented and development-deployed from CY Web `0.1.49`.
- CY Web `0.1.50` added a post-deployment live invalid-provider-session gate. Manual Development Deploy run `#20` passed on 2026-09-29, proving that a provider-rejected invalid session returns HTTP `401` / `AUTH_INVALID` through deployed CY Web and clears the `cyweb_identity_session` cookie. Expired-session evidence remains separate.
- CY Web `0.1.51` is merged to `main` and awaits the next manual Development Deploy. Employee management now distinguishes `尚未驗證／待啟用`, `啟用`, and `停用`; pending first-time activation rows expose delete rather than enable; Super Admin transfer moved into the current Super Admin Employee row and opens a dedicated transfer modal.
- CYCloud Identity `0.1.14` is development-deployed and provides the protected pending-Employee DELETE contract used by CY Web `0.1.51`. It rejects deletion after activation and preserves Super Admin protection.
- User-facing management terminology is `超級管理員 (Super Admin)`. Stable provider protocol/storage identifiers such as `isWorkspaceSuperAdmin` remain unchanged for compatibility.
- Self-service UI includes password change and Email change. Login page includes forgot-password and account activation flows.
- Super-Admin-only Workspace management UI includes Employee administration, Identity Groups/membership, Group/direct Application Access, Application `USER_ADMIN` compatibility mode and OTP security settings.
- Current Super Admin cannot be directly disabled or deleted before authority transfer; the backend remains the final protection boundary.
- Super Admin Application access is represented as protected automatic access, not as a misleading ordinary direct-grant checkbox.
- CYInvoice compatibility mapping is consumed from CYCloud Identity: `SUPER_ADMIN > ADMIN > USER`; ordinary Groups only map to `USER`/`ADMIN`; ordinary Group membership cannot create `SUPER_ADMIN`.
- CY Web continues to own only app-local module authorization/tags; shared Employee/Group/session/OTP authority stays in CYCloud Identity.
- Development deployment remains manual-only through the GitHub `development` Environment. Real operational targets/Workspace identifiers are not stored in Public source.
- CYACC-web and CYInvoice are separate Shared Identity consumer integration workstreams. CYInvoice remains unchanged by this CY Web work.
- Production D1/Worker/DNS/custom domain, backup rollout and SMART ERP remain untouched.

## Active next sequence

1. [x] Cut login/session/logout to CYCloud Identity and accept login/F5/logout in development.
2. [x] Add Shared Identity self-service UI, Employee/Group/Application Access UI and Super-Admin-only OTP settings.
3. [x] Add protected Super Admin transfer + Recovery Email provider flow.
4. [x] Protect the current Super Admin from normal disable/delete actions; backend remains the final protection boundary.
5. [ ] Verify invalid/expired provider-session rejection through CY Web. Invalid-session live acceptance passed in Development Deploy run `#20`; separate expired-session evidence is still required before this combined item can be closed.
6. [ ] Manually deploy CY Web `0.1.51`, then accept the revised Employee lifecycle UI: pending status, pending-only delete, enabled/disabled distinction and Super Admin transfer modal.
7. [ ] Create/activate one ordinary non-Super-Admin development Employee and accept login.
8. [ ] Prove ordinary Employee sees self-service only and sees **no** Workspace management, OTP settings or Super Admin controls.
9. [ ] Exercise one controlled Group membership + Application Access path and verify effective `USER`/`ADMIN` compatibility projection.
10. [ ] Manually accept forgot-password and own Email-change paths. Do not expose passwords/OTP values in chat or screenshots.
11. [ ] Controlled Super Admin transfer acceptance only after a safe second verified Employee exists; preserve a working authority path throughout the test.
12. [ ] Add protected Worker business HTTP routes with server-side module authorization.
13. [ ] Replace temporary `localStorage` business-data persistence with Worker API → D1 while preserving the same React UI/workflows.
14. [ ] Perform Desktop／Tablet／Mobile real-browser/device acceptance.
15. [ ] Implement and acceptance-test backup runtime/providers/restore when the production Worker/D1 boundary is ready.
16. [ ] Bind/deploy production Worker／D1／custom domain only after explicit production acceptance.

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
- deployed CY Web rejection of a provider-invalid session with HTTP `401` / `AUTH_INVALID` and browser-cookie clearing;
- self-service / management UI load through the private Identity binding;
- Super-Admin-only UI gating;
- server protection against directly disabling/deleting current Super Admin;
- pending-first-activation Employee deletion contract in deployed CYCloud Identity `0.1.14`;
- Group/direct Application Access and coarse compatibility-role UI;
- no real secrets/operational IDs committed to Public source.

Still required before protected multi-user business operation:

- deploy and manually accept CY Web `0.1.51` Employee lifecycle/Super Admin UI changes;
- obtain separate expired-session acceptance evidence through CY Web;
- ordinary Employee activation/login/UI-visibility acceptance;
- controlled mutation acceptance for Employee/Group/access/security-policy/self-service/Super Admin transfer;
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
