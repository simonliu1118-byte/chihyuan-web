# CY Web Architecture Documents

This directory contains the current architecture/design record for **Chihyuan Enterprise Management System (CY Web)**.

These documents are not a fourth governance layer. Permanent rules remain in the repository root:

1. `REPOSITORY_RULES.md`
2. `REPO_POLICY.md`
3. `PROJECT_RULES.md`

For product/architecture semantics, current explicit user decisions and later confirmed Business Decisions supersede older drafts or audit notes.

## Current implementation checkpoint

As of 2026-09-28, CY Web has moved from isolated static previews to the **real integrated React operational runtime**.

Current working baseline:

- active branch: `cyweb/operational-local-runtime`;
- active PR: `#41` (Open, Draft; do not merge without explicit user authorization);
- application version: `0.1.39`;
- current persistence adapter: versioned browser `localStorage`;
- forward UI: the actual React AppShell and operational module pages;
- standalone `preview/*`: reference/history only;
- latest Runtime Check at the handoff checkpoint: fully green for browser TypeScript, Worker TypeScript, Vite build and source/schema contract validation;
- D1 cutover: not yet active in the operational browser test runtime;
- formal schema freeze: still waits for local/dev D1 migration + Worker/D1 smoke acceptance;
- Shared Identity browser-session provider: still pending before protected multi-user D1 operation.

Detailed continuation state: `../handoffs/CYWEB_OPERATIONAL_RUNTIME_HANDOFF_2026-09-28.md`.

## Current document map

### Core architecture / implementation contracts

- `decisions/README.md` — confirmed Business Decision index and supersession/refinement map.
- `BUSINESS_DECISIONS.md` — consolidated early Business Decisions.
- `decisions/BD-019.md` onward — later detailed Business Decisions.
- `CANONICAL_DATA_MODEL.md` — current logical model.
- `FINAL_DATA_DICTIONARY.md` — current relational/physical Data Dictionary baseline.
- `D1_SCHEMA_REVIEW.md` — schema validation state and remaining freeze gate.
- `API_CONTRACT.md` — Worker/API envelope, errors, cache, validation and concurrency.
- `REQUEST_FOUNDATION.md` — shared browser API client and server request-validation foundation.
- `IDENTITY_ADAPTER.md` — Shared Identity adapter and CY Web app-local authorization split.
- `AUDIT_CORE.md` — shared CY Web AuditService and timeline/detail boundaries.
- `UI_FOUNDATION.md`, `APP_SHELL_FOUNDATION.md`, `FORM_FOUNDATION.md` — shell/form architecture.
- `DATA_VIEW_FOUNDATION.md`, `ENTITY_PICKER_FOUNDATION.md`, `EDITABLE_LIST_FOUNDATION.md` — shared search/lookup/repeated-row mechanics.
- `OVERLAY_FEEDBACK_FOUNDATION.md`, `KEYBOARD_ENTRY_FOUNDATION.md` — shared overlay/feedback and opt-in fast-entry behavior.
- `PRE_BUSINESS_READINESS.md` — common-foundation readiness gate.
- `OPERATIONAL_LOCAL_RUNTIME.md` — **current forward implementation/test mode**.

### Customer

- `CUSTOMER_MODULE_CONTRACT.md`
- `CUSTOMER_UI_COMPOSITION.md`
- `CUSTOMER_EDIT_INTERACTION.md`
- `CUSTOMER_SERVICE_FOUNDATION.md`
- `CUSTOMER_RELATED_FOUNDATION.md`
- `CUSTOMER_RELATED_UI.md`
- `CUSTOMER_FULL_WORKSPACE_PREVIEW.md` — historical/reference review artifact.
- `CUSTOMER_UI_REVIEW_BACKLOG.md`

Current accepted UI baseline:

- Search/filter/results belong in the left Search Pane;
- Detail is an independent right pane;
- major left/right card tops should align;
- result columns should not shift according to label length;
- normal business text uses a readable approximately 14–16px baseline;
- view-header action buttons are compact/single-line;
- long edit forms expose Cancel/Save at both top and bottom;
- related-record detail polish remains a later UI pass.

### Item / Defect

- `ITEM_MODULE_CONTRACT.md` — Item master, exact scaled4 values, conversion graph, historical Item numbers and controlled renumbering.
- `DEFECT_MODULE_CONTRACT.md` — Defect lifecycle/edit/delete/invalidation rules.

