# CY Web Canonical Data Model — Current Working Model

> Project: Chihyuan Enterprise Management System (CY Web)
>
> Status: consolidated logical model through BD-048. This is the working input to the Final Data Dictionary and D1 SQL schema. It is not a governance rules source and it is not a physical migration file.
>
> The pre-consolidation draft is preserved at `archive/CANONICAL_DATA_MODEL_PRE_CONSOLIDATION.md`.

## 1. Scope and source of truth

CY Web starts with a clean production D1 database. The current GAS / Google Sheets test dataset is not migrated (BD-047).

The canonical model therefore optimizes for the new system's business semantics rather than compatibility with Legacy Sheet headers, readable Legacy IDs, old aliases, or old JSON cell shapes.

Core rules:

- one business entity + one semantic meaning = one canonical field/source;
- relationships use stable internal IDs, never mutable names/business numbers;
- ERP-owned identifiers are separate from CY Web internal identity;
- formal historical documents preserve explicit snapshots where required by BD-006;
- query-critical relationships/fields are relational, not opaque JSON;
- workflow state codes are stable application contracts; configurable classifications are lookup data;
- audit/history is explicit and structured where business reconstruction matters.

## 2. Naming and physical-ID direction

### Database

D1/SQL uses `snake_case`.

### API / TypeScript

TypeScript may expose `camelCase` through one schema/mapper boundary, with one-to-one semantic mapping to database fields.

### Internal IDs

Per BD-005, internal IDs are technical immutable keys. A simple D1/SQLite integer primary key is acceptable unless a later concrete requirement justifies an opaque external/public ID or another physical key type.

Business numbers such as SMART ERP Customer/Item numbers remain separate fields.

## 3. Shared Identity and application authorization

CY Web reuses the shared Identity authority rather than recreating a local username/PIN account system (BD-037).

Candidate local application structures:

### `app_members`

- `id`
- `identity_employee_id` — stable shared Identity subject/reference
- `employee_no` nullable application/company reference where needed
- `is_active`
- `created_at`, `updated_at`

### `app_member_tags`

App-specific module-access tags such as `sales`, `staff`, `warehouse`, `designer`.

Shared `user / admin / super-admin` semantics remain owned by the shared Identity authority. CY Web configuration authority follows BD-043.

## 4. Reference and lookup data

Candidate lookup entities:

- `departments`
- `customer_categories`
- `customer_statuses`
- `regions` — controlled Taiwan county/city references
- `item_categories` — supports hierarchy
- `work_log_categories`
- `work_log_platforms`
- typed WorkLog scoring configuration

Configurable lookup identity is stable and separate from editable display labels (BD-010).

Workflow states such as Order/Outsourcing lifecycle codes are not administrator-created lookup rows.

## 5. Customer domain

### `customers`

Candidate fields:

- `id`
- `customer_no` nullable; SMART ERP-owned; unique when present; controlled changes allowed by BD-048
- `short_name`
- `full_name`
- `tax_id` nullable; indexed; duplicates allowed with strong warning (BD-016)
- `customer_category_id`
- `region_id` — customer-level county/city classification (BD-008/009)
- `owner_department_id`
- `owner_employee_id`
- `fax`
- `customer_status_id`
- `created_at`, `updated_at`, `created_by`, `updated_by`, `revision`

A Customer/prospect may exist before `customer_no` exists. ERP qualification is derived from whether a current customer number is present (BD-001/013/048).

`closed_business / 已歇業` remains visible/status information but does not by itself block normal CY Web workflows (BD-035).

### `customer_phones`

- `id`
- `customer_id`
- `phone_number`
- `extension`
- `note`
- `sort_order`

### `customer_contacts`

- `id`
- `customer_id`
- `name`
- `department_name`
- `title`
- `phone`
- `mobile`
- `note`
- `sort_order`
- active/retirement metadata as needed

### `customer_addresses`

- `id`
- `customer_id`
- `postal_code`
- `address`
- `note`
- `sort_order`

Addresses do not silently determine or overwrite `customers.region_id` (BD-009).

### `customer_notes`

Ordered highlighted/customer notes without the Legacy fixed-three JSON-cell limitation.

