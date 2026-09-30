# CY Web Operational Runtime

> Status: **mixed transport** during the controlled Worker API → D1 cutover.
>
> Current implementation progress and next tasks are tracked in root `TODO.md`; this document defines the temporary runtime boundary only.

## Purpose

CY Web uses the real integrated React application as the forward product surface. Business functionality is not developed in disposable previews and rewritten later.

Target:

```text
React operational UI
        ↓
same-origin Worker protected HTTP API
        ↓
D1
```

The persistence cutover is performed module by module while preserving the confirmed product workflow.

## Current mixed transport

The runtime is intentionally mixed while migration is in progress.

Current authority:

| Module | Browser transport | Business persistence |
| --- | --- | --- |
| Item | Worker protected HTTP API | development D1 |
| Customer | Worker protected HTTP API | development D1 |
| Defect | Worker protected HTTP API | development D1 |
| Sales Work Order | Worker protected HTTP API | development D1 |
| Outsourcing | temporary local runtime | browser localStorage |
| WorkLog | temporary local runtime | browser localStorage |
| Settings/Audit operational preview | temporary local runtime where still used | browser localStorage |

The Item operational page no longer reads or mutates `local-database.ts`. Its list, detail, create/update, active-state change, controlled Item-number change, Item-number history and canonical category lookup all use Worker/D1.

The Customer operational page also no longer reads or mutates `local-database.ts`. Customer list/detail/create/update, canonical lookups, controlled ERP Customer-number mutation, Visits, Quotes, Frequent Items and the Customer-scoped active-Item picker all use Worker/D1. Customer lifecycle uses canonical `customer_status_id`; the former browser-only Customer `isActive` and hard-delete simulation are not forward authority.

The Defect operational page now also uses Worker/D1 for bounded list/detail, create/update, lifecycle transitions, invalidation and created-only delete. Customer / Item / owner picker data comes from a bounded `DEFECTS`-guarded lookup endpoint rather than the browser-local Customer/Item stores.

The Sales Work Order route now uses Worker/D1 for bounded list/detail, draft create/update, ERP fill/correction and explicit fulfillment actions. Customer / Item / operator choices come from an `ORDERS`-guarded lookup projection; shipment reversal and draft-delete authority remain server-derived.

**localStorage remains temporary** for the modules not yet migrated. A migrated module must not fall back to browser-local business authority when its Worker/API request fails.

## Remaining local-persistence contract

The versioned local dataset continues to support the not-yet-migrated modules.

Required temporary behavior:

- reload does not reset ordinary local changes;
- remaining local modules share one local runtime dataset;
- cross-module local relationships use stable IDs rather than display text as authority;
- local-only actions append the local Audit projection;
- the legacy local dataset can still be exported/imported for development continuity;
- explicit reset returns to fictional seed data only.

The retained `LocalItem` projection may temporarily remain in the local schema because unmigrated Order/Outsourcing fixtures still reference Item IDs. It is **not** Item-module authority and the Item React page must not use it.

## Product surface

The integrated AppShell remains the forward application surface for:

- Customer and related records;
- Item and Defect;
- Sales Work Order;
- Contractor / BOM / Outsourcing;
- WorkLog;
- Settings / Admin;
- Audit.

Standalone `preview/*` files and archived workspace-preview documents are historical/design evidence only.

## Shared UI expectations

Operational screens preserve the confirmed shared usability baseline:

- normal content remains readable without browser zoom;
- long edit flows keep Save/Cancel actions reachable;
- search/result/detail layouts remain stable as labels/data lengths change;
- routine success feedback is non-blocking;
- unsaved-change protection remains available;
- UI visibility is never treated as authorization.

The Item D1 cutover does not authorize visual redesign by itself.

## Worker/D1 cutover contract

All six business modules now have a **Worker protected HTTP API** foundation with current CYID Session + CY Web Module Access enforced before domain-service access.

The accepted D1 foundation covers migrations, constraints, fixed-point behavior, optimistic revision conflicts, transactional Audit, Customer child persistence, Item chained conversion and number history, Outsourcing stock/reversal workflows, and WorkLog review/cancel-review behavior.

The migration order is:

1. complete the protected Worker/domain route for a module;
2. expose only the canonical lookup/reference data its React page needs;
3. replace the page's local-store adapter with same-origin API requests;
4. forbid local business fallback for that migrated page in source contracts;
5. deploy development and exercise authenticated multi-user behavior when browser acceptance is available;
6. remove obsolete local projections only after remaining dependent modules no longer need them.

