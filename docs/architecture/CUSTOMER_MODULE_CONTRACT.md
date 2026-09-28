# CY Web Customer Module Contract

> Status: initial business-module contract before protected route wiring and final visual composition.
>
> This document is derived from confirmed Business Decisions, the Final Data Dictionary and the shared UI/API foundations. It intentionally does not bind CY Web to Legacy GAS screen structure.

## 1. Scope

The Customer domain includes:

- Customer master/profile;
- phone rows;
- contacts;
- addresses;
- important notes;
- Visits;
- Frequent Items;
- Customer + Item Quote history.

The **first implementation slice** is Customer search/list + Customer master/profile detail/edit. Visits, Frequent Items and Quote history remain related subfeatures using the same Customer identity and shared related-record/data-view foundations.

## 2. Identity and ERP number

Customer relationship identity is always the immutable internal `customers.id`.

`customer_no`:

- may be NULL before SMART ERP qualification;
- is unique when present;
- is never a foreign key;
- may later be corrected or changed without changing `customers.id`;
- remains conceptually ERP-owned even though exact future synchronization/read-only behavior is deferred to the SMART ERP integration project.

Normal users do not need to see the internal numeric ID.

## 3. Customer profile aggregate

The first profile aggregate contains the Customer master row plus owned profile rows:

```text
Customer
├─ phones[]
├─ contacts[]
├─ addresses[]
└─ notes[]
```

Visits, Frequent Items and Quote history are **related records**, not embedded into every Customer-detail response.

This avoids turning a Customer detail fetch into an unbounded history payload.

### Customer master fields

Initial API/domain names use camelCase while D1 remains snake_case:

| API/domain | D1 | Rule |
| --- | --- | --- |
| `id` | `customers.id` | immutable internal identity |
| `customerNo` | `customer_no` | nullable; unique when present |
| `shortName` | `short_name` | required |
| `fullName` | `full_name` | nullable |
| `taxId` | `tax_id` | nullable; duplicates allowed only after strong warning |
| `customerCategoryId` | `customer_category_id` | nullable lookup FK |
| `regionId` | `region_id` | nullable controlled geographic classification |
| `ownerDepartmentId` | `owner_department_id` | nullable organizational ownership |
| `ownerEmployeeId` | `owner_employee_id` | nullable responsible employee |
| `fax` | `fax` | nullable |
| `customerStatusId` | `customer_status_id` | nullable lookup FK |
| `revision` | `revision` | optimistic concurrency token |
| `createdAt` / `updatedAt` | timestamps | server-owned metadata |

The API also returns small lookup/display projections needed by the UI, such as category/status/region/department/employee names. Those projections are not relationship keys.

## 4. Owned profile rows

### Phones

Each row supports:

- `id` for an existing row;
- `phoneNumber`;
- optional `extension`;
- optional `note`;
- `sortOrder`.

### Contacts

Each row supports:

- `id` for an existing row;
- `name`;
- optional `departmentName`;
- optional `title`;
- optional `phone`;
- optional `mobile`;
- optional `note`;
- `sortOrder`;
- `isActive`.

If a Contact is referenced by a Visit, the service must not hard-delete it. Deactivation/retirement remains available.

### Addresses

Each row supports:

- `id` for an existing row;
- optional `postalCode`;
- `address`;
- optional `note`;
- `sortOrder`.

Editing an address must never silently rewrite an already-selected Customer `regionId`. Address parsing may later offer a suggestion, but the Customer-level region changes only through an explicit Customer edit.

### Notes

Each important-note row supports:

- `id` for an existing row;
- `content`;
- `sortOrder`.

The new system does not preserve the Legacy fixed JSON array as a storage contract.

## 5. Search/list contract

Customer list/search is server-side and bounded.

Initial query dimensions:

- keyword `q`;
- Customer category;
- Customer status;
- geographic region;
- owner department;
- owner employee;
- bounded `limit`;
- opaque `cursor` when pagination is required.

Keyword search may match useful Customer presentation/search fields such as:

- customer number;
- short name;
- full name;
- tax ID.

Phone/contact search may be added when the first real usage proves it is needed; it is not required to make the initial query an expensive unrestricted cross-table search.

The result is a bounded `CustomerSummary[]` plus `nextCursor`. The client must not load the entire Customer table and filter it globally as GAS did.

The initial stable ordering should remain deterministic. Exact relevance tuning may evolve without changing Customer identity or API envelope semantics.

## 6. Detail contract

A Customer detail response returns:

- Customer master fields;
- lookup/display projections;
- phones;
- contacts;
- addresses;
- notes;
- current `revision` and update metadata.

It does **not** automatically include every Visit, Quote or Frequent Item row.

Related records load through bounded related endpoints/data views when their sections are opened or refreshed.

## 7. Create/update contract

### Create

Create requires at minimum:

- `shortName`;
- profile child rows only when supplied.

`customerNo` may be NULL.

The server owns:

- internal `id`;
- timestamps;
- actor metadata;
- starting revision.

### Update

Update requires `expectedRevision` from the record version the client edited.

