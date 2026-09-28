# CY Web Final Data Dictionary — Initial D1 Schema Draft

> Project: Chihyuan Enterprise Management System (CY Web)
>
> Status: **schema-aligned draft for initial D1 freeze review**.
>
> Source order: current explicit user decisions → confirmed Business Decisions → `CANONICAL_DATA_MODEL.md` → validated Legacy/GAS business semantics.
>
> This document defines the initial CY Web relational contract. It does **not** copy the Legacy Google Sheet layout, JSON-cell shapes, GAS refresh limitations, or old readable IDs.

## 1. Physical conventions

### 1.1 IDs

- Normal business/master entities use D1 / SQLite `INTEGER PRIMARY KEY`.
- Internal IDs are technical and immutable.
- ERP/business identifiers such as Customer number and Item number are separate fields and are never relational keys.
- Normal users do not need to see internal database IDs.

### 1.2 Dates and timestamps

- Date-only business fields: `TEXT`, canonical `YYYY-MM-DD`.
- Timestamps: `TEXT`, UTC RFC3339 / ISO-8601; UI converts for display.

### 1.3 Boolean

SQLite `INTEGER` constrained to `0 / 1`.

### 1.4 Decimal storage

Persisted numeric business values avoid binary floating point:

```text
quantity / work days / unit price / cost / score  INTEGER scaled4 (x 10,000)
formal TWD stored totals                           INTEGER money2  (x 100)
```

API/application mappers expose normal decimal values. Exact SMART ERP line/tax/document rounding timing remains deferred to the later ERP integration project.

### 1.5 Mutable-row metadata

Mutable aggregate/master rows normally retain:

```text
created_at
created_by
updated_at
updated_by
revision
```

`revision` starts at 1 and is incremented on successful updates for optimistic concurrency.

Per BD-053, ordinary edits keep only the latest modifier/time. They do not create unlimited field-by-field history.

### 1.6 Delete / relation policy

- Referenced master/reference records use `RESTRICT` and are normally inactivated/retired rather than deleted.
- Pure child rows may use `CASCADE` when their owning aggregate is legally hard-deletable.
- Historical business facts are never cascade-deleted merely because a display/master value changes.
- Visit-linked Customer Contacts are retained once referenced; Visit also keeps its person snapshot.

## 2. Shared Identity / CY Web authorization

CY Web reuses the shared Identity authority. It does not recreate passwords, PINs, OTP, recovery, or a second Admin/Super Admin hierarchy.

### `app_members`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | local immutable key |
| `identity_employee_id` | TEXT | no | UNIQUE shared Identity subject |
| `employee_no` | TEXT | yes | optional company reference |
| `is_active` | INTEGER bool | no | default 1 |
| `created_at` | TEXT utc_ts | no | |
| `updated_at` | TEXT utc_ts | no | |

### `app_tags`

`id`, `code UNIQUE`, `name`, `sort_order`, `is_active`, `updated_at`, `updated_by`.

### `app_tag_modules`

`tag_id`, `module_code`; unique/primary key `(tag_id, module_code)`.

### `app_member_tags`

`member_id`, `tag_id`; unique/primary key `(member_id, tag_id)`.

Shared Identity owns `user / admin / super-admin`; CY Web tags only control app/module entry per BD-037.

## 3. Common lookup/configuration

The following lookup tables use stable IDs/codes and editable display names:

- `departments`
- `customer_categories`
- `customer_statuses`
- `regions`
- `item_categories`

Common mutable lookup columns are generally:

`id`, `code UNIQUE`, `name`, `sort_order`, `is_active`, `updated_at`, `updated_by`.

`regions` is controlled Taiwan county/city reference data and may additionally carry `group_code`.

`item_categories.parent_id` supports an explicit hierarchy.

Referenced lookup rows are normally disabled rather than hard-deleted. Fixed workflow states are not stored as administrator-created lookup rows.

## 4. Item domain