- `id`
- `customer_id`
- `content`
- `sort_order`
- audit timestamps/actor fields

### `customer_visits`

- `id`
- `customer_id`
- `visit_date`
- `contact_id` nullable
- `person_snapshot`
- `employee_id`
- `content`
- audit fields

Visit-time person text is preserved even when a Contact relation exists (BD-015).

### `customer_frequent_items`

- `id`
- `customer_id`
- `item_id` nullable
- `custom_item_name` nullable
- optional display snapshot fields where useful
- `sort_order`

A row is either an explicit formal Item relation or a free-text customer-information entry. Text matching never auto-links to Item; formal linkage requires explicit selection (BD-023/039).

## 6. Customer-item quotation history

CY Web Quote is not the formal SMART ERP quotation document (BD-020/021).

### `customer_item_quotes`

- `id`
- `customer_id`
- `item_id`
- `quote_date`
- `employee_id`
- relevant customer/item snapshots where required
- `created_at`, `updated_at`, audit actor/revision fields

One record represents one Customer + one Item quotation event. A genuine new commercial quotation creates a new history record rather than overwriting the previous one.

### `quote_price_breaks`

- `id`
- `quote_id`
- `quantity`
- `unit`
- `unit_price`
- `note`
- `sort_order`

Corrections of an existing quote-history record are permitted only as explicit audited corrections (BD-022).

## 7. Item domain

### `items`

- `id`
- `item_no` — current SMART ERP Item number; unique current value
- `name`
- `spec`
- `base_unit`
- `item_category_id`
- `cost`
- `cost_tax_mode`
- `store_price`
- `clinic_price`
- `notes`
- active/status fields as required
- audit fields

Formal Item master creation is ERP-owned (BD-004). Exact ERP-owned vs CY Web-extension field ownership is finalized during ERP-integration/Data-Dictionary work.

### `item_number_history`

Supports ERP-authorized Item-number changes (BD-004/011):

- `id`
- `item_id`
- `item_no`
- `valid_from`
- `valid_to` nullable
- `change_source`
- retirement/searchability metadata as needed

Old Item numbers remain searchable until explicitly retired. New transactions use the current Item number.

### `item_unit_conversions`

- `id`
- `item_id`
- `from_unit`
- `quantity`
- `to_unit`
- `sort_order`

Validation must reject invalid/cyclic/unresolved conversion graphs.

General Item commercial/unit changes are recorded through structured audit/history rather than a misleading free-text `priceLog` field.

## 8. Sales work-order domain

CY Web owns the field/pre-ERP work order and operational fulfillment workflow; SMART ERP owns the authoritative formal sales order (BD-024).

### `sales_work_orders`

- `id`
- `customer_id` nullable only where the confirmed field-entry flow permits a not-yet-linked customer context
- customer display/snapshot fields needed by the work order
- `order_date`
- `operator_employee_id`
- `note`
- `status_code`
- `erp_no` nullable until ERP handoff
- `hide_price_on_sales_document`
- `invoice_type` nullable stable value/code
- `receipt_option` nullable stable value/code
- void metadata when applicable
- audit fields

Candidate stable lifecycle codes:

```text
created
issued
waiting_stock
picked
shipped
voided
```

`waiting_stock` is optional in the flow. ERP first-fill changes the work order into the issued phase. ERP data fill/correction uses the single contextual action defined in BD-034.

Hard delete is limited to the pre-ERP condition defined by BD-029. After ERP issuance the explicit termination action is `voided / 作廢`.

### `sales_work_order_items`

- `id`
- `sales_work_order_id`
- `item_id` nullable only for an explicitly supported unfiled line
- `item_no_snapshot`
- `item_name_snapshot`
- `spec_snapshot`
- `quantity`
- `unit_snapshot`
- `unit_price`
- `note`
- `sort_order`

Formal snapshots follow BD-006.

## 9. Defect domain

### `defect_reports`

- `id`
- `reported_date`
- `customer_id`
- `item_id`
- `owner_employee_id`
- `defect_description`
- `handling`
- `status_code`
- applicable snapshots only where the record represents a historical fact/document
- audit fields

