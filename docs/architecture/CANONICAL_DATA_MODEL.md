# CY Web Canonical Data Model — Current Working Model

> Project: Chihyuan Enterprise Management System (CY Web)
>
> Status: consolidated logical model through BD-054. The lower-level initial schema contract is now drafted in `FINAL_DATA_DICTIONARY.md`. This file remains the logical-model layer, not a governance rules source and not a physical migration file.
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
- ordinary CRUD keeps latest-modified metadata, while meaningful business actions use structured audit under BD-053/054.

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
- current display metadata/cache needed by CY Web, such as employee number/name and CY Web department where applicable
- `is_active`
- `created_at`, `updated_at`

### `app_tags`

Stable CY Web-local module-access tags managed under BD-043.

### `app_tag_modules`

Maps an App tag to fixed CY Web module codes.

### `app_member_tags`

Maps an App member to App-local tags.

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
- typed WorkLog scoring configuration/reference rows

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
- latest-modified metadata as appropriate

### `customer_visits`

- `id`
- `customer_id` required
- `visit_date`
- `contact_id` nullable
- `person_snapshot`
- `employee_id`
- `content`
- latest-modified metadata

Visit-time person text is preserved even when a Contact relation exists (BD-015). A Visit is always attached to a real Customer internal identity; name-only Visit records are not allowed.

### `customer_frequent_items`

- `id`
- `customer_id`
- `item_id` nullable
- `custom_item_name` nullable
- optional free-text category/display fields for unfiled entries
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
- Item display snapshots needed to preserve the historical quote context
- `created_at`, `updated_at`, actor/revision fields

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
- latest-modified metadata/revision

Formal Item master creation remains conceptually ERP-owned (BD-004). Per BD-052, the **initial CY Web field set follows the validated Legacy/GAS business fields now**; exact `ERP-owned / CY Web extension / read-only / synchronized` classification is deferred until the future SMART ERP integration project inspects the real approved ERP interface.

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

General Item edits do not require unlimited field-by-field history. Important controlled Item-number operations remain explicit business/audit events where applicable under BD-053/054.

## 8. Sales work-order domain

CY Web owns the field/pre-ERP work order and operational fulfillment workflow; SMART ERP owns the authoritative formal sales order (BD-024).

### `sales_work_orders`

- `id`
- system-generated human/display reference separate from the technical PK
- `customer_id` nullable only for the confirmed name-only field-entry flow
- `customer_no_snapshot` nullable
- `customer_name_snapshot` required
- `order_date`
- `operator_employee_id`
- `note`
- `status_code`
- `erp_no` nullable until ERP handoff
- `hide_price_on_sales_document`
- `invoice_type_code` nullable stable value/code
- `receipt_option_code` nullable stable value/code
- void metadata when applicable
- latest-modified metadata/revision

Permitted customer-entry modes follow BD-031:

```text
A. lookup/select a Customer
   customer_id = present
   customer_no may be present or absent on the Customer
   displayed name comes from Customer master and is snapshotted for the work order

B. field name only
   customer_id = null
   customer_no snapshot = null
   customer-name snapshot = required free text
   internal staff later performs deliberate reconciliation
```

CY Web does not fuzzy-match, auto-link, or silently merge the name-only Order entry with a Customer.

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
- `item_id` required in the initial schema because the validated Legacy/current workflow selects a formal Item
- `item_no_snapshot`
- `item_name_snapshot`
- `spec_snapshot`
- `quantity`
- `unit_snapshot`
- `unit_price`
- `note`
- `sort_order`

Formal snapshots follow BD-006. An unfiled/free-text Order item is not part of the initial confirmed workflow.

## 9. Defect domain

### `defect_reports`

- `id`
- `reported_date`
- `customer_id`
- Customer number/name snapshots as used by the historical record
- `item_id`
- Item number/name/spec snapshots
- `owner_employee_id`
- `defect_description`
- `handling`
- `status_code`
- latest-modified metadata/revision

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
- latest-modified metadata/revision

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
- updated timestamp/actor/revision

Historical paid/priced outsourcing records retain their transaction-time pricing facts.

## 11. BOM / recipe domain

