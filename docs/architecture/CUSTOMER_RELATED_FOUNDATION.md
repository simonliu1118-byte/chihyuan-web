# CY Web Customer Persistence + Related Records Foundation

> Status: Worker-side persistence/read foundation staged before protected HTTP route wiring.

## 1. Purpose

This stage completes the non-HTTP Customer master persistence boundary and defines the first on-demand read services for Customer-related records.

It does **not** expose unauthenticated Customer routes and does not bind production D1.

## 2. Customer master persistence

Customer create/update now use a dedicated `CustomerPersistence` boundary rather than putting write SQL into UI or route code.

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

The write is assembled as one D1 `batch()` transaction. D1 documents batched statements as transactional: a failed statement aborts/rolls back the sequence.

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

The new related-record repository/service reads them on demand:

### Visits

- bounded by Customer;
- ordered by `visit_date DESC, id DESC`;
- cursor-paginated;
- returns visit-time `person_snapshot` plus optional `contactId`;
- employee display name remains nullable until Shared Identity directory/session integration provides it.

### Frequent Items

- bounded list ordered by `sort_order`;
- supports either formal Item relation or free-text item identity per BD-023;
- free-text entries are never promoted into formal Item master data automatically.

### Customer-Item Quote history

- one history record remains one Customer + one Item per BD-020/021;
- quote list is chronological and cursor-paginated;
- quote detail loads quantity/price breaks only when requested;
- persisted scaled4 integers are mapped to exact decimal strings for API/application consumption;
- older quote records are not overwritten by newer commercial prices;
- correction mutation is deliberately **not** implemented in this stage because BD-022 requires a structured Audit event and correction/new-quote distinction.

## 5. Shared fixed-point mapping

`shared/fixed-point.ts` provides the first shared exact rendering helper for scaled integer business values.

The initial related-record use is Quote price breaks:

- `quantity` scaled4 → exact decimal string;
- `unit_price` scaled4 → exact decimal string.

This avoids introducing ad-hoc per-module floating-point conversion.

## 6. Mutation boundary for related records

This stage intentionally implements related-record **read** services only.

Later mutation services must preserve the already-confirmed rules:

- Visit person snapshot semantics (BD-015);
- Frequent Item formal-vs-free-text identity and explicit later reconciliation (BD-023 / BD-039);
- new commercial quote creates new history (BD-021/022);
- correction of an existing quote is an explicit audited correction, not a routine overwrite (BD-022).

## 7. Runtime gate

Still pending before protected Customer HTTP routes are exposed:

1. Shared Identity browser-session provider support;
2. authenticated Customer module authorization;
3. local/dev D1 migration + Worker runtime acceptance;
4. route-level error mapping and request acceptance tests.

This branch does not modify production D1/Worker/DNS/R2/GCS resources and does not modify CYAccountingWeb or CYInvoice runtime.