Lifecycle:

```text
created -> processing -> resolved
```

A resolved record may be explicitly reopened to processing (BD-028). Edit/delete boundaries follow BD-033.

## 10. Contractor domain

### `contractors`

- `id`
- `entity_type` — `person / organization`
- `display_name`
- `legal_name` nullable
- `tax_id` nullable
- `phone` nullable
- `address` nullable
- `note` nullable
- `is_active`
- audit fields

### `contractor_contacts`

- `id`
- `contractor_id`
- `name`
- `title`
- `phone`
- `mobile`
- `note`
- `sort_order`

### `contractor_pricing`

One current price per Contractor + Item (BD-038):

- `id`
- `contractor_id`
- `item_id`
- `pricing_unit`
- `unit_price`
- `note`
- effective/updated timestamps and audit metadata

Historical paid/priced outsourcing records retain their transaction-time pricing facts.

## 11. BOM / recipe domain

### `bom_recipes`

- `id`
- `finished_item_id`
- `output_quantity`
- `output_unit`
- active/version metadata as needed
- audit fields

Multiple BOM variants are allowed for the same finished Item (BD-036).

### `bom_components`

- `id`
- `bom_recipe_id`
- `component_item_id`
- `quantity`
- `unit`
- `sort_order`

Receiving records preserve which BOM was actually selected so later BOM edits do not rewrite historical consumption.

## 12. Outsourcing domain

### `outsourcing_orders`

- `id`
- `status_code`
- `operator_employee_id`
- `contractor_id`
- `order_date`
- `outbound_date` nullable until confirmed
- void metadata where applicable
- audit fields

Lifecycle:

```text
pending_outbound -> outbound -> received -> priced -> paid
```

`voided` is a terminal state used when a confirmed outbound is cancelled (BD-040).

A planned `pending_outbound` order does not change actual contractor-held stock. Stock changes only when outbound is confirmed (BD-026).

Hard delete is allowed only before confirmed outbound (BD-027). Inventory-affecting outbound facts are not ordinary editable fields after confirmation; corrections use controlled reversal/correction events (BD-032).

### `outsourcing_order_parts`

- `id`
- `outsourcing_order_id`
- `finished_item_id` nullable where appropriate
- `component_item_id`
- planned/confirmed quantity and unit facts
- applicable document snapshots
- `note`
- `sort_order`

### `outsourcing_receipts`

- `id`
- `outsourcing_order_id`
- `received_date`
- `operator_employee_id`
- audit fields

### `outsourcing_receipt_items`

- `id`
- `receipt_id`
- `item_id`
- `bom_recipe_id` — selected BOM where required by BD-036
- `quantity`
- `unit`
- applicable snapshots
- `note`
- `sort_order`

### `outsourcing_pricings`

- `id`
- `outsourcing_order_id`
- `priced_date`
- `operator_employee_id`
- `total_amount`
- audit fields

### `outsourcing_pricing_items`

- `id`
- `pricing_id`
- `item_id`
- `item_no_snapshot`
- `item_name_snapshot`
- `unit_snapshot`
- `quantity`
- `unit_price`
- `subtotal`
- `note`
- `sort_order`

## 13. Contractor stock ledger

Physical/business movements are authoritative; a mutable balance is not an independent source of truth.

### `contractor_stock_movements`

- `id`
- `contractor_id`
- `item_id`
- `movement_type`
- signed `quantity_delta`
- `occurred_at`
- `operator_employee_id`
- `outsourcing_order_id` nullable
- `reason` nullable
- correction/reversal reference fields as needed
- audit/correlation metadata

Candidate movement types include:

- `outbound_supply`
- `receipt_consumption`
- `manual_adjustment`
- correction/reversal counterparts where needed

Current stock is derived from movement totals. If a balance cache is later introduced for performance, it remains derived/transactionally maintained rather than a second authority.

## 14. WorkLog / scoring domain

### `work_logs`

- `id`
- `work_date` and/or confirmed date range fields
- `work_days` required and `> 0`; fractional values allowed (BD-041)
- `type_code`
- `employee_id`
- `status_code`
- finalized/review metadata
- frozen scoring summary fields as required
- audit fields

