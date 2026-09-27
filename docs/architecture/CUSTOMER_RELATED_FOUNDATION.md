# CY Web Customer Persistence + Related Records Foundation

> Status: Worker-side Customer persistence/read/mutation foundation staged before protected HTTP route wiring.

## 1. Purpose

This layer keeps Customer-related business behavior behind reusable Worker services rather than placing SQL, validation or Audit logic inside UI pages/routes.

It now covers:

- Customer master persistence;
- Visit read + mutation behavior;
- Frequent Item read + mutation behavior;
- Customer-Item Quote history read + new-quote creation + audited correction behavior.

It does **not** expose unauthenticated Customer routes and does not bind production D1.

## 2. Customer master persistence

Customer create/update use a dedicated `CustomerPersistence` boundary rather than putting write SQL into UI or route code.

Mutation context requires:

- local `app_members.id` actor;
- server-side UTC timestamp.

The later authenticated route layer is responsible for resolving the Shared Identity principal and local app-member projection before calling the service.

### Create

Create writes the Customer master and owned profile rows:

- phones;
- contacts;
- addresses;
- important notes.

The write is assembled as one D1 `batch()` transaction. D1 batched statements are used as the transaction boundary for aggregate persistence.

The first statement inserts the Customer `INTEGER PRIMARY KEY`; owned-child inserts in the same transaction resolve the new Customer as the current maximum Customer ID. The final batch statement returns that ID for the service result.

The partial unique index on non-null `customer_no` remains the final concurrency authority even though service preflight normally detects conflicts earlier.

### Update

Update synchronizes the owned Customer profile and increments `customers.revision` exactly once on successful completion.

All child mutations are gated by the submitted `expectedRevision` and execute before the final master revision increment inside the same D1 batch transaction.

Therefore:

- current revision matches → child sync + master update commit together;
- stale revision → gated child statements are no-ops and the final master update changes zero rows;
- statement failure → the batch rolls back.

`customer_no` is intentionally not changed by ordinary profile update. Assignment/correction/change remains a separate controlled action per BD-048.

## 3. Contact retention

Customer Contacts are special because Visits may reference them.

Per the Data Dictionary and BD-015:

- an omitted Contact that has never been referenced may be deleted from the owned profile;
- an omitted Contact referenced by a Visit is retained and deactivated (`is_active = 0`), not deleted;
- Visit keeps `person_snapshot` regardless of later Contact edits/deactivation.

This prevents an ordinary Customer edit from breaking historical Visit relations.

## 4. Related records remain separate resources

The Customer profile aggregate still does **not** load Visits, Frequent Items or Customer-Item Quote history.

They are queried/mutated as separate Customer-context resources.

### Visits

Read behavior:

- bounded by Customer;
- ordered by `visit_date DESC, id DESC`;
- cursor-paginated;
- returns visit-time `person_snapshot` plus optional `contactId`.

Mutation behavior:

- create requires date + content;
- optional Contact linking is allowed only to an active Contact belonging to the Customer;
- if a newly selected Contact is linked and no explicit person text is supplied, current Contact name becomes the visit-time snapshot;
- editing an existing Visit may retain its already-linked inactive Contact/employee so later master deactivation does not make historical data uneditable;
- update uses `expectedRevision` optimistic concurrency;
- delete uses `expectedRevision` and writes a structured `customer_visit / deleted` Audit event atomically with deletion.

Ordinary Visit edits keep normal last-modified metadata rather than unlimited before/after events. Delete remains an explicit audited historical-data removal, preserving the useful Legacy deletion-audit intent while using the shared Audit Core.

### Frequent Items

Read behavior:

- bounded list ordered by `sort_order`;
- supports either formal Item relation or free-text item identity per BD-023.

Mutation behavior:

- exactly one identity path is accepted: formal `itemId`, or `customItemName`;
- a new/different formal Item must resolve to an active formal Item;
- a free-text row is never auto-linked by name;
- switching from free-text to formal Item requires the caller to submit the explicit formal Item ID per BD-039;
- update/delete use the row's exact `updatedAt` value as a lightweight optimistic-concurrency token because this child table intentionally has no independent `revision` column.

Frequent Item ordinary edits do not create Audit events under BD-053.

### Customer-Item Quote history

Read behavior:

- one history record remains one Customer + one Item per BD-020/021;
- quote list is chronological and cursor-paginated;
- quote detail loads quantity/price breaks only when requested;
- persisted scaled4 integers are mapped to exact decimal strings for API/application consumption.

New commercial quote:

- always creates a new history record;
- snapshots current formal Item number/name/spec;
- requires one or more bounded quantity/unit/unit-price breaks;
- never overwrites the previous commercial quote.

Existing-record correction:

- is a separate `correctQuote` service path, not generic update;
- requires `expectedRevision`;
- may correct historical input data while retaining the same quote identity;
- writes compact structured before/after data through the shared Audit Core with action `customer_item_quote / corrected`;
- the Audit insert, quote update and price-break replacement are assembled into the same D1 batch transaction;
- an optional correction reason can be retained as Audit metadata without making it a required business field before the UI/workflow explicitly requires one.

A newly negotiated price/quantity structure must use **new quote**, not correction, per BD-021/022.

Quote hard-delete is deliberately not introduced here. The current confirmed history-preservation/correction decisions are sufficient to continue without silently reintroducing the broad Legacy delete behavior.

## 5. Shared fixed-point mapping

`shared/fixed-point.ts` now owns both exact formatting and parsing for scaled integer business values.

For Quote price breaks:

- `quantity` decimal string ↔ scaled4 integer;
- `unit_price` decimal string ↔ scaled4 integer.

The parser rejects exponent notation, over-precision and unsafe integer ranges rather than passing business values through binary floating point.

## 6. Shared Audit transactional insertion

`AuditService` now exposes a prepared-record boundary in addition to direct `record()`.

This lets a domain mutation put the same shared Audit event into its D1 `batch()` transaction. A trusted server-side SQL condition may gate the Audit insert on the same optimistic-concurrency predicate as the mutation.

This is used for:

- Visit deletion;
- Quote correction.

It is **not** a client SQL surface. Route/browser data never supplies the condition SQL.

## 7. Runtime gate

Still pending before protected Customer HTTP routes are exposed:

1. Shared Identity browser-session provider support;
2. authenticated Customer module authorization;
3. local/dev D1 migration + Worker runtime acceptance;
4. route-level error mapping and request acceptance tests.

The staged mutation services are therefore callable foundations, not public endpoints.

This branch does not modify production D1/Worker/DNS/R2/GCS resources and does not modify CYAccountingWeb or CYInvoice runtime.