If the stored revision changed, reject with HTTP `409` and the shared concurrency error contract rather than overwriting the newer record.

Profile child changes advance the owning Customer aggregate's update metadata/revision so the latest-modifier/concurrency semantics remain meaningful.

## 8. Duplicate and validation behavior

### Customer number

A duplicate non-NULL `customerNo` is a hard conflict and must not be silently merged or reassigned.

### Tax ID

Tax ID is **not unique**.

A duplicate valid Tax ID must trigger a strong warning that shows matching Customer records, while still allowing an intentional save.

Initial API direction:

1. the UI may call a bounded Tax-ID match check while editing;
2. if a save still contains a duplicate Tax ID and the user has not explicitly acknowledged it, the server returns a stable `DUPLICATE_TAX_ID_CONFIRM_REQUIRED` domain-validation response with bounded match summaries;
3. the client shows the warning and, after explicit confirmation, resubmits with `confirmDuplicateTaxId: true`;
4. the server then allows the duplicate unless another independent validation rule fails.

This makes the warning enforceable even if a client forgets to perform the pre-check, without turning Tax ID into a unique key.

### Lookup references

Category, status, region, department and employee references must exist and be usable according to their domain/active-state rules when changed.

Referenced lookup/master rows are not identified by display text.

## 9. Delete/retirement boundary

Referenced Customer master data is retained.

Hard deletion is limited to a Customer that has never become a referenced business entity. Owned profile rows alone do not count as independent business history, but Visits, Quote history, Sales Work Orders, Defects or other external business references prevent Customer hard deletion.

The service must perform the dependency check server-side. The UI must not infer deletability only from currently loaded child sections.

`closed_business / 已歇業` is a visible business status but, per BD-035, it does **not** itself block supported CY Web workflows.

## 10. Meaningful Audit boundary

Routine profile edits use normal Customer `updated_at` / `updated_by` / `revision` metadata rather than an Audit event for every field save.

Meaningful Customer-domain actions that should use the shared Audit Core include at minimum:

- Customer hard delete when allowed;
- Customer-number assignment/correction/change;
- explicit correction of a historical Customer + Item Quote event;
- future protected merge/reconciliation action if one is ever introduced.

Audit stores compact deltas only; it is not a second Customer database.

## 11. Visits

Visit always belongs to a real Customer internal ID, even when that Customer has no ERP number.

A Visit may:

- optionally reference a current Customer Contact;
- always retain `personSnapshot` for the actual visit-time person text;
- use an unlisted person without first creating a Contact;
- retain historical person text even if the Contact later changes/deactivates.

Visits are bounded related records under Customer, not free-floating name-only records.

## 12. Frequent Items

A Frequent Item entry uses exactly one source:

1. formal Item — immutable `itemId`; or
2. unfiled free-text item — `itemId = null` and explicit custom name.

Text matching must never silently convert a free-text row into a formal Item relationship. Linking happens only through explicit user selection.

## 13. Customer + Item Quote history

CY Web Quote is Customer + Item price history, not the formal SMART ERP quotation document.

- each new commercial quotation event creates a new history row;
- a formal Item relationship is required;
- quantity/price breaks are child rows;
- historical Item number/name/spec snapshots are stored for the event;
- correction of an existing event is explicit and audited rather than silently creating false commercial history.

## 14. Initial API route plan

Protected route wiring waits for the Shared Identity browser-session provider, but the module boundary is planned as:

```text
GET    /api/customers
GET    /api/customers/:customerId
POST   /api/customers
PATCH  /api/customers/:customerId
DELETE /api/customers/:customerId        # only when server confirms never-used

GET    /api/customers/tax-id-matches

GET/POST/PATCH/... Customer-related Visit endpoints
GET/POST/PATCH/... Customer Frequent Item endpoints
GET/POST/PATCH/... Customer + Item Quote-history endpoints
```

Exact nested route spelling for related records is finalized with the first related slice; identity and authorization semantics do not depend on the URL spelling.

All protected routes pass through:

1. Shared Identity request adapter;
2. CY Web module-access guard;
3. Customer-domain authorization/validation;
4. D1 transaction/query logic;
5. shared response/error contract;
6. shared Audit Core only for meaningful actions.

## 15. UI composition boundary

The first Customer screen must use the already-staged shared foundations:

- `AppShell`;
- `DataViewToolbar` / `DataView` for search/results;
- shared record editor + unsaved guard;
- common field primitives;
- shared overlays/confirmation/Toast;
- adaptive Desktop/Tablet/Mobile presentation;
- related records via shared Section/DataView composition;
- Entity Picker where a real linked-entity field needs it.

The final Customer layout, density, tabs/sections and Mobile presentation are **not frozen by this contract**. Those are reviewed as a new CY Web UI with the user before being treated as final.

## 16. Explicit non-goals of the first slice

The first Customer master implementation does not need to solve:

- SMART ERP live synchronization;
- a universal Customer merge engine;
- fuzzy/automatic duplicate merging;
- unrestricted full-table browser caching;
- all related history in one detail payload;
- final Audit Log Admin screen;
- final production visual design without user review.
