# CY Web Architecture Documents

This directory contains the current architecture/design record for **Chihyuan Enterprise Management System (CY Web)**.

These documents are not a fourth governance layer. Permanent rules remain in the repository root:

1. `REPOSITORY_RULES.md`
2. `REPO_POLICY.md`
3. `PROJECT_RULES.md`

For product/architecture semantics, current explicit user decisions and later confirmed Business Decisions supersede older drafts or audit notes.

## Current document map

### Core architecture / implementation contracts

- `decisions/README.md` — confirmed Business Decision index and supersession/refinement map.
- `BUSINESS_DECISIONS.md` — consolidated BD-001 through BD-018 summary.
- `decisions/BD-019.md` onward — later detailed Business Decisions.
- `CANONICAL_DATA_MODEL.md` — current logical model.
- `FINAL_DATA_DICTIONARY.md` — current relational/physical Data Dictionary baseline.
- `D1_SCHEMA_REVIEW.md` — schema validation state and remaining freeze gate.
- `API_CONTRACT.md` — Worker/API envelope, errors, cache, validation and concurrency.
- `REQUEST_FOUNDATION.md` — shared browser API client and server request-validation foundation.
- `IDENTITY_ADAPTER.md` — Shared Identity adapter and CY Web app-local authorization split.
- `AUDIT_CORE.md` — shared CY Web AuditService and timeline/detail boundaries.
- `UI_FOUNDATION.md`, `APP_SHELL_FOUNDATION.md`, `FORM_FOUNDATION.md` — new-Web shell/form architecture.
- `DATA_VIEW_FOUNDATION.md`, `ENTITY_PICKER_FOUNDATION.md`, `EDITABLE_LIST_FOUNDATION.md` — shared search/lookup/repeated-row mechanics.
- `OVERLAY_FEEDBACK_FOUNDATION.md`, `KEYBOARD_ENTRY_FOUNDATION.md` — shared overlay/feedback and opt-in fast-entry behavior.
- `PRE_BUSINESS_READINESS.md` — common-foundation readiness gate before business modules.

### Customer

- `CUSTOMER_MODULE_CONTRACT.md`
- `CUSTOMER_UI_COMPOSITION.md`
- `CUSTOMER_EDIT_INTERACTION.md`
- `CUSTOMER_SERVICE_FOUNDATION.md`
- `CUSTOMER_RELATED_FOUNDATION.md`
- `CUSTOMER_RELATED_UI.md`
- `CUSTOMER_FULL_WORKSPACE_PREVIEW.md`
- `CUSTOMER_UI_REVIEW_BACKLOG.md`

Customer browser review confirmed the left Search Pane + independent right Detail Pane direction. Search/filter/result controls belong together in the Search Pane. Readability was raised to a normal business-content baseline around 14–16px, and long edit forms keep Cancel/Save controls at both top and bottom.

### Item / Defect

- `ITEM_MODULE_CONTRACT.md` — Item master, exact scaled4 values, conversion graph, historical Item numbers and controlled renumbering.
- `DEFECT_MODULE_CONTRACT.md` — Defect lifecycle/edit/delete/invalidation rules.

The integrated Item preview covers Item master, unit conversions, controlled Item-number change/history and Defect lifecycle.

### Sales Work Order

- `SALES_WORK_ORDER_MODULE_CONTRACT.md` — field/pre-ERP Work Order, ERP fill/correction and fulfillment lifecycle.
- `SALES_WORK_ORDER_UI_PREVIEW.md` — integrated browser-local workflow preview.

The staged lifecycle is:

```text
created
  -> first ERP fill
issued
  -> waiting_stock (optional)
  -> picked
  -> shipped
```

Direct `issued -> picked`, controlled `shipped -> picked`, ERP-reference correction, post-ERP voiding and pre-ERP-only hard delete follow the confirmed Business Decisions.

### Contractor / BOM / Outsourcing

- `CONTRACTOR_OUTSOURCING_MODULE_CONTRACT.md` — Contractor, current Contractor Price, multi-BOM, Outsourcing, movement ledger, receiving, pricing/payment and reversal rules.
- `OUTSOURCING_FULL_WORKSPACE_PREVIEW.md` — browser-local integrated functional review surface.

Key stock rule:

```text
pending_outbound = plan only, no actual stock movement
confirmed outbound = create contractor stock movements
```

Confirmed physical facts are corrected with explicit reversal/replacement movements, not destructive balance rewriting. Multiple BOM variants may exist for the same finished Item; receiving requires explicit BOM selection when more than one active variant applies. Contractor pricing has one current record per Contractor + Item with an explicit valid Item pricing unit.

### WorkLog

- `WORK_LOG_MODULE_CONTRACT.md` — WorkLog ownership, lifecycle, Work Days, configurable entries, review/cancel-review and statistics.
- `WORK_LOG_FULL_WORKSPACE_PREVIEW.md` — browser-local owner/reviewer/statistics review surface.

Public source contains only generic configurable WorkLog structure. Chihyuan production categories, platforms, scoring values and thresholds are deployment D1 data, not source-code constants.

The lifecycle is:

```text
created -> pending_review -> reviewed
pending_review -> created          owner withdrawal
reviewed -> pending_review         authorized cancel review
```

Work Days is required, positive and independently entered. Reviewer correction of Work Days is supported. Active reviewed scores are frozen against later configuration changes. Cancel review clears the current review/scoring result and records Shared Audit without retaining a second cancelled-review version payload.