### `bom_recipes`

- `id`
- system/display reference separate from the technical PK
- `finished_item_id`
- `output_quantity`
- `output_unit`
- active metadata
- latest-modified metadata/revision

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
- system/display reference separate from the technical PK
- `status_code`
- `operator_employee_id`
- `contractor_id`
- `contractor_name_snapshot`
- `order_date`
- `outbound_date` nullable until confirmed
- payment/void metadata where applicable
- latest-modified metadata/revision

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
- `bom_recipe_id` nullable where appropriate
- `finished_item_id` nullable where appropriate
- applicable finished-item snapshots
- `component_item_id`
- applicable component-item snapshots
- quantity/unit facts
- `note`
- `sort_order`

### `outsourcing_receipts`

- `id`
- `outsourcing_order_id`
- `received_date`
- `operator_employee_id`

The initial workflow represents one completed receipt per order; partial/multiple receiving is not silently introduced without a later explicit requirement.

### `outsourcing_receipt_items`

- `id`
- `receipt_id`
- `item_id`
- `bom_recipe_id` — selected BOM where required by BD-036
- `quantity`
- `unit_snapshot`
- applicable Item snapshots
- `note`
- `sort_order`

### `outsourcing_pricings`

- `id`
- `outsourcing_order_id`
- `priced_date`
- `operator_employee_id`
- `total_amount`
- revision/creation metadata

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
- optional related finished Item context
- `movement_type`
- signed `quantity_delta`
- `occurred_at`
- `operator_employee_id`
- `outsourcing_order_id` nullable
- `outsourcing_receipt_id` nullable
- reversal/correction reference fields as needed
- `reason` nullable

Candidate movement types include:

- `outbound_supply`
- `receipt_consumption`
- `manual_adjustment`
- explicit reversal

Current stock is derived from movement totals. If a balance cache is later introduced for performance, it remains derived/transactionally maintained rather than a second authority.

## 14. WorkLog / scoring domain

### `work_logs`

- `id`
- system/display reference separate from the technical PK
- `log_date` — Legacy/GAS 「填寫日期」
- `date_from`
- `date_to`
- `work_days` required and `> 0`; fractional values allowed (BD-041)
- `type_code`
- `employee_id`
- `status_code`
- current effective review actor/time/remark
- current finalized score and average-daily score
- latest-modified metadata/revision

Lifecycle remains conceptually:

```text
created -> pending_review -> reviewed
```

Owner submit/withdraw and Admin review remain controlled actions. Per BD-051, an explicit cancel-review action returns `reviewed -> pending_review`, clears the currently effective review/scoring values, and keeps the cancellation Audit event; the cancelled score payload is **not** retained as a separate review version in the initial schema.

Legacy `singleDay` is derivable from an equal start/end date and does not need to be a second stored authority.

### `work_log_entries`

- `id`
- `work_log_id`
- `entry_type_code`
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

### `work_log_categories`

Configurable category identity plus an explicit input mode (`boolean` / `quantity`) replaces the Legacy hardcoded category-name special case.

### `work_log_platforms`

Stable configurable platform/channel identity.

### `work_log_scoring_rows`

Typed scoring/reference rows preserve Legacy/confirmed semantics such as category-linked reference scores, descriptions, notes, and custom/extra rows without storing the whole configuration as one opaque Settings object.

### `work_log_scoring_config`

Typed current scoring settings such as minimum/target average values where configured.

Scoring category/rule descriptions, custom rows, platform lists, display order, active state and production scoring values are runtime/configuration data rather than Chihyuan-specific Public-source constants (BD-042).

Finalized WorkLog scores remain frozen against later global configuration changes while the review remains active (BD-012/051).

## 15. Audit and domain history

### `audit_events`

CY Web uses one shared in-App Audit Core and one common event foundation across modules (BD-054).

Candidate event fields:

- `id`
- `entity_type`
- `entity_id`
- `action`
- `actor_employee_id`
- `occurred_at`
- optional `status_from` / `status_to`
- optional request/correlation ID
- compact optional before/after/metadata JSON

Rules:

