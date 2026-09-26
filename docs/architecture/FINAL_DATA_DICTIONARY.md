# CY Web Final Data Dictionary — Initial D1 Schema Draft

> Project: Chihyuan Enterprise Management System (CY Web)
>
> Status: **initial complete draft, cross-checked against current Legacy/GAS headers plus key Desktop Order/WorkLog behavior; ready for SQL-draft verification**.
>
> Source order: current explicit user decisions → confirmed Business Decisions → `CANONICAL_DATA_MODEL.md` → validated Legacy/GAS business semantics.
>
> This document defines the initial CY Web relational contract. It does **not** copy the Legacy Google Sheet layout, JSON cell shapes, or GAS implementation constraints.

## 1. Physical conventions

### 1.1 IDs

- Internal entity IDs use D1 / SQLite `INTEGER PRIMARY KEY` unless a later concrete requirement justifies another type.
- Internal IDs are technical and immutable.
- User-visible ERP/business numbers remain separate text fields.
- Normal users should not need to see internal database IDs.

### 1.2 Dates and timestamps

- Date-only business fields: `TEXT`, canonical format `YYYY-MM-DD`.
- Timestamps: `TEXT`, UTC RFC3339/ISO-8601 form; UI converts to local display time.

### 1.3 Boolean

- SQLite `INTEGER NOT NULL` with `CHECK (value IN (0,1))`.

### 1.4 Decimal storage

To avoid binary floating-point drift in D1:

- quantities, work days, unit prices, costs and score values use scaled integer storage with **4 decimal places**;
- formal TWD document totals use scaled integer storage with **2 decimal places** where a stored total is required;
- application/API mappers expose decimal values rather than raw scaled integers.

The exact SMART ERP line/tax/document rounding timing remains deferred. Schema storage does not require that future ERP investigation to proceed.

### 1.5 Mutable-row metadata

Mutable aggregate/master rows normally carry:

```text
created_at
created_by
updated_at
updated_by
revision
```

`revision` is an integer optimistic-concurrency token incremented on successful updates.

Per BD-053, ordinary edits retain only the **latest** update actor/time; they do not create field-by-field historical versions.

When an owned child row is changed through its aggregate — for example Customer phone/address/contact, Item unit conversion, Work Order line, BOM component, or WorkLog entry — the owning aggregate's `updated_at`, `updated_by`, and `revision` are also advanced. This keeps the visible “last modified by / time” meaningful without storing unlimited ordinary-edit history.

### 1.6 Delete behavior

- Referenced master/lookup/business rows use `RESTRICT` semantics and are retired/inactivated where appropriate.
- Pure child rows use `CASCADE` with their owning aggregate where hard deletion of that aggregate is legally allowed.
- `SET NULL` is used only where the business record intentionally preserves its own snapshot after an optional relation disappears.

## 2. Shared Identity / app authorization

CY Web reuses shared Identity. These tables contain CY Web-local membership/tag metadata only.

### `app_members`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | immutable local key |
| `identity_employee_id` | TEXT | no | UNIQUE; shared Identity subject |
| `display_name` | TEXT | no | local display cache from shared Identity; not credential authority |
| `employee_no` | TEXT | yes | optional company reference |
| `department_id` | INTEGER FK departments | yes | CY Web-local department classification |
| `is_active` | INTEGER bool | no | default 1 |
| `created_at` | TEXT utc_ts | no | |
| `updated_at` | TEXT utc_ts | no | |

Do not recreate password/PIN/credential storage in CY Web.

### `app_tags`

SA-managed CY Web module-access tags.

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `code` | TEXT | no | UNIQUE, stable |
| `name` | TEXT | no | editable display label |
| `sort_order` | INTEGER | no | default 0 |
| `is_active` | INTEGER bool | no | default 1 |
| `updated_at` | TEXT utc_ts | no | |
| `updated_by` | INTEGER FK app_members | yes | RESTRICT |

### `app_tag_modules`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `tag_id` | INTEGER FK app_tags | no | CASCADE |
| `module_code` | TEXT | no | fixed application module code |

Primary/unique key: `(tag_id, module_code)`.

### `app_member_tags`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `member_id` | INTEGER FK app_members | no | CASCADE |
| `tag_id` | INTEGER FK app_tags | no | RESTRICT |