### Backup / deployment / domain

- `BACKUP_ARCHITECTURE.md` — tiered R2 + GCS backup topology and provider/service boundary.
- `CLOUDFLARE_PUBLIC_DEPLOYMENT_PRINCIPLES.md` — Public-source / production-infrastructure separation.
- `../DOMAIN_STRATEGY.md` — confirmed `chihyuancm.com` parent-domain namespace for the future official website and CY-family Web systems.

### Implementation handoffs

- `../handoffs/CYACCOUNTINGWEB_TIERED_BACKUP_HANDOFF.md` — public-safe handoff only; this workstream does not modify CYAccountingWeb runtime/source.
- `../handoffs/CYWEB_IDENTITY_PROVIDER_REQUIREMENTS.md` — Shared Identity browser-session requirements for CY Web.

### Legacy evidence

- `LEGACY_DATA_AUDIT.md`
- `LEGACY_DESKTOP_WORKFLOW_AUDIT.md`
- `LEGACY_REUSABLE_PATTERN_AUDIT.md`

Legacy evidence explains business behavior and useful proven interaction patterns. It is not a production migration contract or a screen blueprint. GAS-specific loading/refresh workarounds and duplicated page/device implementations are not carried forward merely for familiarity.

## Current architecture baseline

- CY Web is one TypeScript + React + Vite + Cloudflare Worker application for Desktop / Tablet / Mobile using RWD + Adaptive UI.
- D1 is the live relational direction. Business search/list/detail queries are bounded and on-demand rather than loading whole module datasets into a browser-global cache.
- Shared Identity owns credentials, sessions and the global EMPLOYEE/ADMIN/SUPER_ADMIN hierarchy. CY Web uses an adapter plus app-local tags/module mapping and never duplicates the credential store.
- One shared Audit Core records meaningful business actions. Ordinary edits generally retain only latest modifier/time/revision.
- One shared App Shell and common UI/interaction foundations are reused across modules. New business screens do not recreate the old GAS page/tab/form implementation.
- Normal business text uses the browser-reviewed readability baseline rather than micro-text. Long forms provide reachable save/cancel controls at both top and bottom.
- Persisted business quantities/prices/scores use exact fixed-point integers. Item unit conversions follow `1 fromUnit = quantity toUnit` and resolve through the canonical conversion graph.
- Production custom-domain binding is a controlled rollout step. `chihyuancm.com` is the shared parent domain, while the official site and internal systems keep separate hostnames/origins/security boundaries.
- Production D1/Worker/Identity-protected business routes remain gated on Shared Identity browser-session wiring plus local/dev D1 and Worker acceptance.

## Business-module implementation state

```text
Customer
  contract / service / persistence / related records / integrated preview   staged

Item + Defect
  Item service / conversions / renumbering / Defect lifecycle / preview     staged

Sales Work Order
  pre-ERP + ERP handoff + fulfillment + reversal/void / preview              staged

Contractor + BOM + Outsourcing
  Contractor/current price + multi-BOM + stock ledger + receipt/pricing
  + payment/reversals + integrated preview                                   staged

WorkLog
  owner lifecycle + configurable content + review/cancel-review
  + statistics + integrated preview                                          staged

Settings / Admin
  configuration mutation UI/service + Audit UI + backup/restore product UI   next

Protected HTTP routes
  blocked on Shared Identity browser session + local/dev runtime gate         pending
```

## Backup baseline

```text
D1   live authoritative database
R2   daily 03:30 Taiwan / 30-day operational retention
GCS  Wed + Sun replication / 26-week cross-cloud DR retention
```

One logical backup is exported from D1 once. Provider copies use the same `backupId`, payload bytes and integrity metadata. Precise production resource identifiers and credentials remain deployment-private.

## Current implementation chain

```text
confirmed Business Decisions
        ↓
Canonical Data Model / Final Data Dictionary / D1 migrations
        ↓
Worker + API / request / validation foundation
        ↓
Shared Identity adapter + app-local authorization
        ↓
Shared Audit Core
        ↓
Legacy reusable-pattern audit
        ↓
new-Web common UI foundations
        ↓
Customer
        ↓
Item + Defect
        ↓
Sales Work Order
        ↓
Contractor + BOM + Outsourcing + movement ledger
        ↓
WorkLog + review/statistics
        ↓
Settings / Admin
        ↓
Shared Identity browser-session wiring + local/dev D1/Worker acceptance
        ↓
protected business HTTP routes
        ↓
full-system browser/device acceptance
        ↓
production custom-domain rollout
        ↓
production acceptance
```

## Runtime status

The current branches stage source/contracts/services and browser-memory functional previews. They do **not** prove npm/typecheck/build/Wrangler/D1 runtime acceptance in the current tool environment. Full execution remains required in a normal networked checkout/runtime environment.

Production D1, production Worker bindings, DNS and backup resources have not been modified by the business-module preview branches.

## Document precedence

When architecture documents appear to disagree:

1. current explicit user decision;
2. latest applicable confirmed Business Decision;
3. current specialized architecture/implementation contract;
4. current Canonical Data Model / Data Dictionary as applicable;
5. current workflow/audit summary;
6. archived Legacy evidence.

Do not re-open already confirmed business questions merely because an older draft contains an `OPEN` marker. Check `decisions/README.md` first.