Item, Customer, Defect and Sales Work Order are through step 4. Outsourcing is the next business-data transport candidate.

## Item transport boundary

Item uses canonical contracts from `shared/item.ts` and `shared/business-lookups.ts`.

Important consequences:

- Item category selection sends canonical `itemCategoryId`, not a seed label;
- fixed-point prices/quantities remain decimal strings across the browser/API boundary;
- `revision` remains the optimistic-concurrency authority;
- controlled Item-number changes use the dedicated server action and preserve searchable number history;
- the page does not read Defect counts merely because localStorage happened to contain them; `ITEMS` access must not leak `DEFECTS` data;
- server errors do not trigger fallback writes to localStorage.

## Customer transport boundary

Customer uses canonical contracts from `shared/customer.ts`, `shared/customer-related.ts` and `shared/business-lookups.ts`.

Important consequences:

- Customer category/status/region selections send canonical IDs rather than local seed labels;
- duplicate Tax ID handling is server-preflighted and requires explicit acknowledgement before an intentional duplicate save;
- normal profile PATCH cannot silently change the ERP Customer number; the controlled number action is revision-gated and audited;
- Customer Quote/Frequent Item Item selection uses a bounded `CUSTOMERS`-guarded projection and does not require separate `ITEMS` Module Access;
- Visit/Quote/Frequent Item concurrency tokens remain server authority;
- Shared Audit is durable history; the UI does not recreate activity history from local browser events;
- server/API failures do not trigger Customer fallback writes to localStorage.

## Defect transport boundary

Defect uses canonical contracts from `shared/defect.ts` and the scoped picker contract in `shared/business-lookups.ts`.

Important consequences:

- Customer, Item and owner references are selected from bounded server projections under current `DEFECTS` Module Access;
- the browser sends canonical IDs and D1 revisions, not snapshot text as authority;
- `created -> processing -> resolved` plus explicit reopen remain dedicated service actions;
- invalidation remains an overlay and created-only hard delete remains server-authorized;
- Shared Audit for lifecycle/invalidation/delete is produced by the server persistence path;
- server/API failures do not trigger Defect fallback writes to localStorage.

## Sales Work Order transport boundary

Sales Work Order uses canonical contracts from `shared/sales-work-order.ts` plus the `ORDERS`-scoped picker contract in `shared/business-lookups.ts`.

Important consequences:

- Customer, Item and operator choices are bounded server projections under current `ORDERS` Module Access; the browser does not read Customer/Item localStorage as Order authority;
- selected Items expose only the units accepted by the domain service; quantity and unit price remain decimal strings;
- ordinary edit stays limited to a pre-ERP `created` draft;
- ERP fill/correction and fulfillment lifecycle use dedicated server actions with current D1 revision;
- exact ERP Customer-number matching remains server authority and SMART ERP remains authoritative for the formal ERP sales-order number;
- shipment reversal and draft-delete capabilities remain server-derived from current Workspace authority;
- Shared Audit for ERP/lifecycle/correction/delete is produced by the server persistence path;
- server/API failures do not trigger Order fallback writes to localStorage.

## Shared Identity / authorization boundary

Protected business operation requires:

- current CYID browser Session;
- server-side Session resolve;
- current CY Web Module Access;
- app-local domain authorization.

The mixed transport period does not change Identity authority. Migrated pages use protected Worker routes; remaining local pages are development-only temporary persistence surfaces.

See the synchronized CYID consumer package under `docs/contracts/cyid/` and the CY Web-specific `IDENTITY_ADAPTER.md`.

## Browser-test package

`npm run build:operational` remains useful as a compilation/testing artifact, but after the first module cutover it is **not** a complete offline/local product runtime: Item, Customer, Defect and Sales Work Order require their same-origin Worker APIs.

A standalone static artifact must not emulate migrated Item, Customer, Defect or Sales Work Order writes in localStorage just to make the screen appear functional.

## Runtime safety boundary

During mixed transport:

- local seed data is fictional development data;
- Item, Customer, Defect and Sales Work Order development writes go only through the configured development Worker/D1;
- production D1 is not cut over by this development migration;
- SMART ERP is not written;
- Shared Identity is not bypassed on protected server routes;
- production Worker/DNS/R2/GCS resources remain untouched until explicit production approval;
- CYAccountingWeb source/runtime remains outside this application boundary.

For completion status, read root `TODO.md`.