Primary/unique key: `(member_id, tag_id)`.

## 3. Common lookup/configuration tables

All lookup display labels may change without changing their stable ID/code.

### `departments`

`id`, `code UNIQUE`, `name`, `sort_order`, `is_active`, `updated_at`, `updated_by`.

### `customer_categories`

`id`, `code UNIQUE`, `name`, `sort_order`, `is_active`, `updated_at`, `updated_by`.

### `customer_statuses`

`id`, `code UNIQUE`, `name`, `sort_order`, `is_active`, `updated_at`, `updated_by`.

A protected semantic code may represent `closed_business / 已歇業`; its display label can remain configurable while the semantic code stays stable.

### `regions`

Controlled Taiwan county/city references.

`id`, `code UNIQUE`, `name`, optional `group_code`, `sort_order`, `is_active`.

### `item_categories`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `code` | TEXT | no | UNIQUE |
| `name` | TEXT | no | |
| `parent_id` | INTEGER FK item_categories | yes | RESTRICT |
| `sort_order` | INTEGER | no | default 0 |
| `is_active` | INTEGER bool | no | default 1 |
| `updated_at` | TEXT utc_ts | no | |
| `updated_by` | INTEGER FK app_members | yes | RESTRICT |

## 4. Customer domain

### `customers`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | immutable Customer identity |
| `customer_no` | TEXT | yes | SMART ERP number; partial UNIQUE when present |
| `short_name` | TEXT | no | Legacy `custshortName` |
| `full_name` | TEXT | yes | Legacy `custfullName` |
| `tax_id` | TEXT | yes | indexed, duplicates allowed with warning |
| `customer_category_id` | INTEGER FK customer_categories | yes | RESTRICT |
| `region_id` | INTEGER FK regions | yes | RESTRICT |
| `owner_department_id` | INTEGER FK departments | yes | RESTRICT |
| `owner_employee_id` | INTEGER FK app_members | yes | RESTRICT |
| `fax` | TEXT | yes | |
| `customer_status_id` | INTEGER FK customer_statuses | yes | RESTRICT |
| `created_at` | TEXT utc_ts | no | |
| `created_by` | INTEGER FK app_members | yes | RESTRICT |
| `updated_at` | TEXT utc_ts | no | last modification only |
| `updated_by` | INTEGER FK app_members | yes | last modifier only |
| `revision` | INTEGER | no | default 1 |

Indexes:

- partial unique index on `customer_no` where not null/blank;
- index on `tax_id`;
- indexes on `short_name`, `owner_employee_id`, `customer_status_id`, `region_id` as query use requires.

A Customer may exist with `customer_no IS NULL` before SMART ERP qualification.

### `customer_phones`

`id`, `customer_id FK NOT NULL CASCADE`, `phone_number NOT NULL`, `extension`, `note`, `sort_order`, `created_at`, `updated_at`.

### `customer_contacts`

`id`, `customer_id FK NOT NULL CASCADE`, `name NOT NULL`, `department_name`, `title`, `phone`, `mobile`, `note`, `sort_order`, `is_active`, `created_at`, `updated_at`.

### `customer_addresses`

`id`, `customer_id FK NOT NULL CASCADE`, `postal_code`, `address NOT NULL`, `note`, `sort_order`, `created_at`, `updated_at`.

Address changes do not silently overwrite `customers.region_id`.

### `customer_notes`

`id`, `customer_id FK NOT NULL CASCADE`, `content NOT NULL`, `sort_order`, `created_at`, `created_by`, `updated_at`, `updated_by`.

This replaces the Legacy fixed JSON `importantNotes[]` shape.

### `customer_visits`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `customer_id` | INTEGER FK customers | no | RESTRICT; Visit cannot be name-only |
| `visit_date` | TEXT date | no | |
| `contact_id` | INTEGER FK customer_contacts | yes | `SET NULL` allowed |
| `person_snapshot` | TEXT | yes | visit-time person text |
| `employee_id` | INTEGER FK app_members | no | visiting/responsible employee |
| `content` | TEXT | yes | visit detail |
| `created_at` | TEXT utc_ts | no | |
| `created_by` | INTEGER FK app_members | yes | |
| `updated_at` | TEXT utc_ts | no | last modification only |
| `updated_by` | INTEGER FK app_members | yes | last modifier only |
| `revision` | INTEGER | no | default 1 |

