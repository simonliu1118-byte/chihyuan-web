# CY Web TODO

> 本文件只記錄 **current implementation status 與下一步**；不是永久規則來源，也不重複保存 Business Decision、module contract 或 architecture semantics。

## Current checkpoint — 2026-09-29

- Formal code baseline: `main`; current work item version: `0.1.47`.
- Forward product surface: real integrated React operational application.
- Temporary browser business-data persistence: versioned `localStorage`.
- Frozen initial relational baseline: `0001_initial.sql` + `0002_defect_invalidation.sql`.
- Identity migration history: `0003_identity_web_sessions.sql` records the retired compatibility bridge; `0004_remove_local_identity_sessions.sql` removes the duplicate CY Web session table after the CYCloud Identity cutover.
- Source/schema contracts, browser TypeScript, Worker TypeScript, Vite build, Wrangler local D1 acceptance and deployment-contract validation are green.
- CYCloud Identity development authority is live and bootstrap/login/logout have been manually accepted for the first development Workspace highest-authority account.
- CY Web V0.1.47 is deployed in development against `CYCloud Identity`; private `IDENTITY` Service Binding now resolves login/session/logout and CY Web no longer owns a duplicate Identity session authority.
- Real browser acceptance with Employee `3001` passed: password login, authenticated navigation, F5 session resolve, logout and post-logout F5 all behaved correctly.
- Shared normal authorization uses extensible Identity Groups; the Workspace highest authority is the protected `isWorkspaceSuperAdmin` signal, not an ordinary role enum.
- CY Web continues to own app-local `app_members` / app tags / module authorization only.
- Development deployment remains manual-only through the GitHub `development` Environment; actual Cloudflare resource/provider targets and Workspace identifiers are not stored in Public source.
- CYInvoice Cloud remains unchanged and is no longer the CY Web development login provider.
- Production D1/Worker/DNS/custom domain, R2/GCS resources and SMART ERP remain untouched.
- CYAccountingWeb remains a separate application workstream.

## Active next sequence

1. [x] Complete the CYCloud Identity cutover PR and make all CI/validation gates green.
2. [x] Update CY Web `development` Environment values to the CYCloud Identity service/Application/Workspace targets and run the manual development deployment.
3. [x] Perform real browser login / me / logout acceptance in CY Web with employee `3001` without exposing credentials/session token to frontend JavaScript.
4. [ ] Verify invalid/expired provider-session handling through CY Web; normal logout revocation has already been accepted.
5. [ ] Add protected Worker business HTTP routes with server-side module authorization.
6. [ ] Replace the temporary `localStorage` business-data persistence adapter with Worker API → D1 while preserving the same React UI/workflows.
7. [ ] Build CY Web account-management UI on the shared Identity management APIs when those APIs are completed; Workspace highest authority alone sees OTP security settings.
8. [ ] Add at least one ordinary non-highest-authority development Employee and prove group/direct Application Access + CY Web-local module tags independently.
9. [ ] Perform Desktop／Tablet／Mobile real-browser/device acceptance.
10. [ ] Bind/deploy production Worker／D1／custom domain only after explicit production acceptance.
11. [ ] Implement and acceptance-test CY Web backup runtime/providers/restore flow when the production Worker/D1 boundary is ready.

UI polish is continuous and does **not** block Identity/API integration.

## Current acceptance gates

### D1 / Worker — schema gate complete

Accepted on Wrangler local D1:

- forward migrations apply and safely reapply;
- real Worker uses the same temporary local D1 state;
- Customer parent/child batch persistence;
- optimistic revision conflict behavior;
- failed-batch rollback;
- business mutation + Audit atomic batch;
- exact fixed-point integer round-trip and Item chained unit conversion;
- D1 foreign-key enforcement;
- Defect invalidation migration columns;
- Outsourcing plan-only pending state, confirmed stock movements, correction reversal/replacement, cancellation and derived-stock reconciliation;
- WorkLog submit/review/cancel-review, reviewer-corrected Work Days, finalized scores, stored-result statistics and Audit sequence;
- identity migration `0004` removes only the retired temporary `web_sessions` projection.

The initial business schema remains frozen. Future schema changes use new numbered forward migrations and must preserve these acceptance gates.

### Identity — CYCloud Identity development cutover accepted

Accepted in CYCloud Identity development:

- dedicated Identity Worker and Identity D1;
- first development Workspace bootstrap by Email OTP;
- first highest-authority Employee login;
- 8–16 Unicode-character password boundary;
- provider-owned 8-hour Identity session;
- logout/revocation;
- protected highest-authority signal `isWorkspaceSuperAdmin`;
- extensible Identity Groups and Application Access model;
- no real secrets/Workspace data committed to Public source.

Accepted through CY Web V0.1.47:

- concrete `CYCloudIdentityClient` using `/v1/identity/login`, `/v1/identity/session/resolve`, `/v1/identity/logout`;
- normalized principal with `workspaceId`, employee identity, `isWorkspaceSuperAdmin`, `groupKeys`, credential/revision metadata;
- no hard-coded normal shared role enum;
- opaque Identity session in `cyweb_identity_session` HttpOnly / Secure / SameSite=Strict cookie;
- no CY Web-owned Identity session table after `0004`;
- `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` remain same-origin browser contracts;
- provider error normalization and local `app_members`/tag authorization boundary;
- deployment-injected `IDENTITY` Service Binding, `IDENTITY_APPLICATION_ID`, `IDENTITY_WORKSPACE_ID`;
- synthetic-only CI deployment placeholders;
- development deployment completed successfully;
- real browser password login, F5 session resolve, logout and post-logout F5 acceptance passed.

Still required before protected multi-user business operation:

- invalid/expired provider-session rejection through CY Web;
- an ordinary non-highest-authority development Employee with group/direct Application Access acceptance;
- protected Worker business-route server authorization;
- remaining shared Identity account-management/recovery APIs before CY Web exposes the account-management UI.

### Production rollout

Production deployment remains gated by:

- protected Worker/API + D1 persistence integration;
- remaining Shared Identity recovery/management acceptance;
- major workflow acceptance;
- Desktop/Tablet/Mobile acceptance;
- backup/restore recovery acceptance;
- explicit production approval.

## Topic source map

Do not copy detailed rules into this TODO. Read the applicable source instead:

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
- Module-specific behavior: applicable `*_MODULE_CONTRACT.md` plus latest applicable Business Decisions.

Historical preview/audit/readiness/review documents under `docs/architecture/archive/` are evidence only. They must not override current source, current specialized contracts or later confirmed Business Decisions.