### `items`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | immutable Item identity |
| `item_no` | TEXT | no | UNIQUE current SMART ERP item number |
| `name` | TEXT | no | |
| `spec` | TEXT | yes | |
| `base_unit` | TEXT | no | |
| `item_category_id` | INTEGER FK item_categories | yes | RESTRICT |
| `cost` | INTEGER scaled4 | yes | `>= 0` |
| `cost_tax_mode` | TEXT code | yes | `none / inclusive / exclusive` |
| `store_price` | INTEGER scaled4 | yes | `>= 0` |
| `clinic_price` | INTEGER scaled4 | yes | `>= 0` |
| `notes` | TEXT | yes | |
| `is_active` | INTEGER bool | no | default 1 |
| `created_at`, `created_by` | metadata |  | |
| `updated_at`, `updated_by` | metadata |  | last modification |
| `revision` | INTEGER | no | default 1 |

The initial field set follows validated GAS/Legacy business semantics. Exact future ERP-owned/read-only/synchronized classification is deferred by BD-052.

### `item_number_history`

`id`, `item_id`, `item_no`, `valid_from`, `valid_to`, `change_source`, `is_searchable`, `created_at`.

Old SMART ERP Item numbers remain searchable until explicitly retired per BD-011.

Indexes: `item_no`; `(item_id, valid_from DESC)`.

### `item_unit_conversions`

`id`, `item_id`, `from_unit`, `quantity scaled4 > 0`, `to_unit`, `sort_order`.

Unique `(item_id, from_unit, to_unit)`. Cycles/unresolved conversion paths are rejected by service-layer validation.

## 5. Customer domain

### `customers`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | immutable Customer identity |
| `customer_no` | TEXT | yes | SMART ERP number; UNIQUE when present |
| `short_name` | TEXT | no | Legacy `custshortName` |
| `full_name` | TEXT | yes | Legacy `custfullName` |
| `tax_id` | TEXT | yes | indexed; duplicates allowed with warning |
| `customer_category_id` | INTEGER FK | yes | RESTRICT |
| `region_id` | INTEGER FK regions | yes | RESTRICT |
| `owner_department_id` | INTEGER FK departments | yes | RESTRICT |
| `owner_employee_id` | INTEGER FK app_members | yes | RESTRICT |
| `fax` | TEXT | yes | |
| `customer_status_id` | INTEGER FK | yes | RESTRICT |
| `created_at`, `created_by` | metadata |  | |
| `updated_at`, `updated_by` | metadata |  | last modification only |
| `revision` | INTEGER | no | default 1 |

A Customer/prospect exists immediately with an internal `id`; `customer_no` may remain NULL until SMART ERP qualification. Changing/correcting `customer_no` does not change Customer identity.

Indexes include Customer number partial unique, `tax_id`, `short_name`, owner, status and region query paths.

### `customer_phones`

`id`, `customer_id`, `phone_number`, `extension`, `note`, `sort_order`, `created_at`, `updated_at`.

### `customer_contacts`

`id`, `customer_id`, `name`, `department_name`, `title`, `phone`, `mobile`, `note`, `sort_order`, `is_active`, `created_at`, `updated_at`.

If a Contact has been referenced by a Visit, hard deletion is blocked; use inactive/retirement semantics instead.

### `customer_addresses`

`id`, `customer_id`, `postal_code`, `address`, `note`, `sort_order`, `created_at`, `updated_at`.

Address edits do not silently rewrite `customers.region_id`.

### `customer_notes`

`id`, `customer_id`, `content`, `sort_order`, creation/update actor/timestamps.

This replaces the old fixed JSON `importantNotes[]` cell shape.

### `customer_visits`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `customer_id` | INTEGER FK customers | no | Visit cannot be name-only |
| `visit_date` | TEXT date | no | |
| `contact_id` | INTEGER FK customer_contacts | yes | RESTRICT if referenced |
| `person_snapshot` | TEXT | yes | visit-time person text |
| `employee_id` | INTEGER FK app_members | no | visiting/responsible employee |
| `content` | TEXT | yes | visit detail |
| creation/update metadata + `revision` |  |  | |

Visit always belongs to a real Customer, even if that Customer has no ERP number yet.

### `customer_frequent_items`

`id`, `customer_id`, `item_id` nullable, `custom_item_name` nullable, `custom_category_name` nullable, `sort_order`, timestamps.

Exactly one item source is used:

- formal Item: `item_id` present and custom fields empty; or
- unfiled entry: `item_id NULL`, `custom_item_name` required.