Index: `(customer_id, visit_date DESC)`.

### `customer_frequent_items`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `customer_id` | INTEGER FK customers | no | CASCADE |
| `item_id` | INTEGER FK items | yes | RESTRICT |
| `custom_item_name` | TEXT | yes | required when `item_id` is null |
| `custom_category_name` | TEXT | yes | optional free-text category for unfiled entry |
| `sort_order` | INTEGER | no | default 0 |
| `created_at` | TEXT utc_ts | no | |
| `updated_at` | TEXT utc_ts | no | |

Validation: exactly one meaningful item source must exist — formal `item_id` or free-text `custom_item_name`. Text matching never auto-links an Item.

## 5. Customer-item quotation history

CY Web Quote is a Customer + Item price-history record, not the formal SMART ERP quotation document.

### `customer_item_quotes`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `customer_id` | INTEGER FK customers | no | RESTRICT |
| `item_id` | INTEGER FK items | no | RESTRICT |
| `quote_date` | TEXT date | no | |
| `employee_id` | INTEGER FK app_members | no | RESTRICT |
| `item_no_snapshot` | TEXT | no | historical display |
| `item_name_snapshot` | TEXT | no | historical display |
| `spec_snapshot` | TEXT | yes | historical display |
| `created_at` | TEXT utc_ts | no | |
| `created_by` | INTEGER FK app_members | yes | |
| `updated_at` | TEXT utc_ts | no | explicit correction only |
| `updated_by` | INTEGER FK app_members | yes | |
| `revision` | INTEGER | no | default 1 |

Indexes: `(customer_id, quote_date DESC)`, `(item_id, quote_date DESC)`.

### `quote_price_breaks`

`id`, `quote_id FK NOT NULL CASCADE`, `quantity` scaled4 `NOT NULL`, `unit TEXT NOT NULL`, `unit_price` scaled4 `NOT NULL`, `note`, `sort_order`.

## 6. Item domain

### `items`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | immutable Item identity |
| `item_no` | TEXT | no | UNIQUE current SMART ERP number |
| `name` | TEXT | no | |
| `spec` | TEXT | yes | |
| `base_unit` | TEXT | no | |
| `item_category_id` | INTEGER FK item_categories | yes | RESTRICT |
| `cost` | INTEGER scaled4 | yes | |
| `cost_tax_mode` | TEXT code | yes | stable code, e.g. none/inclusive/exclusive |
| `store_price` | INTEGER scaled4 | yes | |
| `clinic_price` | INTEGER scaled4 | yes | |
| `notes` | TEXT | yes | |
| `is_active` | INTEGER bool | no | default 1 |
| `created_at` | TEXT utc_ts | no | |
| `created_by` | INTEGER FK app_members | yes | |
| `updated_at` | TEXT utc_ts | no | |
| `updated_by` | INTEGER FK app_members | yes | |
| `revision` | INTEGER | no | default 1 |

Exact future ERP-owned/read-only classification is deferred by BD-052.

### `item_number_history`

`id`, `item_id FK NOT NULL RESTRICT`, `item_no NOT NULL`, `valid_from TEXT date/utc_ts NOT NULL`, `valid_to` nullable, `change_source TEXT`, `is_searchable INTEGER bool default 1`, `created_at`.

Indexes: `item_no`, `(item_id, valid_from DESC)`.

Application validation prevents accidental reassignment of a historical Item number to another Item unless a later explicit operation permits it.

### `item_unit_conversions`

`id`, `item_id FK NOT NULL CASCADE`, `from_unit TEXT NOT NULL`, `quantity INTEGER scaled4 NOT NULL`, `to_unit TEXT NOT NULL`, `sort_order`.

Reject zero/negative quantities, duplicate edges, cycles and unresolved conversion paths.

## 7. Sales Work Order domain

CY Web work orders exist before the authoritative SMART ERP sales order and continue through fulfillment/shipment.

