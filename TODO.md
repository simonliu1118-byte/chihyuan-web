# CY Web TODO

> 本文件只記錄 **current implementation status 與下一步**；不是永久規則來源，也不重複保存 Business Decision、module contract 或 architecture semantics。

## Current checkpoint — 2026-09-28

- Formal code baseline: `main`; current work item version: `0.1.43`.
- Forward product surface: real integrated React operational application.
- Temporary browser business-data persistence: versioned `localStorage`.
- Frozen initial relational baseline: `0001_initial.sql` + `0002_defect_invalidation.sql`.
- Post-freeze forward migration: `0003_identity_web_sessions.sql` for CY Web's temporary browser-session projection; the frozen business schema was not rewritten.
- Source/schema contracts, browser TypeScript, Worker TypeScript, Vite build and Wrangler local D1 acceptance are green.
- Temporary account bridge follows the already-proven CYAccountingWeb pattern: private `IDENTITY` Service Binding → existing external Web Auth login → CY Web-owned short-lived D1 session.
- Development deployment contract is staged and CI-accepted: placeholder render, rendered-config local migrations, Cloudflare Vite production build and Wrangler deployment dry-run are green.
- Real development deployment is manual-only through the GitHub `development` Environment; actual Cloudflare resource/provider targets are not stored in Public source.
- CYInvoice Cloud is not modified, CY Web does not read its D1, and credential verifier/OTP/recovery internals are not copied into CY Web.
- Production D1/Worker/DNS/custom domain, R2/GCS resources and SMART ERP remain untouched.
- CYAccountingWeb remains a separate application workstream.

## Active next sequence

1. [ ] Continue real-user functional/UI testing directly against the integrated React application; fixes stay in the same product UI rather than returning to standalone previews.
2. [x] Apply the initial migration chain to fresh Wrangler local D1 and run the core Worker/D1 acceptance gate.
3. [x] Complete Item conversion/fixed-point, Outsourcing reversal/replacement + derived-stock, and WorkLog review/cancel-review D1 acceptance.
4. [x] Freeze the initial relational schema after the D1 acceptance gates pass.
5. [x] Stage the temporary provider-neutral CYInvoice account bridge and CY Web-owned browser session layer without modifying CYInvoice Cloud.
6. [x] Build and CI-accept the development deployment contract for D1 + private `IDENTITY` Service Binding.
7. [ ] Configure/run the manual non-production deployment and perform real login / me / logout acceptance against the existing account service.
8. [ ] Add protected Worker business HTTP routes with server-side role/module authorization.
9. [ ] Replace the temporary `localStorage` business-data persistence adapter with Worker API → D1 while preserving the same React UI/workflows.
10. [ ] Complete final Shared Identity extraction/acceptance for `EMPLOYEE / ADMIN / SUPER_ADMIN`, provider-side revocation and final audience semantics; then remove the temporary CYInvoice-specific provider adapter.
11. [ ] Perform Desktop／Tablet／Mobile real-browser/device acceptance.
12. [ ] Bind/deploy production Worker／D1／custom domain only after explicit production acceptance.
13. [ ] Implement and acceptance-test CY Web backup runtime/providers/restore flow when the production Worker/D1 boundary is ready.

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
- post-freeze `0003_identity_web_sessions.sql` migration and identity-session D1 round-trip.

The initial business schema remains frozen. Future schema changes use new numbered forward migrations and must preserve these acceptance gates.

### Identity — bridge and deployment path staged; real binding acceptance pending

Already implemented/accepted in CY Web:

- provider-neutral `IdentityLoginProvider` and request `IdentityAdapter` boundaries;
- normalized principal contract;
- shared `EMPLOYEE / ADMIN / SUPER_ADMIN` role semantics;
- CY Web-local app-tag/module access projection;
- isolated temporary CYInvoice Web Auth provider adapter;
- CY Web-owned `web_sessions` D1 projection;
- `cyweb_session` HttpOnly / Secure / SameSite=Strict cookie;
- `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`;
- stable provider error normalization and no credential-internal copy;
- placeholder-only Wrangler deployment template and validated renderer;
- development workflow with local migration + Vite build + Wrangler deploy dry-run;
- manual-only development deploy job using GitHub Environment-injected Cloudflare/D1/Identity values.

Still required before protected multi-user business operation:

- configure/confirm the `development` Environment inputs for this repository;
- run the manual development deployment;
- real end-to-end login / session / logout acceptance against the existing account service;
- confirm the currently available external audience's actual role restriction;
- add protected Worker-route server authorization;
- later complete Shared Identity extraction so ordinary `EMPLOYEE` support and provider-side disabled/revoked session semantics no longer depend on the temporary compatibility provider.

### Production rollout

Production deployment remains gated by:

- real non-production Identity bridge acceptance;
- protected Worker/API + D1 persistence integration;
- final Shared Identity/permission acceptance;
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
- Temporary Identity bridge deployment: `docs/development/IDENTITY_BRIDGE_DEPLOYMENT.md`
- Backup/recovery: `docs/architecture/BACKUP_ARCHITECTURE.md`
- Domain namespace/rollout: `docs/DOMAIN_STRATEGY.md`
- Module-specific behavior: applicable `*_MODULE_CONTRACT.md` plus latest applicable Business Decisions.

Historical preview/audit/readiness/review documents under `docs/architecture/archive/` are evidence only. They must not override current source, current specialized contracts or later confirmed Business Decisions.