Text matching never silently links a free-text entry to an Item.

## 6. Customer-item quotation history

CY Web Quote is a Customer + Item price-history record, not the formal SMART ERP quotation document.

### `customer_item_quotes`

`id`, `customer_id`, `item_id`, `quote_date`, `employee_id`, `item_no_snapshot`, `item_name_snapshot`, `spec_snapshot`, creation/update actor/timestamps, `revision`.

One row represents one Customer + one Item quotation event. A genuine new commercial quotation creates a new history row. Correction of an existing event is an explicit audited correction.

### `quote_price_breaks`

`id`, `quote_id`, `quantity scaled4 > 0`, `unit`, `unit_price scaled4 >= 0`, `note`, `sort_order`.

Indexes support Customer/date and Item/date history queries.

## 7. Sales Work Order domain

CY Web owns the field/pre-ERP work order and fulfillment workflow. SMART ERP owns the authoritative formal sales order.

### `sales_work_orders`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | internal identity |
| `work_order_ref` | TEXT | no | UNIQUE user-facing/system reference |
| `customer_id` | INTEGER FK customers | yes | nullable only for name-only field entry |
| `customer_no_snapshot` | TEXT | yes | NULL before formal customer number/reconciliation |
| `customer_name_snapshot` | TEXT | no | always required |
| `order_date` | TEXT date | no | |
| `operator_employee_id` | INTEGER FK app_members | no | |
| `note` | TEXT | yes | |
| `status_code` | TEXT | no | fixed lifecycle code |
| `erp_no` | TEXT | yes | SMART ERP sales-order number |
| `hide_price_on_sales_document` | INTEGER bool | no | default 0 |
| `invoice_type_code` | TEXT code | yes | `two_copy / three_copy` |
| `receipt_option_code` | TEXT code | yes | `with_receipt / without_receipt` |
| `voided_at`, `voided_by` | metadata | yes | |
| creation/update actor/timestamps + `revision` |  |  | |

Customer modes:

1. **Lookup mode** — `customer_id` present; name comes from the selected Customer. `customer_no_snapshot` may still be NULL if the Customer is not yet in ERP.
2. **Name-only field mode** — `customer_id NULL`, `customer_no_snapshot NULL`, `customer_name_snapshot` required. Internal staff later reconcile the exact Customer.

No fuzzy/automatic Customer guessing is allowed. ERP fill/correction uses the controlled BD-034 action with audited before/after values.

Workflow codes:

```text
created
issued
waiting_stock
picked
shipped
voided
```

### `sales_work_order_items`

`id`, `sales_work_order_id`, `item_id`, `item_no_snapshot`, `item_name_snapshot`, `spec_snapshot`, `quantity scaled4 > 0`, `unit_snapshot`, `unit_price scaled4 >= 0`, `note`, `sort_order`.

Initial Order lines require a formal Item lookup; no free-text/unfiled Order line is part of the initial schema.

## 8. Defect domain

### `defect_reports`

`id`, `reported_date`, `customer_id`, `customer_no_snapshot`, `customer_name_snapshot`, `item_id`, `item_no_snapshot`, `item_name_snapshot`, `spec_snapshot`, `owner_employee_id`, `defect_description`, `handling`, `status_code`, creation/update actor/timestamps, `revision`.

Workflow:

```text
created -> processing -> resolved
```

Explicit `resolved -> processing` reopen is allowed. Edit/delete boundaries follow BD-033.

## 9. Contractor / pricing domain

### `contractors`

`id`, `entity_type (person / organization)`, `display_name`, `legal_name`, `tax_id`, `phone`, `address`, `note`, `is_active`, creation/update actor/timestamps, `revision`.

### `contractor_contacts`

`id`, `contractor_id`, `name`, `title`, `phone`, `mobile`, `note`, `sort_order`, `is_active`.

### `contractor_pricing`

`id`, `contractor_id`, `item_id`, `pricing_unit`, `unit_price scaled4 >= 0`, `note`, `updated_at`, `updated_by`, `revision`.

Unique `(contractor_id, item_id)` — one current price per Contractor + Item.

## 10. BOM / recipe domain

### `bom_recipes`

