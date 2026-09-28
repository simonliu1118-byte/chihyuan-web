# CY Web Operational Local Runtime

> Status: active implementation mode for the real UI/flow test surface before Shared Identity + D1 cutover.
>
> Current checkpoint: version `0.1.39`, active PR `#41`, operational React runtime. Standalone `preview/*` files are no longer the forward implementation path.

## Purpose

CY Web no longer treats business-module pages as disposable previews. The React application now runs as one integrated operational surface with persistent browser-local data.

The user-confirmed direction is:

```text
build the real operational UI
        ↓
use it directly
        ↓
fix workflow/UI issues in the same React application
        ↓
connect Worker/D1 without rewriting the UI
```

Functional correctness is prioritized first. UI is refined continuously while the operational version is being used.

## Persistence

The current runtime adapter uses browser `localStorage` under a versioned CY Web key.

Unlike the earlier browser-memory previews:

- reload does not reset ordinary changes;
- Customer, Item, Defect, Sales Work Order, Outsourcing and WorkLog data share one local runtime;
- cross-module references use stable numeric IDs;
- important actions append a local Audit entry;
- the complete local dataset can be exported/imported as JSON;
- an explicit reset returns to fictional seed data.

No production or development D1 data is touched in local-storage mode.

The current storage reader deliberately tolerates newly added optional operational projections so UI capability can grow without forcing an immediate reset of a tester's existing local dataset. Before any incompatible local format change, add a real client-side migration or provide an explicit export/reset/import path.

This local adapter is temporary persistence, not a second domain model. The Final Data Dictionary, D1 migrations, Business Decisions and Worker service contracts remain authoritative.

## Operational modules

The integrated AppShell currently exposes the same forward application surface for:

- Customer master, multiple phones/contacts/addresses/important notes;
- Customer controlled ERP-number assignment/correction;
- Customer Visits, Quote History, Frequent Items and important activity;
- Item master, unit conversion and Item-number history/change behavior;
- Defect lifecycle, reopen, created-only hard delete and invalidation overlay;
- Sales Work Order;
- Contractor/BOM/Outsourcing and movement-derived contractor stock;
- WorkLog lifecycle/review/statistics;
- Settings;
- Audit.

Standalone `preview/*` files remain design/history references only and should not receive new business functionality unless a focused comparison artifact is specifically required.

## Customer operational rules

The operational Customer screen uses the approved Search-Pane + Detail-Pane structure.

- search/filter/results stay in the left pane;
- left/right major cards must align cleanly at the top;
- result fields use stable layout columns instead of allowing a longer label to push an adjacent field sideways;
- normal business text uses the accepted readable approximately 14–16px baseline rather than micro-text;
- view-header action buttons use compact single-line height;
- long edit forms provide Cancel/Save controls at both top and bottom;
- delete/deactivate is kept as a secondary lifecycle action rather than making the Edit button unnecessarily tall;
- ordinary editing cannot silently change an existing ERP Customer number;
- ERP number assignment/correction is a separate meaningful action and appends Audit;
- duplicate Tax ID is allowed only after an explicit warning/confirmation;
- never-used Customer may be hard-deleted; referenced Customer is retained and uses active/inactive lifecycle instead;
- Quote correction creates a new correction record rather than silently overwriting the historical quote.

Customer related-record visual detail remains intentionally open for a later concentrated UI pass.

## Defect operational rules

The operational Defect screen follows the fixed three-state workflow:

```text
created -> processing -> resolved
                    ^       |
                    | reopen|
                    +-------+
```

- ordinary edit and hard delete are limited to the confirmed lifecycle boundary;
- invalidation after processing begins retains the row and original workflow status;
- invalidation is not a fourth workflow status;
- ordinary search excludes invalidated rows unless the operator explicitly asks to display them;
- processing/resolution/reopen/invalidation/delete are important Audit actions.

## Other integrated workflow baselines

### Sales Work Order

```text
created
  -> first ERP fill
issued
  -> waiting_stock (optional)
  -> picked
  -> shipped
```