### `sales_work_orders`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | internal identity |
| `work_order_ref` | TEXT | no | UNIQUE, system-generated human reference; exact display format is implementation detail |
| `customer_id` | INTEGER FK customers | yes | nullable only for confirmed name-only field entry |
| `customer_no_snapshot` | TEXT | yes | nullable when no ERP customer number exists |
| `customer_name_snapshot` | TEXT | no | always required |
| `order_date` | TEXT date | no | |
| `operator_employee_id` | INTEGER FK app_members | no | RESTRICT |
| `note` | TEXT | yes | |
| `status_code` | TEXT | no | fixed workflow code |
| `erp_no` | TEXT | yes | external SMART ERP order number |
| `hide_price_on_sales_document` | INTEGER bool | no | default 0 |
| `invoice_type_code` | TEXT | yes | `two_copy` / `three_copy`; null when not selected |
| `receipt_option_code` | TEXT | yes | `with_receipt` / `without_receipt`; null when not selected |
| `voided_at` | TEXT utc_ts | yes | |
| `voided_by` | INTEGER FK app_members | yes | RESTRICT |
| `created_at` | TEXT utc_ts | no | |
| `created_by` | INTEGER FK app_members | yes | |
| `updated_at` | TEXT utc_ts | no | |
| `updated_by` | INTEGER FK app_members | yes | |
| `revision` | INTEGER | no | default 1 |

Workflow codes:

```text
created
issued
waiting_stock
picked
shipped
voided
```

Customer validation:

- lookup mode: `customer_id` present; customer name comes from the selected Customer and snapshot is stored;
- field-name-only mode: `customer_id IS NULL`, `customer_no_snapshot IS NULL`, `customer_name_snapshot` required;
- no fuzzy/automatic Customer linking;
- once an exact Customer is linked, do not persist a conflicting free-typed customer name.

Indexes: `work_order_ref UNIQUE`, partial unique `erp_no` when present if SMART ERP uniqueness is confirmed during implementation, `(status_code, order_date DESC)`, `customer_id`.

### `sales_work_order_items`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `sales_work_order_id` | INTEGER FK sales_work_orders | no | CASCADE only while aggregate is legally hard-deletable |
| `item_id` | INTEGER FK items | no | Legacy/current flow selects a formal Item |
| `item_no_snapshot` | TEXT | no | |
| `item_name_snapshot` | TEXT | no | |
| `spec_snapshot` | TEXT | yes | |
| `quantity` | INTEGER scaled4 | no | `> 0` |
| `unit_snapshot` | TEXT | no | |
| `unit_price` | INTEGER scaled4 | no | `>= 0` |
| `note` | TEXT | yes | |
| `sort_order` | INTEGER | no | default 0 |

No unfiled/free-text Order line is part of the initial schema because the validated Legacy flow requires an Item lookup.

## 8. Defect domain

### `defect_reports`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `reported_date` | TEXT date | no | |
| `customer_id` | INTEGER FK customers | no | RESTRICT |
| `customer_no_snapshot` | TEXT | yes | |
| `customer_name_snapshot` | TEXT | no | |
| `item_id` | INTEGER FK items | no | RESTRICT |
| `item_no_snapshot` | TEXT | no | |
| `item_name_snapshot` | TEXT | no | |
| `spec_snapshot` | TEXT | yes | |
| `owner_employee_id` | INTEGER FK app_members | no | RESTRICT |
| `defect_description` | TEXT | no | |
| `handling` | TEXT | yes | |
| `status_code` | TEXT | no | fixed workflow code |
| `created_at` | TEXT utc_ts | no | |
| `created_by` | INTEGER FK app_members | yes | |
| `updated_at` | TEXT utc_ts | no | |
| `updated_by` | INTEGER FK app_members | yes | |
| `revision` | INTEGER | no | default 1 |

Workflow: `created -> processing -> resolved`; explicit `resolved -> processing` reopen is allowed.

Indexes: `(status_code, reported_date DESC)`, `customer_id`, `item_id`.

## 9. Contractor / pricing domain

### `contractors`

`id`, `entity_type TEXT NOT NULL`, `display_name TEXT NOT NULL`, `legal_name`, `tax_id`, `phone`, `address`, `note`, `is_active`, creation/update metadata, `revision`.

`entity_type` is fixed to supported semantic values such as `person` / `organization`.

### `contractor_contacts`

