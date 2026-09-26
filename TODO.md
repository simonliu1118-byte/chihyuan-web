# CY Web TODO

This file records current work and engineering direction. It is not a permanent rules source.

## Immediate sequence

1. [x] Consolidate architecture documents and Business Decision supersession map through BD-048.
2. [x] Finalize the shared tiered backup architecture: D1 live, R2 daily operational backup, GCS cross-cloud DR, shared package/provider contract and future CY Backup Service boundary (BD-049/050).
3. [ ] Review only the **genuinely unresolved** items listed in the current `docs/architecture/CANONICAL_DATA_MODEL.md`.
4. [ ] Produce the Final Data Dictionary.
5. [ ] Freeze the initial D1 relational schema / indexes / constraints / forward migrations.
6. [ ] Create the Cloudflare Worker project and environment/binding templates.
7. [ ] Bind the already-provisioned CY Web R2 bucket and add CY Web GCS runtime configuration only after the real CY Web Worker exists.
8. [ ] Implement the reusable application foundation, then business modules.

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
- [x] Confirm tiered backup and shared-service direction (BD-049/050).
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

## Backup / recovery — tiered R2 + GCS

Canonical detail: `docs/architecture/BACKUP_ARCHITECTURE.md`.

Architecture:

- [x] In-app backup/restore is Super Admin-only; restore requires double confirmation and audit (BD-044).
- [x] Keep D1 as live authoritative database; backup stores are not live/sync databases.
- [x] Use Cloudflare R2 as the daily operational backup tier: daily 03:30 Taiwan time, 30-day retention (BD-049).
- [x] Use GCS as cross-cloud disaster recovery: Wednesday/Sunday replication, 26-week retention (BD-049).
- [x] One logical backup is exported from D1 only once; R2 and GCS copies use identical `manifest.json + data.json` bytes and the same `backupId` (BD-049/050).
- [x] Keep provider-neutral `BackupService` + `BackupStorageProvider` boundary (BD-046/050).
- [x] Standardize CY Web / CYAccountingWeb on the same outer `CYBackupSet` contract and SHA-256/read-back verification model (BD-050).
- [x] Keep CY Web and CYAccountingWeb datasets and credentials isolated even when they later use a shared CY Backup Service / Worker (BD-050).
- [x] Define future shared service boundary: shared Worker owns provider adapters/replication/retention/copy catalog; each App keeps D1 export, schema compatibility, authorization and restore writes (BD-050).

Shared R2 infrastructure preparation:

- [x] Activate R2 for the Cloudflare account.
- [x] Provision separate production R2 buckets for CY Web and CYAccountingWeb; use Standard storage, Asia-Pacific automatic placement, public access disabled and no Bucket Lock.
- [x] Add an R2 bucket-level 45-day delete Lifecycle rule as a safety guard behind the application-level 30-day retention policy; keep the default multipart-abort rule enabled.
- [x] Keep the two applications physically isolated at the bucket/binding boundary rather than sharing one bucket by prefix only.

CY Web infrastructure preparation:

- [x] Create CY Web production GCS bucket and dedicated least-privilege service identity.
- [x] Verify bucket-scoped GCS IAM for the CY Web identity.
- [x] Create the CY Web Service Account JSON credential; keep it outside Git.
- [x] Provision the CY Web-specific R2 operational backup bucket; binding waits for the real CY Web Worker.
- [ ] Configure the real CY Web Worker runtime with the existing app-scoped R2 bucket binding plus CY Web GCS configuration/secret through the approved deployment/runtime boundary.
- [ ] Implement canonical `CYBackupSet` builder and app-level `BackupService`.
- [ ] Implement R2 `BackupStorageProvider` and GCS `BackupStorageProvider` behind the same contract.
- [ ] Implement logical backup + provider-copy catalog semantics so one backup is listed once with per-provider health.
- [ ] Implement daily R2 backup, Wednesday/Sunday GCS replication from the same already-created bytes, retry and provider-specific retention.
- [ ] Implement SA-only backup/list/verify/restore API + UI + audit; normal restore prefers R2 and falls back to GCS.
- [ ] Perform operational restore and cross-cloud disaster-recovery drills.

CYAccountingWeb coordination:

- [x] Confirm CYAccountingWeb V0.17 GCS production backup has passed real acceptance and must remain the accepted rollback path during migration.
- [x] Produce a new public-safe handoff at `docs/handoffs/CYACCOUNTINGWEB_TIERED_BACKUP_HANDOFF.md`.
- [x] Provision the Accounting-specific production R2 bucket and 45-day lifecycle safety guard; the Accounting workstream must reuse it rather than create another R2 dataset.
- [ ] CYAccountingWeb workstream implements the additive migration and binds its existing R2 bucket; **this CY Web branch does not modify CYAccountingWeb source/runtime**.
- [ ] Require 14 consecutive successful parallel R2 + existing daily GCS backups before CYAccountingWeb changes to the tiered daily-R2 / Wed-Sun-GCS schedule.
- [ ] Only after shared-service acceptance may direct per-App provider credentials/bindings be retired.

Precise production resource identifiers remain in Private operational documentation rather than Public Git.

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
- [ ] R2 operational restore and GCS cross-cloud disaster-recovery acceptance.
- [ ] Any enabled SMART ERP integration is reconciled against its explicit adapter contract.
- [ ] After the user confirms CY Web is stable for real use, retire the old GAS deployment/Sheet as appropriate.
