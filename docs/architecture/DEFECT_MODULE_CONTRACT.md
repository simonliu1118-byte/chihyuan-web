# CY Web Defect Module Contract

> Status: service/lifecycle contract staged before protected HTTP route wiring and integrated Item UI review.

## 1. Scope

Defect Report is a retained business case linked to both a Customer and an Item. It is not stored inside the Item aggregate and it does not inherit the old GAS page-state implementation.

Initial scope:

- bounded server-side Defect search/list;
- Defect detail;
- create;
- ordinary edit while the case is still editable;
- explicit start-processing / resolve / reopen transitions;
- hard delete only before handling starts and only for the creator or an authorized administrator;
- explicit invalidation for a wrongly-created case after handling has started;
- structured Audit for lifecycle transitions, invalidation and deletion.

## 2. Lifecycle

Confirmed workflow remains:

```text
created / 已建檔
    ↓ explicit start handling
processing / 處理中
    ↓ explicit resolve
resolved / 已處理
    ↓ explicit reopen
processing / 處理中
```

Status is never a freely editable dropdown that can jump arbitrarily between values.

## 3. Snapshot boundary

At creation, and when an editable Defect deliberately changes Customer or Item linkage, the record captures current display snapshots required for historical readability:

- Customer number snapshot;
- Customer name snapshot;
- Item number snapshot;
- Item name snapshot;
- Item spec snapshot.

Relationships still use immutable `customer_id` / `item_id`. Later Customer/Item master changes do not silently rewrite an already-resolved historical case.

## 4. Edit boundaries

### `created`

- ordinary edit allowed;
- creator may hard-delete;
- an authorized administrator may also hard-delete;
- deletion is audited.

### `processing`

- ordinary edit allowed because handling detail may continue to change;
- hard delete is not allowed;
- if the entire record is later determined to be invalid/wrongly created, use explicit invalidation instead.

### `resolved`

- ordinary edit is blocked;
- hard delete is blocked;
- the same unresolved case must use explicit `重新開啟` before editing;
- a separate later incident remains a new Defect Report.

### invalidated overlay

Invalidation is **not** a fourth workflow status. `status_code` continues to preserve where the case had reached (`processing` or `resolved`). Forward migration `0002_defect_invalidation.sql` adds:

- `invalidated_at`;
- `invalidated_by`.

This keeps the fixed lifecycle clean while preserving an invalid/wrongly-created retained record as required by BD-033.

Invalidated records:

- remain stored;
- cannot be ordinarily edited or transitioned;
- are excluded from ordinary search by default;
- may be included explicitly for administrative/history review.

A `created` record should normally be corrected or hard-deleted rather than invalidated because it has not yet entered real handling.

## 5. Reference validation

Create/edit requires:

- an existing Customer;
- an existing Item;
- an active responsible employee.

The server resolves these references and creates snapshots. The browser must not submit arbitrary snapshot text as authoritative identity.

## 6. Concurrency

Mutable Defect operations use `expectedRevision`.

A stale revision returns a conflict rather than silently overwriting another user's work. Status transitions, invalidation and deletion are revision-gated server-side.

## 7. Audit rules

Ordinary editable-field changes follow the general BD-053 rule: latest updater/time/revision are sufficient unless a future specific business need requires more.

Meaningful Defect actions use the shared Audit Core:

- `defect.processing.started`;
- `defect.resolved`;
- `defect.reopened`;
- `defect.invalidated`;
- `defect.deleted`.

Status transitions store `status_from` / `status_to`. Optional reason is compact metadata. Mutation + Audit is prepared for the same D1 batch transaction.

## 8. Search/query boundary

Defect search is on-demand Worker/D1 query, not browser preload. Query may filter by:

- keyword;
- Customer;
- Item;
- responsible employee;
- status;
- report-date range;
- invalidated visibility.

Keyword search covers the retained Customer/Item snapshots and defect/handling text.

## 9. Item workspace relationship

The first integrated Item functional preview may show Defect records in the selected Item context, but Defect remains a separate domain resource.

The same Defect service can later support:

- Item-context Defect lists;
- Customer-context links;
- dedicated operational Defect views if real usage proves one is needed.

Do not duplicate Defect business logic for each presentation context.

## 10. Runtime boundary

This service foundation does not expose unauthenticated or production Defect HTTP routes and does not write production D1. Protected route wiring still waits for Shared Identity browser-session support plus local/dev Worker+D1 acceptance.