`id`, `contractor_id FK NOT NULL CASCADE`, `name NOT NULL`, `title`, `phone`, `mobile`, `note`, `sort_order`, `is_active`.

### `contractor_pricing`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `contractor_id` | INTEGER FK contractors | no | RESTRICT |
| `item_id` | INTEGER FK items | no | RESTRICT |
| `pricing_unit` | TEXT | no | |
| `unit_price` | INTEGER scaled4 | no | `>= 0` |
| `note` | TEXT | yes | |
| `updated_at` | TEXT utc_ts | no | |
| `updated_by` | INTEGER FK app_members | yes | |
| `revision` | INTEGER | no | default 1 |

UNIQUE `(contractor_id, item_id)` for one current price per Contractor + Item.

## 10. BOM / recipe domain

### `bom_recipes`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `recipe_ref` | TEXT | no | UNIQUE, system-generated/display reference |
| `finished_item_id` | INTEGER FK items | no | RESTRICT |
| `output_quantity` | INTEGER scaled4 | no | `> 0` |
| `output_unit` | TEXT | no | |
| `is_active` | INTEGER bool | no | default 1 |
| `created_at` | TEXT utc_ts | no | |
| `created_by` | INTEGER FK app_members | yes | |
| `updated_at` | TEXT utc_ts | no | |
| `updated_by` | INTEGER FK app_members | yes | |
| `revision` | INTEGER | no | default 1 |

Multiple active/inactive recipe variants may exist for the same finished Item.

### `bom_components`

`id`, `bom_recipe_id FK NOT NULL CASCADE`, `component_item_id FK items NOT NULL RESTRICT`, `quantity INTEGER scaled4 NOT NULL > 0`, `unit TEXT NOT NULL`, `sort_order`.

UNIQUE may be applied to `(bom_recipe_id, component_item_id, unit)` unless a concrete workflow needs duplicate display rows.

## 11. Outsourcing domain

### `outsourcing_orders`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `outsourcing_ref` | TEXT | no | UNIQUE human reference |
| `status_code` | TEXT | no | fixed workflow code |
| `operator_employee_id` | INTEGER FK app_members | no | RESTRICT |
| `contractor_id` | INTEGER FK contractors | no | RESTRICT |
| `contractor_name_snapshot` | TEXT | no | historical display; draft may refresh until outbound is confirmed |
| `order_date` | TEXT date | no | |
| `outbound_date` | TEXT date | yes | set when outbound confirmed |
| `paid_at` | TEXT utc_ts | yes | current paid fact |
| `paid_by` | INTEGER FK app_members | yes | RESTRICT |
| `voided_at` | TEXT utc_ts | yes | |
| `voided_by` | INTEGER FK app_members | yes | RESTRICT |
| `created_at` | TEXT utc_ts | no | |
| `created_by` | INTEGER FK app_members | yes | |
| `updated_at` | TEXT utc_ts | no | |
| `updated_by` | INTEGER FK app_members | yes | |
| `revision` | INTEGER | no | default 1 |

Workflow:

```text
pending_outbound -> outbound -> received -> priced -> paid
```

`voided` is terminal for a cancelled confirmed outbound.

### `outsourcing_order_parts`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `outsourcing_order_id` | INTEGER FK outsourcing_orders | no | CASCADE only while order is legally hard-deletable |
| `bom_recipe_id` | INTEGER FK bom_recipes | yes | RESTRICT |
| `finished_item_id` | INTEGER FK items | yes | RESTRICT |
| `finished_item_no_snapshot` | TEXT | yes | historical display when finished Item is present |
| `finished_item_name_snapshot` | TEXT | yes | historical display when finished Item is present |
| `finished_spec_snapshot` | TEXT | yes | historical display when finished Item is present |
| `component_item_id` | INTEGER FK items | no | RESTRICT |
| `component_item_no_snapshot` | TEXT | no | |
| `component_item_name_snapshot` | TEXT | no | |
| `component_spec_snapshot` | TEXT | yes | |
| `quantity` | INTEGER scaled4 | no | `> 0` |
| `unit_snapshot` | TEXT | no | |
| `note` | TEXT | yes | |
| `sort_order` | INTEGER | no | default 0 |

Contractor-held stock changes only when outbound is confirmed; merely creating these rows does not change stock.

### `outsourcing_receipts`