`id`, `recipe_ref UNIQUE`, `finished_item_id`, `output_quantity scaled4 > 0`, `output_unit`, `is_active`, creation/update actor/timestamps, `revision`.

Multiple recipe variants may exist for the same finished Item.

### `bom_components`

`id`, `bom_recipe_id`, `component_item_id`, `quantity scaled4 > 0`, `unit`, `sort_order`.

Unique `(bom_recipe_id, component_item_id, unit)` in the initial schema.

## 11. Outsourcing domain

### `outsourcing_orders`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `outsourcing_ref` | TEXT | no | UNIQUE user-facing/system reference |
| `status_code` | TEXT | no | fixed workflow code |
| `operator_employee_id` | INTEGER FK | no | |
| `contractor_id` | INTEGER FK contractors | no | |
| `contractor_name_snapshot` | TEXT | no | historical display |
| `order_date` | TEXT date | no | |
| `outbound_date` | TEXT date | yes | set when outbound confirmed |
| `paid_at`, `paid_by` | metadata | yes | |
| `voided_at`, `voided_by` | metadata | yes | |
| creation/update actor/timestamps + `revision` |  |  | |

Workflow:

```text
pending_outbound -> outbound -> received -> priced -> paid
```

`voided` is terminal for a cancelled confirmed outbound. Merely creating an outsourcing order does not change contractor-held stock.

### `outsourcing_order_parts`

`id`, `outsourcing_order_id`, optional `bom_recipe_id`, optional `finished_item_id`, finished-item number/name/spec snapshots where applicable, `component_item_id`, component number/name/spec snapshots, `quantity scaled4 > 0`, `unit_snapshot`, `note`, `sort_order`.

### `outsourcing_receipts`

`id`, `outsourcing_order_id UNIQUE`, `received_date`, `operator_employee_id`, `created_at`.

Initial workflow supports one completed receipt per order; partial receipts are not in initial scope.

### `outsourcing_receipt_items`

`id`, `receipt_id`, `item_id`, optional `bom_recipe_id`, item number/name/spec snapshots, `quantity scaled4 > 0`, `unit_snapshot`, `note`, `sort_order`.

Selected `bom_recipe_id` records which BOM was actually used for consumption logic.

### `outsourcing_pricings`

`id`, `outsourcing_order_id UNIQUE`, `priced_date`, `operator_employee_id`, `total_amount money2 >= 0`, `created_at`, `revision`.

### `outsourcing_pricing_items`

`id`, `pricing_id`, `item_id`, item number/name/unit snapshots, `quantity scaled4`, `unit_price scaled4`, `subtotal money2`, `note`, `sort_order`.

Exact quantity × price rounding is deferred to the financial helper/ERP verification; storage scales are already fixed.

## 12. Contractor stock ledger

### `contractor_stock_movements`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `contractor_id` | INTEGER FK | no | |
| `item_id` | INTEGER FK | no | component/material Item |
| `related_finished_item_id` | INTEGER FK items | yes | optional Legacy adjustment context |
| `movement_type` | TEXT code | no | fixed movement code |
| `quantity_delta` | INTEGER scaled4 | no | signed, non-zero |
| `occurred_at` | TEXT utc_ts | no | |
| `operator_employee_id` | INTEGER FK | no | |
| `outsourcing_order_id` | INTEGER FK | yes | |
| `outsourcing_receipt_id` | INTEGER FK | yes | |
| `reversal_of_movement_id` | INTEGER self-FK | yes | |
| `reason` | TEXT | yes | |
| `created_at` | TEXT utc_ts | no | |

Movement codes:

```text
outbound_supply
receipt_consumption
manual_adjustment
reversal
```

Current contractor-held stock is derived from movement totals. Legacy `materialStock` is not a second authoritative balance.

## 13. WorkLog / scoring domain

Legacy Desktop remains the behavior reference, but WorkLog JSON is normalized relationally.

### `work_log_categories`

`id`, `code UNIQUE`, `name`, `input_mode (boolean / quantity)`, `unit_label`, `sort_order`, `is_active`, `updated_at`, `updated_by`.

`input_mode` reflects the current Legacy distinction between checkbox-like categories and quantity-count categories.

### `work_log_platforms`