The real operational runtime now carries Item and Defect flows. Earlier integrated preview files remain reference artifacts.

### Sales Work Order

- `SALES_WORK_ORDER_MODULE_CONTRACT.md` — field/pre-ERP Work Order, ERP fill/correction and fulfillment lifecycle.
- `SALES_WORK_ORDER_UI_PREVIEW.md` — historical/reference workflow artifact.

Lifecycle baseline:

```text
created
  -> first ERP fill
issued
  -> waiting_stock (optional)
  -> picked
  -> shipped
```

Direct `issued -> picked`, controlled `shipped -> picked`, ERP-reference correction, post-ERP voiding and pre-ERP-only hard delete follow confirmed Business Decisions.

### Contractor / BOM / Outsourcing

- `CONTRACTOR_OUTSOURCING_MODULE_CONTRACT.md` — Contractor, current Contractor Price, multi-BOM, Outsourcing, movement ledger, receiving, pricing/payment and reversal rules.
- `OUTSOURCING_FULL_WORKSPACE_PREVIEW.md` — historical/reference integrated preview.

Critical stock timing rule:

```text
pending_outbound = plan only, no actual stock movement
confirmed outbound = create contractor stock movements
```

Confirmed physical facts are corrected with reversal/replacement movements rather than destructive balance rewriting. Multiple BOM variants may exist for one finished Item; receiving requires explicit BOM selection when more than one active variant applies.

### WorkLog

- `WORK_LOG_MODULE_CONTRACT.md` — ownership, lifecycle, Work Days, configurable entries, review/cancel-review and statistics.
- `WORK_LOG_FULL_WORKSPACE_PREVIEW.md` — historical/reference owner/reviewer/statistics preview.

Public source contains only generic configurable WorkLog structure. Chihyuan production categories, platforms, scoring values and thresholds are deployment D1 data.

Lifecycle:

```text
created -> pending_review -> reviewed
pending_review -> created          owner withdrawal
reviewed -> pending_review         authorized cancel review
```

Work Days is positive and independently entered; reviewer correction is supported. Reviewed scores are finalized/stored and are not recalculated merely because current scoring configuration changes.

### Settings / Admin

- `SETTINGS_ADMIN_MODULE_CONTRACT.md` — server-side authority boundary for structural lookups, App Tags/member assignments and WorkLog operational configuration.

Authority baseline:

- structural lookup/App Tag/member-tag mutation: `SUPER_ADMIN` only;
- WorkLog operational configuration: `ADMIN` or `SUPER_ADMIN`;
- regular `EMPLOYEE`: no configuration mutation authority.

Protected Settings/Admin/Audit HTTP access still waits for Shared Identity browser-session wiring.

### Backup / deployment / domain

- `BACKUP_ARCHITECTURE.md` — tiered R2 + GCS backup topology and provider/service boundary.
- `CLOUDFLARE_PUBLIC_DEPLOYMENT_PRINCIPLES.md` — Public-source / production-infrastructure separation.
- `../DOMAIN_STRATEGY.md` — confirmed `chihyuancm.com` parent-domain namespace.

### Implementation handoffs

- `../handoffs/CYWEB_OPERATIONAL_RUNTIME_HANDOFF_2026-09-28.md` — **current continuation checkpoint**.
- `../handoffs/CYWEB_IDENTITY_PROVIDER_REQUIREMENTS.md` — Shared Identity browser-session requirements for CY Web.
- `../handoffs/CYACCOUNTINGWEB_TIERED_BACKUP_HANDOFF.md` — public-safe handoff only; this workstream does not modify CYAccountingWeb runtime/source.

### Legacy evidence

- `LEGACY_DATA_AUDIT.md`
- `LEGACY_DESKTOP_WORKFLOW_AUDIT.md`
- `LEGACY_REUSABLE_PATTERN_AUDIT.md`

Legacy evidence explains business behavior and useful proven interaction patterns. It is not a production migration contract or a screen blueprint. GAS-specific loading/refresh workarounds and duplicated page/device implementations are not carried forward merely for familiarity.

## Current architecture baseline