`id`, `outsourcing_order_id FK NOT NULL RESTRICT`, `received_date TEXT date NOT NULL`, `operator_employee_id FK NOT NULL`, `created_at`.

Initial workflow expects one completed receipt per order; enforce `UNIQUE (outsourcing_order_id)` unless partial-receipt support is explicitly added later.

### `outsourcing_receipt_items`

`id`, `receipt_id FK NOT NULL CASCADE`, `item_id FK items NOT NULL RESTRICT`, `bom_recipe_id FK bom_recipes`, `item_no_snapshot`, `item_name_snapshot`, `spec_snapshot`, `quantity scaled4 > 0`, `unit_snapshot`, `note`, `sort_order`.

The selected `bom_recipe_id` freezes which BOM was actually used for consumption logic.

### `outsourcing_pricings`

`id`, `outsourcing_order_id FK NOT NULL RESTRICT UNIQUE`, `priced_date TEXT date NOT NULL`, `operator_employee_id FK NOT NULL`, `total_amount INTEGER money2 NOT NULL`, `created_at`, `revision`.

### `outsourcing_pricing_items`

`id`, `pricing_id FK NOT NULL CASCADE`, `item_id FK items NOT NULL RESTRICT`, `item_no_snapshot`, `item_name_snapshot`, `unit_snapshot`, `quantity scaled4`, `unit_price scaled4`, `subtotal INTEGER money2`, `note`, `sort_order`.

Exact rounding from quantity × unit price into subtotal/total remains governed by the future financial rounding helper.

## 12. Contractor stock ledger

### `contractor_stock_movements`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `contractor_id` | INTEGER FK contractors | no | RESTRICT |
| `item_id` | INTEGER FK items | no | RESTRICT |
| `related_finished_item_id` | INTEGER FK items | yes | RESTRICT; preserves Legacy adjustment context where useful |
| `movement_type` | TEXT | no | fixed code |
| `quantity_delta` | INTEGER scaled4 | no | signed, non-zero |
| `occurred_at` | TEXT utc_ts | no | |
| `operator_employee_id` | INTEGER FK app_members | no | RESTRICT |
| `outsourcing_order_id` | INTEGER FK outsourcing_orders | yes | RESTRICT |
| `outsourcing_receipt_id` | INTEGER FK outsourcing_receipts | yes | RESTRICT |
| `reversal_of_movement_id` | INTEGER FK contractor_stock_movements | yes | RESTRICT |
| `reason` | TEXT | yes | required for manual adjustment/reversal where applicable |
| `created_at` | TEXT utc_ts | no | |

Candidate movement codes:

```text
outbound_supply
receipt_consumption
manual_adjustment
reversal
```

Current balance is derived from movement totals. Do not store an independent authoritative `materialStock` JSON balance.

Indexes: `(contractor_id, item_id, occurred_at)`, `outsourcing_order_id`, `reversal_of_movement_id`.

## 13. WorkLog / scoring domain

### `work_logs`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `work_log_ref` | TEXT | no | UNIQUE system/display reference |
| `log_date` | TEXT date | no | Legacy/GAS「填寫日期」; separate from work interval |
| `date_from` | TEXT date | no | start of 日誌區間 |
| `date_to` | TEXT date | no | `>= date_from`; single-day is derived when equal |
| `work_days` | INTEGER scaled4 | no | `> 0` |
| `type_code` | TEXT | no | current initial type maps Legacy「美編日誌」to stable code; future types may extend |
| `employee_id` | INTEGER FK app_members | no | owner |
| `status_code` | TEXT | no | fixed workflow code |
| `reviewed_by` | INTEGER FK app_members | yes | cleared on cancel-review |
| `reviewed_at` | TEXT utc_ts | yes | cleared on cancel-review |
| `review_remark` | TEXT | yes | current effective overall review only |
| `final_score` | INTEGER scaled4 | yes | current finalized score only |
| `average_daily_score` | INTEGER scaled4 | yes | current finalized score / work_days |
| `created_at` | TEXT utc_ts | no | |
| `created_by` | INTEGER FK app_members | yes | |
| `updated_at` | TEXT utc_ts | no | |
| `updated_by` | INTEGER FK app_members | yes | |
| `revision` | INTEGER | no | default 1 |