ERP correction, direct `issued -> picked`, controlled shipment reversal, post-ERP voiding and pre-ERP-only hard-delete rules remain server-contract behaviors.

### Outsourcing

```text
pending_outbound = plan only
confirmed outbound = actual contractor stock movement
```

Confirmed physical facts are corrected with reversal/replacement movements rather than destructive balance rewriting. Receiving uses the selected BOM; pricing/payment and their controlled reversals remain explicit lifecycle actions.

### WorkLog

```text
created -> pending_review -> reviewed
pending_review -> created
reviewed -> pending_review
```

Work Days is independently entered and reviewer-correctable. Reviewed score results are stored/finalized and are not recalculated merely because current scoring configuration changes.

## Data-adapter cutover

The next persistence cutover remains:

```text
React operational UI
      ↓
shared runtime/repository boundary
      ↓
Worker protected HTTP API
      ↓
D1
```

The same React UI remains the product surface. D1 cutover is an adapter/runtime change, not a UI rewrite.

The user has explicitly approved connecting D1 before the UI is visually final if doing so helps testing. Therefore visual polish is not a prerequisite for D1 work.

## D1/schema gate

The relational architecture is stable enough for continued product work, but the initial D1 schema is not formally frozen until real D1 acceptance is complete.

Current migration chain:

- `migrations/0001_initial.sql`;
- `migrations/0002_defect_invalidation.sql`.

Automated source/SQLite schema validation is green at the current checkpoint. Remaining freeze work:

1. apply migrations to local/dev D1;
2. run Worker against that D1;
3. exercise fixed-point, optimistic revision, Audit and reversal workflows;
4. confirm D1-specific transaction/constraint behavior;
5. then mark the initial schema frozen.

UI layout changes do not justify redesigning the relational schema by themselves.

## Shared Identity

Local operational mode does not pretend to authenticate a real user. It uses explicit fictional/local actor context only where a workflow needs an actor label.

Before real D1-backed multi-user operation, protected business routes still require:

- Shared Identity browser-session provider wiring;
- server-side role/module authorization;
- authenticated client session/menu state.

CY Web must not create a parallel credential/session store or copy CYInvoice authentication internals as a shortcut.

## Runtime/CI acceptance

At the 2026-09-28 checkpoint, the active `cyweb/operational-local-runtime` head had a fully successful `Runtime Check` run.

The automated gates cover:

- browser TypeScript typecheck;
- Worker TypeScript typecheck;
- Vite build;
- source/schema contract validators for the staged business domains and the operational local runtime.

This materially supersedes earlier notes that npm/typecheck/build had not been executed.

It still does **not** equal local/dev D1 + Worker smoke acceptance; that remains the next infrastructure/runtime gate.

## Browser-test package

The operational bundle has a dedicated static build:

```text
npm run build:operational
```

`.github/workflows/operational-live.yml` builds the same React runtime on pushes to `cyweb/operational-local-runtime`, uploads a 30-day `operational-runtime` artifact, stamps `SOURCE_COMMIT`, and publishes the static result to:

```text
cyweb/operational-test-runtime
```

This is the preferred browser-test package while persistence remains local. It is not a production Worker deployment and does not expose protected D1 routes.

## UI review mode

From this point forward, UI changes should normally be made directly in the operational React application and tested in place:

1. operate the real local runtime;
2. report layout/flow/wording issues;
3. adjust the same React application;
4. keep local persistence compatible where practical;
5. apply local/dev D1 migrations and complete Worker/D1 acceptance;
6. cut persistence from localStorage to protected Worker/D1 without replacing the UI.

## Runtime safety

The current operational branch:

- contains only fictional seed data by default;
- never writes production D1;
- never writes SMART ERP;
- never bypasses Shared Identity on a protected server route;
- does not modify production Worker, DNS, R2 or GCS resources;
- does not modify CYAccountingWeb source/runtime.

For a detailed continuation checkpoint, read `docs/handoffs/CYWEB_OPERATIONAL_RUNTIME_HANDOFF_2026-09-28.md`.