- CY Web is one TypeScript + React + Vite + Cloudflare Worker application for Desktop / Tablet / Mobile using RWD + Adaptive UI.
- The **same real React UI** is now used for operational browser testing; it is not a disposable mock.
- Current browser-test persistence is localStorage; D1 remains the authoritative relational target.
- D1 business search/list/detail is designed as bounded on-demand queries, not whole-module browser preload.
- Shared Identity owns credentials, sessions and global `EMPLOYEE / ADMIN / SUPER_ADMIN`; CY Web adds app-local tags/module mapping and never duplicates credentials.
- One shared Audit Core records meaningful business actions; ordinary edits generally keep latest modifier/time/revision only.
- One shared AppShell and common interaction foundations are reused across modules.
- Persisted quantities/prices/scores use exact fixed-point integers in the authoritative D1/Worker model.
- Production custom-domain binding is a later controlled rollout; `chihyuancm.com` remains the shared parent domain.

## Business-module implementation state

```text
Customer
  service + persistence + related records + real operational React UI        active/staged

Item + Defect
  Item service/conversions/renumbering + Defect lifecycle + operational UI   active/staged

Sales Work Order
  pre-ERP + ERP handoff + fulfillment + reversal/void + operational flow     active/staged

Contractor + BOM + Outsourcing
  current price + multi-BOM + stock ledger + receipt/pricing/payment
  + reversals + operational flow                                              active/staged

WorkLog
  owner lifecycle + configurable content + review/cancel-review
  + statistics + operational flow                                             active/staged

Settings / Admin / Audit
  server authority foundation + local operational Settings/Audit surfaces     active/staged

Protected Worker HTTP routes
  blocked on Shared Identity browser session + local/dev D1 runtime gate       pending

D1-backed multi-user runtime
  migrations/service contracts ready; local/dev acceptance + cutover pending  pending
```

## Runtime acceptance

The active operational branch now has automated GitHub Actions coverage for:

- browser TypeScript;
- Worker TypeScript;
- Vite build;
- core/module source contracts;
- SQLite-backed schema/constraint semantics.

At the current handoff checkpoint those checks are green. This supersedes older notes stating that npm/typecheck/build had not been run.

Remaining runtime gate is specifically **Cloudflare local/dev D1 + Worker acceptance**, not general TypeScript/Vite compilation.

Current migration chain:

```text
0001_initial.sql
0002_defect_invalidation.sql
```

Do not declare the initial relational schema formally frozen until those migrations and critical transactional workflows pass against real local/dev D1.

## Operational browser package

`.github/workflows/operational-live.yml` builds:

```text
npm run build:operational
```

and publishes the static browser-test output to branch:

```text
cyweb/operational-test-runtime
```

The package uses the same React operational application and localStorage adapter. It is not a production deployment.

## Backup baseline

```text
D1   live authoritative database after cutover
R2   daily 03:30 Taiwan / 30-day operational retention
GCS  Wed + Sun replication / 26-week cross-cloud DR retention
```

One logical backup is exported from D1 once. Provider copies use the same `backupId`, payload bytes and integrity metadata. Precise production resource identifiers and credentials remain deployment-private.

## Current implementation chain

```text
confirmed Business Decisions
        ↓
Canonical Data Model / Final Data Dictionary / migrations
        ↓
Worker/API/request/validation + Identity adapter + Audit Core
        ↓
shared UI foundations
        ↓
business services and workflow contracts
        ↓
real integrated operational React runtime (current)
        ↓
continuous functional/UI browser testing (current)
        ↓
local/dev D1 + Worker acceptance
        ↓
initial D1 schema freeze
        ↓
Shared Identity browser-session integration
        ↓
replace localStorage adapter with protected Worker API -> D1
        ↓
Desktop/Tablet/Mobile acceptance
        ↓
production custom-domain/runtime rollout
        ↓
production acceptance
```

## Production safety

The current operational branch does **not** modify:

- production D1 data;
- production CY Web Worker binding/deployment;
- production DNS;
- production R2/GCS backup resources;
- SMART ERP;
- CYAccountingWeb source/runtime.

## Document precedence

When architecture documents appear to disagree:

1. current explicit user decision;
2. latest applicable confirmed Business Decision;
3. current specialized architecture/implementation contract;
4. current Canonical Data Model / Data Dictionary as applicable;
5. current workflow/audit summary;
6. archived Legacy evidence.

Do not re-open already confirmed business questions merely because an older draft contains an `OPEN` marker. Check `decisions/README.md` first.