`id`, `code UNIQUE`, `name`, `sort_order`, `is_active`, `updated_at`, `updated_by`.

### `work_log_scoring_rows`

`id`, optional `work_log_category_id`, optional `custom_name`, `score_value scaled4`, `description`, `note`, `sort_order`, `is_active`, `updated_at`, `updated_by`.

Each configured WorkLog category may have one scoring-reference row. Custom scoring/reference rows that are not tied to a category use `custom_name`.

Production names/points/descriptions remain runtime D1 configuration per BD-042.

### `work_log_scoring_config`

Singleton/current configuration:

`id=1`, `target_average_daily_score scaled4`, `minimum_average_daily_score scaled4`, `updated_at`, `updated_by`, `revision`.

### `work_logs`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `work_log_ref` | TEXT | no | UNIQUE system/display reference |
| `log_date` | TEXT date | no | Legacy filling/record date |
| `date_from` | TEXT date | no | work interval start |
| `date_to` | TEXT date | no | `>= date_from` |
| `work_days` | INTEGER scaled4 | no | `> 0`, fractions allowed |
| `type_code` | TEXT | no | current WorkLog type semantic |
| `employee_id` | INTEGER FK app_members | no | owner |
| `status_code` | TEXT | no | fixed workflow |
| `reviewed_by` | INTEGER FK | yes | current effective review only |
| `reviewed_at` | TEXT utc_ts | yes | current effective review only |
| `review_remark` | TEXT | yes | current effective overall review only |
| `final_score` | INTEGER scaled4 | yes | current finalized score |
| `average_daily_score` | INTEGER scaled4 | yes | current finalized score / work days |
| creation/update actor/timestamps + `revision` |  |  | |

Workflow:

```text
created -> pending_review -> reviewed
```

Owner submit/withdraw and Admin review follow the confirmed workflow.

Cancel-review performs:

```text
reviewed -> pending_review
```

and clears the current effective review header values. No historical review-version table is kept. The cancel action itself remains in Audit per BD-051.

### `work_log_entries`

`id`, `work_log_id`, `entry_type_code`, `content`, optional `platform_id`, `review_remark`, `review_score scaled4`, `sort_order`.

`review_remark` and `review_score` are **current review values**, not historical snapshots. Cancel-review clears them.

### `work_log_entry_categories`

`id`, `work_log_entry_id`, `work_log_category_id`, `quantity scaled4 > 0`, `sort_order`.

Unique `(work_log_entry_id, work_log_category_id)`.

## 14. Shared CY Web Audit Core

All CY Web modules use the same Audit Core. This scope does not currently extend to CYAccountingWeb, CYInvoice or other separately developed Apps.

### `audit_events`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `entity_type` | TEXT | no | stable entity/module code |
| `entity_key` | TEXT | no | canonical target key |
| `action` | TEXT | no | stable action code |
| `actor_employee_id` | INTEGER FK app_members | yes | automated/system action may be NULL |
| `occurred_at` | TEXT utc_ts | no | |
| `status_from` | TEXT | yes | meaningful transition only |
| `status_to` | TEXT | yes | meaningful transition only |
| `request_id` | TEXT | yes | optional correlation |
| `before_json` | TEXT JSON | yes | minimal relevant values only |
| `after_json` | TEXT JSON | yes | minimal relevant values only |
| `metadata_json` | TEXT JSON | yes | compact non-relational detail |

`entity_key` is TEXT deliberately: normal integer row IDs are encoded as their decimal string, while operational entities such as a textual backup ID can use the same Audit Core without a second audit table.

Storage rules:

- ordinary CRUD does not emit a new Audit row for every save;
- Customer/general edit screens retain only latest `updated_at / updated_by`;
- meaningful workflow, financial/reference, authorization, review, restore and other important operations create Audit events;
- only necessary before/after fields are stored;
- no full-row snapshots unless a later explicit requirement justifies them;
- no images, PDFs, files, large blobs or secrets;
- normal Timeline and Admin/SA detailed Audit Log use this same event source;
- retention/pruning is supported later, but no arbitrary fixed duration is frozen before real production volume is known.

Indexes:

- `(entity_type, entity_key, occurred_at DESC)`;
- `(occurred_at DESC)`;
- `(actor_employee_id, occurred_at DESC)`.

