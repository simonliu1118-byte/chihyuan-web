# CY Web TODO

> 本文件只記錄 **current implementation status 與下一步**；不是永久規則來源，也不重複保存 Business Decision、module contract 或 architecture semantics。

## Current checkpoint — 2026-09-28

- Formal code baseline: `main`.
- Current application version: `0.1.39`.
- Forward product surface: real integrated React operational application.
- Temporary browser persistence: versioned `localStorage`.
- Forward D1 migration chain: `0001_initial.sql` + `0002_defect_invalidation.sql`.
- The 0.1.39 integration baseline passed Governance Check and Runtime Check before merge, including browser TypeScript, Worker TypeScript, Vite build and source/schema validators.
- Production D1 data, production Worker/DNS, R2/GCS resources and SMART ERP have not been modified by the current local operational runtime.
- CYAccountingWeb is a separate application workstream.

## Active next sequence

1. [ ] Continue real-user functional/UI testing directly against the integrated React application; fixes stay in the same product UI rather than returning to standalone previews.
2. [ ] Apply current migrations to **local/dev Cloudflare D1**.
3. [ ] Run Worker + D1 smoke/transaction acceptance for constraints, fixed-point values, optimistic revision, Audit and reversal workflows.
4. [ ] Freeze the initial relational schema only after real D1 acceptance passes.
5. [ ] Complete the concrete Shared Identity browser-session provider acceptance for CY Web.
6. [ ] Add protected Worker business HTTP routes with server-side role/module authorization.
7. [ ] Replace the temporary `localStorage` persistence adapter with Worker API → D1 while preserving the same React UI/workflows.
8. [ ] Perform Desktop／Tablet／Mobile real-browser/device acceptance.
9. [ ] Bind/deploy production Worker／D1／custom domain only after explicit production acceptance.
10. [ ] Implement and acceptance-test CY Web backup runtime/providers/restore flow when the production Worker/D1 boundary is ready.

UI polish is continuous and does **not** block local/dev D1 integration.

## Current acceptance gates

### D1 / Worker

Still required before schema freeze:

- apply migrations to local/dev D1;
- run the Worker against that D1;
- verify D1-specific constraints and transaction behavior;
- verify optimistic revision conflicts;
- verify Audit + business mutation atomicity;
- verify exact fixed-point persistence/conversion behavior;
- verify Outsourcing reversal/replacement and WorkLog review/cancel-review transitions.

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

- D1/Worker runtime acceptance;
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