Lifecycle remains conceptually:

```text
created -> pending_review -> reviewed
```

Controlled withdrawal/review-correction/reopen actions preserve history rather than silently rewriting finalized scores.

### `work_log_entries`

- `id`
- `work_log_id`
- `entry_type`
- `content`
- `platform_id` nullable
- `remark` nullable
- `score_snapshot` nullable/finalized as applicable
- `sort_order`

### `work_log_entry_categories`

- `id`
- `work_log_entry_id`
- `work_log_category_id`
- `quantity`

### Scoring configuration

Scoring categories/rules, descriptions, custom rows, target/minimum average, platform/channel lists, display order, and active state are runtime/configuration data rather than Chihyuan-specific Public-source constants (BD-042).

Finalized WorkLog scores remain frozen against later global configuration changes (BD-012).

## 15. Audit and domain history

### `audit_events`

Cross-module structured audit source, candidate fields:

- `id`
- `entity_type`
- `entity_id`
- `action`
- `actor_employee_id`
- `occurred_at`
- `request_id` / correlation ID
- `metadata_json` for non-relational before/after detail

JSON is acceptable for event detail metadata; query-critical business relationships remain relational.

Domains with lifecycle semantics may also expose/query domain-specific event projections while retaining one structured audit foundation.

Hard-delete policy follows BD-030: master records may be physically deleted only while never referenced; once referenced they remain identifiable and are retired/inactivated/statused instead.

## 16. Backup/recovery model boundary

Backup data is not part of the live business relational model.

Per BD-044 through BD-046:

- D1 remains the live database;
- GCS is the initial Chihyuan off-site provider behind `BackupStorageProvider`;
- `BackupService` owns create/list/verify/restore/retention and restore authorization/audit;
- backup sets use `manifest.json + data.json` with SHA-256 and upload/read-back verification;
- restore is Super Admin-only and double-confirmed.

Production infrastructure identifiers and credentials remain outside Public Git.

## 17. Decimal/date baseline

Per BD-017 through BD-019:

```text
quantity scale           up to 4 decimal places
unit price / cost scale  up to 4 decimal places
formal TWD amount scale  2 decimal places baseline
```

Exact physical fixed-point representation, line/tax/document rounding timing/method, and final SMART ERP monetary alignment must be resolved before financial SQL/calculation helpers are frozen.

Date-only business fields should use a consistent date representation; timestamps should use an explicit UTC convention with presentation conversion at the application boundary.

## 18. Removed Legacy-only structures

The production canonical model intentionally does **not** include structures whose sole purpose was importing the unused Legacy test dataset, including:

- `legacy_id_map`;
- `legacy_customer_id`, `legacy_item_id`, and similar migration-only columns;
- imported old JSON cell-shape compatibility tables;
- Sheet-row-order identity;
- Legacy readable ID-format preservation solely for migration.

Legacy audits remain useful for feature/workflow understanding only.

## 19. Genuine remaining Data-Dictionary work

The following are still legitimate implementation/detail questions before SQL freeze; they should not be confused with old resolved `OPEN` markers:

1. exact ERP-owned versus CY Web-extension fields for Item/Customer once SMART ERP integration is investigated;
2. exact Customer/Order unlinked-customer capture shape required by the confirmed field work-order workflow;
3. exact snapshot column set per formal document/event, applying BD-006 without unnecessary duplication;
4. physical fixed-point representation and exact rounding rules after SMART ERP financial behavior is verified;
5. exact WorkLog scoring/version evidence and controlled review-correction schema;
6. exact audit metadata schema and retention/query indexes;
7. final D1 indexes, foreign-key actions, uniqueness/partial-index constraints, and optimistic-concurrency strategy.

Everything else already answered by a confirmed Business Decision should be treated as decided unless the user explicitly changes it.

## 20. Next gate

```text
this consolidated logical model
        ↓
Final Data Dictionary
        ↓
D1 SQL schema + forward migrations
        ↓
API/validation/error contracts
        ↓
Worker/app foundation
        ↓
module implementation
```

There is no Legacy-data importer/cutover gate under BD-047.