Workflow:

```text
created -> pending_review -> reviewed
```

Owner may submit/withdraw according to confirmed workflow. Admin/authorized reviewer reviews. Cancel-review returns `reviewed -> pending_review`, clears current review/scoring values, and records only the required Audit event; no historical review-version table is required.

Legacy `singleDay` is not stored as a second authority; it is derived from `date_from = date_to`.

### `work_log_entries`

`id`, `work_log_id FK NOT NULL CASCADE`, `entry_type_code TEXT NOT NULL`, `content TEXT`, `platform_id FK work_log_platforms`, `remark TEXT`, `score_snapshot INTEGER scaled4`, `sort_order`.

Initial `entry_type_code` covers the current Legacy concepts such as platform-product rows and store-ad/other rows. The platform relation is nullable for row types that do not use a platform.

### `work_log_entry_categories`

`id`, `work_log_entry_id FK NOT NULL CASCADE`, `work_log_category_id FK NOT NULL RESTRICT`, `quantity INTEGER scaled4 NOT NULL`, `sort_order`.

For a boolean-style category, `quantity = 1`. Quantity-style categories store the actual count. This replaces the Legacy hardcoded category-name special case.

### `work_log_categories`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | stable configurable identity |
| `code` | TEXT | no | UNIQUE stable key |
| `name` | TEXT | no | editable display label |
| `input_mode` | TEXT | no | `boolean` / `quantity` |
| `unit_label` | TEXT | yes | optional display unit |
| `sort_order` | INTEGER | no | default 0 |
| `is_active` | INTEGER bool | no | default 1 |
| `updated_at` | TEXT utc_ts | no | |
| `updated_by` | INTEGER FK app_members | yes | |

### `work_log_platforms`

`id`, `code UNIQUE`, `name`, `sort_order`, `is_active`, `updated_at`, `updated_by`.

### `work_log_scoring_rows`

Typed replacement for Legacy `logScoring` category rows and `_extra` custom rows.

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `work_log_category_id` | INTEGER FK work_log_categories | yes | RESTRICT; set for category-backed reference row |
| `custom_name` | TEXT | yes | required for a custom/extra row |
| `score_value` | INTEGER scaled4 | yes | reference score |
| `description` | TEXT | yes | Legacy `desc` semantic |
| `note` | TEXT | yes | Legacy `note` semantic |
| `sort_order` | INTEGER | no | default 0 |
| `is_active` | INTEGER bool | no | default 1 |
| `updated_at` | TEXT utc_ts | no | |
| `updated_by` | INTEGER FK app_members | yes | |

Validation: a scoring row is either category-backed or custom-name-backed; it must not silently bind a custom row to a category by display-name guessing.

### `work_log_scoring_config`

Singleton/current typed configuration rather than opaque generic Settings JSON.

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | single current row |
| `target_average_daily_score` | INTEGER scaled4 | yes | optional runtime production config |
| `minimum_average_daily_score` | INTEGER scaled4 | yes | Legacy `_minAvgScore` / confirmed runtime config |
| `updated_at` | TEXT utc_ts | no | |
| `updated_by` | INTEGER FK app_members | yes | |
| `revision` | INTEGER | no | default 1 |

Production scoring values are runtime D1 configuration and are not hardcoded into Public source.

## 14. Shared CY Web Audit Core storage

All CY Web modules use the same Audit Core and the same event table. Other Apps are outside this scope.

### `audit_events`

| Column | Type | Null | Rule |
| --- | --- | --- | --- |
| `id` | INTEGER PK | no | |
| `entity_type` | TEXT | no | stable module/entity code |
| `entity_id` | INTEGER | no | target internal ID |
| `action` | TEXT | no | stable action code |
| `actor_employee_id` | INTEGER FK app_members | yes | RESTRICT |
| `occurred_at` | TEXT utc_ts | no | |
| `status_from` | TEXT | yes | only for meaningful state transitions |
| `status_to` | TEXT | yes | only for meaningful state transitions |
| `request_id` | TEXT | yes | optional; not required on every event |
| `before_json` | TEXT JSON | yes | minimal relevant fields only |
| `after_json` | TEXT JSON | yes | minimal relevant fields only |
| `metadata_json` | TEXT JSON | yes | compact non-relational metadata |

