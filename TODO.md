# CY Web TODO

This file records current work and engineering direction. It is not a permanent rules source.

## Immediate sequence

1. [x] Consolidate architecture documents and Business Decision supersession map through BD-048.
2. [ ] Review only the **genuinely unresolved** items listed in the current `docs/architecture/CANONICAL_DATA_MODEL.md`.
3. [ ] Produce the Final Data Dictionary.
4. [ ] Freeze the initial D1 relational schema / indexes / constraints / forward migrations.
5. [ ] Create the Cloudflare Worker project and environment/binding templates.
6. [ ] Add CY Web GCS runtime secrets to the CY Web Worker only after that Worker exists.
7. [ ] Implement the reusable application foundation, then business modules.

## Phase 0 — Governance / Public foundation

- [x] Create Public `chihyuan-web` and `main` baseline.
- [x] Keep the complete GAS source/history in Private `chihyuan-legacy-private`.
- [x] Adopt AITeam Governance 2.0 three-layer rules.
- [x] Establish Public-safe source/infrastructure boundary.
- [x] Define CY shared-visual boundary and CY Web Design System direction.
- [x] Establish Governance Check / common-rules synchronization.
- [x] Consolidate repository documentation so active docs, historical audits, decisions, and operational handoffs have distinct roles.

## Phase 1 — Legacy behavior inventory / architecture

- [x] Inventory Customer, Order, Outsourcing, WorkLog, Item and supporting Sheet/data structures.
- [x] Audit Legacy data semantics and normalize master/FK/child/snapshot/lookup/audit concepts.
- [x] Re-audit Desktop workflow, reversals, permissions, cross-module effects, and history/audit behavior.
- [x] Record Business Decisions BD-001 through BD-046.
- [x] Confirm that existing Legacy rows are development/test data and **will not be migrated** to production D1 (BD-047).
- [x] Confirm that SMART ERP customer number may be changed/corrected without changing Customer identity (BD-048).
- [x] Archive pre-consolidation architecture drafts and replace active docs with consolidated indexes/current model.
- [ ] Resolve only remaining real Data-Dictionary questions; do not repeat already confirmed Business Decisions.
- [ ] Complete Final Data Dictionary.

### Removed from launch scope by BD-047

The following are intentionally **not** launch tasks:

- Legacy Sheet value-level profiling for migration acceptance;
- Google Sheets → D1 production importer;
- `legacy_id_map`;
- Legacy row-count / orphan-FK / alias reconciliation as a cutover gate;
- Legacy-data migration dry-run / rollback.

Legacy source remains available as behavior/reference evidence.

## Phase 2 — Cloudflare / D1 foundation

- [ ] Finalize frontend stack; current engineering direction is TypeScript + React + Vite.
- [ ] Create Cloudflare Worker project and environment separation.
- [ ] Add `/health` endpoint and deployment smoke path.
- [ ] Create D1 binding template and production-safe deployment injection.
- [ ] Implement initial D1 SQL schema from the Final Data Dictionary.
- [ ] Establish forward schema-migration process/source of truth.
- [ ] Define API contract, error contract, server validation schema, pagination and search patterns.
- [ ] Establish structured audit/event foundation.

Production starts from a clean D1 schema; forward D1 schema migrations remain required even though Legacy data migration is not.

## Phase 3 — Reusable CY Web foundation

- [ ] App Shell / navigation / route guard.
- [ ] Shared Identity adapter / session handling / permission guard.
- [ ] App-local module tags and access guard per BD-037.
- [ ] API client / error / loading / retry pattern.
- [ ] Form controls and validation presentation.
- [ ] Data table / mobile cards / filter / search / pagination.
- [ ] Dialog / Drawer / Bottom Sheet / full-screen mobile form patterns.
- [ ] Audit/history UI.
- [ ] RWD + Adaptive Desktop/Tablet/Mobile acceptance matrix.

## Phase 4 — Business modules

Implementation order may be adjusted for dependency efficiency, but all modules reuse the shared foundation rather than creating parallel patterns.

