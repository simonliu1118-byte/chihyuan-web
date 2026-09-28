# CY Web Operational Local Runtime

> Status: current temporary runtime/persistence mode for functional and UI testing before protected Worker API → D1 cutover.
>
> Current implementation progress and next tasks are tracked in root `TODO.md`; this document defines the runtime contract only.

## Purpose

CY Web uses the **real integrated React application** as the forward product surface. Business functionality is no longer developed in disposable standalone module previews and then rewritten later.

The runtime direction is:

```text
real React operational UI
        ↓
shared runtime/repository boundary
        ↓
Worker protected HTTP API
        ↓
D1
```

The UI/workflow surface remains the same across the persistence cutover. D1 integration is an adapter/runtime change, not a second product implementation.

## Local persistence contract

The current adapter uses browser `localStorage` under a versioned CY Web key.

Required behavior:

- reload does not reset ordinary changes;
- Customer, Item, Defect, Sales Work Order, Outsourcing and WorkLog share one local runtime dataset;
- cross-module relationships use stable IDs rather than display text as authority;
- important actions append a local Audit projection;
- the complete local dataset can be exported/imported as JSON;
- explicit reset returns only to fictional seed data;
- newly added optional projections should remain backward-compatible where practical; an incompatible client format change requires a real migration or an explicit export/reset/import path.

No production or development D1 data is touched in local-storage mode.

This adapter is temporary persistence only. Business semantics remain authoritative in confirmed Business Decisions, current module contracts, the Canonical Data Model, Final Data Dictionary and forward migrations.

## Product surface

The integrated AppShell exposes the forward application surface for:

- Customer and related records;
- Item and Defect;
- Sales Work Order;
- Contractor / BOM / Outsourcing;
- WorkLog;
- Settings / Admin;
- Audit.

Standalone `preview/*` files and archived workspace-preview documents are historical/design evidence only. New business functionality belongs in the integrated React runtime unless a focused comparison artifact is explicitly needed.

Module lifecycle/state/business rules are not duplicated here. Use the applicable `*_MODULE_CONTRACT.md` plus the latest applicable Business Decisions.

## Shared UI expectations in operational mode

The runtime consumes the shared AppShell, form, Data View, Entity Picker, editable-list, overlay/feedback and keyboard-entry foundations.

Operational screens should preserve the confirmed cross-cutting usability baseline:

- normal business content remains readable without browser zoom;
- long edit flows keep important Save/Cancel actions reachable where needed;
- search/result/detail layouts remain stable as labels/data lengths change;
- routine success feedback is non-blocking;
- unsaved-change protection uses the shared mechanism;
- client visibility is never treated as authoritative authorization.

Module-specific composition stays in the module contract/UI document rather than being promoted into a second global UI rule set.

## D1 cutover contract

The persistence cutover must preserve the current product surface:

```text
React operational UI
      ↓
shared runtime/repository boundary
      ↓
Worker protected HTTP API
      ↓
D1
```

The initial relational schema gate has been accepted and frozen through the Wrangler local D1 runtime harness. The accepted baseline covers migration apply/reapply, constraints, fixed-point behavior, optimistic revision conflicts, transactional Audit, Customer child persistence, Item chained conversion, Outsourcing reversal/replacement + derived stock, and WorkLog review/cancel-review behavior.

The schema freeze means UI/layout work no longer reopens the relational model by itself. A genuine later data-model change uses a new forward migration and the applicable data-contract/Business Decision review.

The remaining cutover work is integration rather than schema discovery:

1. complete Shared Identity browser-session/provider acceptance;
2. expose protected Worker business routes with server-side authorization;
3. wire the React data adapter to those Worker APIs;
4. exercise authenticated multi-user API → D1 workflows;
5. retain the existing local D1 acceptance gate for regression coverage.

Visual polish may continue in parallel and does not by itself block Identity/API integration.

## Shared Identity boundary

Local operational mode does not pretend to provide production authentication. Any local actor label is fictional/test context only.

Protected multi-user operation requires:

- Shared Identity browser-session provider acceptance;
- authenticated principal/session state;
- server-side role/module authorization on protected Worker routes;
- CY Web-local app-tag/module projection for ordinary employees.

CY Web must not create a parallel password/session authority or copy CYInvoice credential internals as a shortcut. See `IDENTITY_ADAPTER.md`.

## Browser-test package

The same operational application can be built with:

```text
npm run build:operational
```

The resulting package is a testing artifact for the local persistence mode. It is not a production Worker deployment and does not expose protected production D1 routes.

Branch-specific artifact publication details are CI implementation details and should not be treated as a permanent runtime contract.

## Runtime safety boundary

While this local adapter is active:

- default data is fictional seed/test data;
- production D1 is not written;
- SMART ERP is not written;
- Shared Identity is not bypassed on protected server routes;
- production Worker/DNS/R2/GCS resources are not modified by browser-local persistence;
- CYAccountingWeb source/runtime is outside this application boundary.

For what is complete versus pending, read root `TODO.md` rather than adding checkpoint metadata to this contract.