Storage rules:

- ordinary CRUD does **not** emit one Audit row per save;
- do not store full-row snapshots when a few fields are enough;
- no images, PDFs, files, generated documents, large blobs or secrets;
- normal timeline and Admin/SA detailed Audit Log read from this same table;
- retention/pruning is supported by service design but no arbitrary duration is frozen yet.

Indexes:

- `(entity_type, entity_id, occurred_at DESC)` for per-record timeline;
- `(occurred_at DESC)` for central log;
- `(actor_employee_id, occurred_at DESC)`;
- `(action, occurred_at DESC)` only if real query usage justifies the write/storage cost.

## 15. Backup operational catalog

Backup payload format/provider behavior remains governed by `BACKUP_ARCHITECTURE.md`. The following app-local operational catalog is sufficient for the first implementation and may later move behind CY Backup Service.

### `backup_sets`

`backup_id TEXT PRIMARY KEY`, `created_at`, `schema_version`, `data_sha256`, `data_byte_length`, `total_record_count`, `status_code`.

### `backup_copies`

`id INTEGER PK`, `backup_id FK backup_sets CASCADE`, `provider_code`, `status_code`, `object_prefix`, `verified_at`, `last_error_code`, `updated_at`.

UNIQUE `(backup_id, provider_code)`.

Do not store provider credentials/secrets in these tables. Backup catalog tables are operational metadata and should not recursively inflate the exported business dataset.

## 16. Initial fixed workflow codes

These are application contracts rather than administrator-created lookup rows.

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

## 17. Constraint / index freeze rules

Initial D1 schema should include at minimum:

- foreign-key enforcement enabled;
- partial unique Customer number when present;
- unique current Item number;
- unique Contractor + Item current pricing;
- unique human/display reference fields where declared;
- unique one-receipt / one-pricing-per-outsourcing-order for the initial non-partial workflow;
- check constraints for positive quantities/work days, booleans, and date-range ordering where SQLite permits practical enforcement;
- indexes for Customer/Item lookup, workflow list filtering, record timelines and key foreign-key traversal;
- no speculative indexes that are not tied to an actual query path.

Application-layer validation still remains authoritative for cross-row/domain rules that SQLite constraints cannot express cleanly.

## 18. Deliberately deferred, non-blocking items

The following do **not** block creation of the initial D1 schema:

1. Exact SMART ERP field ownership/read-only/synchronization mapping — long-term ERP integration project (BD-052).
2. Exact SMART ERP monetary line/tax/document rounding timing — future financial integration verification; scaled storage is already fixed.
3. Exact visual format of generated human references such as `work_order_ref`, `outsourcing_ref`, `recipe_ref`, `work_log_ref`; they remain separate from immutable internal IDs.
4. Production WorkLog category/platform/scoring values — runtime D1 configuration, not Public-source constants.
5. Final Audit retention duration — choose after real event volume/storage cost is measurable; the core supports pruning.
6. UI/UX presentation and Legacy GAS refresh-warning replacement — handled later in the dedicated UI/UX phase.

## 19. Legacy fields intentionally not copied as canonical columns

Examples:

- `Users.pin` — replaced by shared Identity;
- Legacy JSON cells such as Customer phones/contacts/addresses, Order items/history, WorkLog content/history, BOM parts, Contractor pricing/materialStock — normalized into relational tables;
- Legacy WorkLog `singleDay` — derived from equal start/end dates rather than stored as a second authority;
- `Outsourcing.isPriced` — workflow status and pricing/payment facts are authoritative;
- `StockAdjustLogs.newQty` — balance is derived from movement ledger;
- rendered `logText` / free-text history arrays — presentation generated from structured records/Audit events;
- Legacy `priceLog` — ordinary Item edit history is not retained as an unlimited field-by-field log under BD-053/054;
- Legacy technical readable IDs are not internal PKs; where a user reference remains useful it is represented by an explicit `*_ref` field.

## 20. Next engineering gate

```text
Final Data Dictionary verification
        ↓
initial D1 SQL migration
        ↓
constraint/index validation
        ↓
API validation + error contract
        ↓
Worker / app foundation
```

Any later schema change is a forward migration; production D1 is not hand-edited as an undocumented source of truth.