- [ ] Customer / Visits / Frequent items / customer-item Quote history.
- [ ] Item / unit conversion / Item history / Defect.
- [ ] Sales work order / ERP fill-correct / picking / shipment / void.
- [ ] Contractor / BOM / Outsourcing / receiving / pricing / payment / stock ledger.
- [ ] WorkLog / Scoring / History Statistics.
- [ ] Settings / Admin.

Before implementing each workflow, check `docs/architecture/decisions/README.md` and applicable BD files so resolved decisions are not re-opened.

## Backup / recovery — GCS

Architecture:

- [x] In-app backup/restore is Super Admin-only; restore requires double confirmation and audit (BD-044).
- [x] Chihyuan production initially uses GCS as off-site storage while D1 remains live data (BD-045).
- [x] CY Web and CYAccountingWeb use isolated backup datasets and isolated service identities during independent deployment.
- [x] Define provider-neutral `BackupService` + `BackupStorageProvider` boundary (BD-046).
- [x] Define portable `manifest.json + data.json` backup set and SHA-256 upload/read-back verification (BD-046).

CY Web infrastructure preparation:

- [x] Create CY Web production GCS bucket with non-public, uniform bucket-level access and recovery-oriented settings.
- [x] Create CY Web dedicated least-privilege service identity.
- [x] Verify bucket-scoped `Storage Object Admin` IAM for the CY Web service identity.
- [x] Create the CY Web Service Account JSON credential for the selected direct Worker→GCS deployment path. The key itself remains outside Git.
- [ ] After the CY Web Worker exists, store the credential as a Cloudflare Worker Secret and store bucket/runtime configuration through the approved deployment/runtime boundary.
- [ ] Implement GCS `BackupStorageProvider`: put/get/list/delete.
- [ ] Implement `BackupService`: D1 export, package/manifest, SHA-256, read-back verify, list, retention, restore orchestration.
- [ ] Implement SA-only backup/list/verify/restore API + UI + audit.
- [ ] Finalize retention, retry/failure semantics and disaster-recovery drill.

CYAccountingWeb implementation is **not modified from this project branch**. Its GCS implementation was handed back to the CYAccountingWeb workstream; this repo only retains the shared architectural contract.

Precise production GCP resource identifiers and operational setup status remain in the Private operational handoff rather than Public Git.

## Medium-term — SMART ERP item-code replacement

This is a future production business-data operation and is **not** the removed Legacy GAS/Sheet migration.

- [ ] Obtain/validate complete old Item number → new Item number mapping when SMART ERP coding replacement is ready.
- [ ] Keep old Item numbers searchable during the transition; new transactions use current SMART ERP numbers (BD-011).
- [ ] Provide dry-run, duplicate/unmapped/conflict checks and affected-row reconciliation.
- [ ] Preserve immutable `items.id` and all relational foreign keys.
- [ ] Update only explicitly authorized item-number snapshots/mappings during final retirement; do not rewrite unrelated historical prices, quantities, dates, etc.
- [ ] Create recoverable backup/rollback point before execution.
- [ ] Record migration-level administrative audit evidence.
- [ ] Remove old-number search/mappings only after explicit user authorization.

## Phase 5 — CYCloud Identity evolution

- [ ] Inventory the reusable shared Workspace / Employee / Credential / Session / OTP / Recovery contract.
- [ ] Define CYCloud Identity versus App-specific permission/tag boundaries.
- [ ] Remove CYInvoice-specific naming/routing/schema coupling from the shared identity layer when the extraction project begins.
- [ ] Move CY Web and CYInvoice to the extracted shared Identity service when ready.

## Phase 6 — Fresh production launch

There is no Legacy-data cutover.

Acceptance focuses on the new system:

- [ ] Production D1 starts from the approved clean schema.
- [ ] Identity/session/permission/high-risk-operation acceptance.
- [ ] Customer/Item/Order/Outsourcing/WorkLog/Settings workflow acceptance.
- [ ] Desktop/Tablet/Mobile real-device/browser acceptance.
- [ ] Backup/restore integrity and disaster-recovery acceptance.
- [ ] Any enabled SMART ERP integration is reconciled against its explicit adapter contract.
- [ ] After the user confirms CY Web is stable for real use, retire the old GAS deployment/Sheet as appropriate.