No action/time index is added initially unless real query usage justifies the write/storage cost.

## 15. Backup operational catalog

Backup content/provider rules are defined by `BACKUP_ARCHITECTURE.md`.

### `backup_sets`

`backup_id TEXT PRIMARY KEY`, `created_at`, `schema_version`, `data_sha256`, `data_byte_length`, `total_record_count`, `status_code`.

### `backup_copies`

`id`, `backup_id`, `provider_code`, `status_code`, `object_prefix`, `verified_at`, `last_error_code`, `updated_at`.

Unique `(backup_id, provider_code)`.

Provider credentials/secrets are never stored here. Backup catalog rows are operational metadata and are excluded from the exported business payload where required to avoid recursive backup growth.

## 16. Initial fixed workflow codes

### Sales Work Order

```text
created
issued
waiting_stock
picked
shipped
voided
```

### Defect

```text
created
processing
resolved
```

### Outsourcing

```text
pending_outbound
outbound
received
priced
paid
voided
```

### WorkLog

```text
created
pending_review
reviewed
```

These are application contracts, not freely administrator-created Settings values.

## 17. Constraint / index baseline

Initial schema includes:

- D1 foreign-key enforcement;
- partial unique Customer number when present;
- unique current Item number;
- unique current Contractor + Item pricing;
- unique human/display reference fields where declared;
- one completed receipt and one pricing record per Outsourcing order in the initial workflow;
- positive quantity/work-day checks;
- boolean checks;
- WorkLog date-range ordering;
- WorkLog reviewed/non-reviewed current-review-field consistency;
- indexes tied to actual Customer/Item lookup, workflow lists, history/timeline and stock-balance paths;
- no speculative index set merely because a column exists.

Cross-row/business rules that SQLite cannot express cleanly remain server-side validation responsibilities.

## 18. Deliberately deferred, non-blocking items

The following do not block the clean initial D1 schema:

1. Exact SMART ERP field ownership/read-only/sync mapping — future ERP integration project.
2. Exact SMART ERP monetary line/tax/document rounding timing — future financial integration verification.
3. Exact display format of generated references such as `work_order_ref`, `outsourcing_ref`, `recipe_ref`, `work_log_ref`.
4. Chihyuan production WorkLog categories/platforms/scoring values — runtime D1 configuration, not Public-source constants.
5. Final Audit retention duration — decide after real event volume/storage cost is measurable.
6. Detailed modern UI/UX, data-refresh behavior and removal/replacement of Legacy GAS refresh-warning flows — discuss/finalize during the dedicated UI/UX implementation phase.

## 19. Legacy fields intentionally not copied as canonical columns

Examples:

- `Users.pin` — shared Identity replaces local PIN auth;
- Customer phones/contacts/addresses/notes JSON — normalized child tables;
- Order `items / flags / history` JSON — normalized columns/children/Audit;
- WorkLog `content / history` JSON — normalized entries/categories/review fields/Audit;
- BOM `parts` JSON — normalized recipe/components;
- Contractor `pricing / materialStock / logs` JSON — normalized pricing/stock ledger/Audit;
- `Outsourcing.isPriced` — workflow/pricing/payment facts are authoritative;
- `StockAdjustLogs.newQty` — balance derives from movement ledger;
- rendered free-text `logText/history[]` — presentation is generated from structured data/Audit;
- Legacy `priceLog` — ordinary Item edits retain latest modifier/time rather than unlimited change strings;
- Legacy technical readable IDs — internal PKs are technical; human references use explicit `*_ref` fields where useful.

## 20. Validation / next gate

Current SQL draft: `migrations/0001_initial.sql`.

Local zero-dependency schema validator: `scripts/validate_schema.py`.

The current reviewed draft has been executed successfully against in-memory SQLite with foreign keys enabled and core contract smoke checks. Before production:

```text
Final Data Dictionary + SQL one-to-one review
        ↓
local/dev D1 migration apply
        ↓
D1 constraint / query smoke validation
        ↓
API validation + error contract
        ↓
Worker / app foundation
```

Any schema change after production launch uses a forward migration. Production D1 is never hand-edited as an undocumented source of truth.
