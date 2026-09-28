# CY Web TODO

> 本文件只記錄 **current implementation status 與下一步**；不是永久規則來源，也不重複保存 Business Decision、module contract 或 architecture semantics。

## Current checkpoint — 2026-09-28

- Formal code baseline: `main`; current work item is version `0.1.40` on the D1 local-integration PR until merged.
- Forward product surface: real integrated React operational application.
- Temporary browser persistence: versioned `localStorage`.
- Forward D1 migration chain: `0001_initial.sql` + `0002_defect_invalidation.sql`.
- Source/schema contracts, browser TypeScript, Worker TypeScript and Vite build are green for the current work item.
- Wrangler **local D1** migration + core Worker/D1 acceptance is green for Customer batch persistence, optimistic revision, rollback, Audit atomic batch, fixed-point integer storage, foreign keys and Defect invalidation migration shape.
- The D1 acceptance gate exposed and fixed a Customer child-row ordering bug in real `D1Database.batch()` behavior.
- Production/remote D1, production Worker/DNS, R2/GCS resources and SMART ERP remain untouched.
- CYAccountingWeb remains a separate application workstream.

## Active next sequence

1. [ ] Continue real-user functional/UI testing directly against the integrated React application; fixes stay in the same product UI rather than returning to standalone previews.
2. [x] Apply the current migration chain to fresh Wrangler local D1 and run the core Worker/D1 acceptance gate.
3. [ ] Extend D1 acceptance to Item conversion/fixed-point domain behavior, Outsourcing reversal/replacement + derived stock, and WorkLog review/cancel-review persistence.
4. [ ] Freeze the initial relational schema after the remaining domain-specific D1 acceptance cases pass.
5. [ ] Complete the concrete Shared Identity browser-session provider acceptance for CY Web.
6. [ ] Add protected Worker business HTTP routes with server-side role/module authorization.
7. [ ] Replace the temporary `localStorage` persistence adapter with Worker API → D1 while preserving the same React UI/workflows.
8. [ ] Perform Desktop／Tablet／Mobile real-browser/device acceptance.
9. [ ] Bind/deploy production Worker／D1／custom domain only after explicit production acceptance.
10. [ ] Implement and acceptance-test CY Web backup runtime/providers/restore flow when the production Worker/D1 boundary is ready.

UI polish is continuous and does **not** block D1 integration.

## Current acceptance gates

### D1 / Worker

Completed core local-runtime gate:

- forward migrations apply through Wrangler local D1;
- migration reapply is safe;
- real Worker can use the same temporary local D1 state;
- Customer parent/child batch persistence;
- optimistic revision conflict behavior;
- failed-batch rollback;
- business mutation + Audit atomic batch;
- exact fixed-point integer round-trip;
- D1 foreign-key enforcement;
- Defect invalidation migration columns.

Still required before schema freeze:

- Item conversion/fixed-point domain acceptance;
- Outsourcing confirmed movement + reversal/replacement + derived-stock acceptance;
- WorkLog review/cancel-review/finalized-result acceptance;
- any remaining D1-specific transactional/Audit invariants found while exercising those workflows.

### Shared Identity

Already staged in CY Web:

- provider-neutral Identity adapter boundary;
- normalized principal contract;
- shared `EMPLOYEE / ADMIN / SUPER_ADMIN` role semantics;
- CY Web-local app-tag/module access projection.

Still required before protected multi-user D1 operation:

- CY Web application audience/scope at the shared provider;
- browser-safe session establishment and server-side session resolution;
- disabled/revoked identity/session behavior;
- logout/revocation path;
- authenticated client session/menu state;
- protected Worker-route server authorization.

### Production rollout

Production deployment remains gated by:

- completed D1/schema acceptance;
- Identity/permission acceptance;
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
- D1 schema gate: `docs/architecture/D1_SCHEMA_REVIEW.md`
- Operational local runtime: `docs/architecture/OPERATIONAL_LOCAL_RUNTIME.md`
- API contract: `docs/architecture/API_CONTRACT.md`
- Shared Identity boundary: `docs/architecture/IDENTITY_ADAPTER.md`
- Backup/recovery: `docs/architecture/BACKUP_ARCHITECTURE.md`
- Domain namespace/rollout: `docs/DOMAIN_STRATEGY.md`
- Module-specific behavior: applicable `*_MODULE_CONTRACT.md` plus latest applicable Business Decisions.

Historical preview/audit/readiness/review documents under `docs/architecture/archive/` are evidence only. They must not override current source, current specialized contracts or later confirmed Business Decisions.