- ordinary CRUD does not create a new Audit row on every save; aggregate/master rows keep the latest `updated_at / updated_by` per BD-053;
- meaningful workflow, authorization, stock, review, ERP-handoff, configuration and recovery actions create structured Audit events;
- only the minimum useful before/after facts are stored;
- no files, images, PDFs, large record copies or secrets are stored in Audit payloads;
- normal business timeline and Admin/SA detailed Audit Log are two projections of the same event store, not duplicate histories;
- the Audit Core must support later retention/pruning, but no arbitrary retention period is frozen before production volume is measurable.

This shared Audit Core is scoped to CY Web. It does not require CYAccountingWeb, CYInvoice or other independently developed Apps to share this implementation at this stage.

Hard-delete policy follows BD-030: master records may be physically deleted only while never referenced; once referenced they remain identifiable and are retired/inactivated/statused instead.

## 16. Backup/recovery model boundary

Backup data is not part of the live business relational model.

Per BD-044 through BD-050:

- D1 remains the live authoritative database;
- R2 is the daily operational backup tier;
- GCS is the lower-frequency cross-cloud disaster-recovery tier;
- one logical backup is exported from D1 once and the exact same bytes/manifest/hash are reused across provider copies;
- `BackupService` / provider boundaries own create/list/verify/restore/retention behavior;
- backup sets use the portable `CYBackupSet` outer contract with `manifest.json + data.json` and SHA-256/read-back verification;
- restore is Super Admin-only and double-confirmed;
- provider credentials and production infrastructure identifiers remain outside Public Git.

App-local backup set/copy catalog rows may exist as operational metadata and may later move behind the shared CY Backup Service boundary defined by BD-050.

## 17. Decimal/date baseline

Per BD-017 through BD-019 and the current Data Dictionary direction:

```text
quantity scale           up to 4 decimal places
unit price / cost scale  up to 4 decimal places
formal TWD amount scale  2 decimal places baseline
```

Initial D1 physical storage uses scaled integers rather than binary floating point. Exact line/tax/document rounding timing/method remains deferred until the later SMART ERP financial-behavior verification; this does not block the initial schema.

Date-only business fields use a consistent `YYYY-MM-DD` representation. Timestamps use an explicit UTC convention with presentation conversion at the application boundary.

## 18. Removed Legacy-only structures

The production canonical model intentionally does **not** include structures whose sole purpose was importing the unused Legacy test dataset, including:

- `legacy_id_map`;
- `legacy_customer_id`, `legacy_item_id`, and similar migration-only columns;
- imported old JSON cell-shape compatibility tables;
- Sheet-row-order identity;
- Legacy readable ID-format preservation solely for migration.

Legacy audits remain useful for feature/workflow understanding only.

Other Legacy implementation fields are normalized or retired where a newer canonical source exists, including opaque history/log arrays, `materialStock` as an authoritative balance, and `Outsourcing.isPriced` as a competing workflow source.

## 19. Data-Dictionary status

The previous list of genuinely unresolved Data-Dictionary questions has now been reduced by BD-051 through BD-054 and the initial `FINAL_DATA_DICTIONARY.md` draft:

- Order name-only versus linked-Customer capture is defined by BD-031;
- initial fields follow validated Legacy/GAS business semantics while SMART ERP field ownership is deferred by BD-052;
- required snapshot fields are now enumerated in the Data Dictionary from the actual workflow/document boundaries;
- scaled physical decimal storage is selected; only future ERP rounding timing remains deferred;
- WorkLog cancel-review/version evidence is defined by BD-051;
- ordinary edit metadata versus structured Audit and the one-core/cost boundary are defined by BD-053/054;
- the Data Dictionary now proposes concrete FK/delete behavior, indexes, uniqueness, partial uniqueness and optimistic concurrency.

Remaining items are implementation verification rather than unanswered current business semantics. They include exact SQL syntax/index tuning, generated display-reference formatting, runtime production WorkLog values, final Audit retention after real usage is measurable, and future SMART ERP integration/rounding behavior.

The current lower-level source for schema work is:

`docs/architecture/FINAL_DATA_DICTIONARY.md`

## 20. Next gate

```text
Final Data Dictionary verification
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