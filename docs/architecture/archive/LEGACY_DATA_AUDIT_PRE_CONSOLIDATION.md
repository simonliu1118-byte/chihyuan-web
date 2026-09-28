# Legacy Data Audit

> Project: Chihyuan Enterprise Management System (CY Web)
>
> Scope: legacy GAS / Google Sheets data model inventory before D1 design.
>
> This is an architecture/design record, **not** a governance rules source.

## 1. Audit scope and evidence

This audit cross-checks four layers of the private Legacy system:

1. `Code.js` backend schema, CRUD, migrations and bundle APIs;
2. Desktop HTML / JavaScript actual read/write behavior;
3. Mobile HTML / JavaScript actual read/write behavior;
4. the currently bound Google Sheet, using **header-only, read-only profiling**. No production/test record values are copied into this Public repository.

Legacy source baseline: `simonliu1118-byte/chihyuan-legacy-private` `master` at the pre-Web migration baseline.

The goal is not to reproduce the old Sheets layout in D1. The goal is to identify the actual business entities, remove semantic aliases, replace name-based joins with stable foreign keys, split queryable JSON blobs into relational child tables, and preserve historical snapshots only where they have a real business reason.

## 2. High-level findings

### 2.1 The five UI modules are not five database tables

The five visible modules are Customer, Order, Outsourcing, WorkLog and Item, but the Legacy backend currently uses these data areas:

- Users
- Customers
- Orders
- WorkLogs
- Visits
- Quotes
- Settings
- Outsourcing
- Materials
- Contractors
- Frequent
- Items
- DefectReports
- StockAdjustLogs

`DeleteLogs` is supported by newer backend code but is **not present in the currently profiled Sheet**. It must not be treated as an existing migration source unless a later profiling pass finds it.

### 2.2 The same business concept is stored under different names

Confirmed examples:

- `customerNo` -> `custNo` compatibility migration;
- `shortName` -> `custshortName` compatibility migration;
- `orderId_m` -> `outId` migration;
- `materialId_m` -> `materialId` migration;
- `contractorId_m` -> `contractorId` migration;
- `userName`, `operator`, `sales` can contain either a `userId` or an old display name depending on code path/version;
- `contractor` and `contractorName` store a contractor **name** even though a `contractorId` exists.

These aliases must not survive into the CY Web canonical model.

### 2.3 Master data is duplicated into transactional records

Examples:

- Orders stores `custId`, `custNo`, `custshortName` together.
- DefectReports stores customer ID/no/name and item ID/no/name/spec together.
- Quotes stores item number/name/spec instead of a stable item relation.
- Outsourcing lines repeat finished-item and part-item numbers/names/specs.
- StockAdjustLogs stores contractor name, finished-item number/name, and part number/name.

Some duplication is accidental denormalization; some may be a legitimate historical snapshot. CY Web must distinguish these explicitly instead of using ambiguous duplicate columns.

### 2.4 Several core relationships use display names as foreign keys

Confirmed current examples:

- Outsourcing order -> contractor by contractor `name`.
- Stock adjustment -> contractor by `contractorName`.
- legacy employee references can be user name or user ID.

Display names are mutable and must never be the new authoritative relationship key.

### 2.5 Queryable business structures are stored as JSON in one Sheet cell

Examples:

- customer phones / contacts / addresses / important notes;
- order items / flags / history;
- quote details;
- item unit conversions / price-change log;
- work-log content / history;
- BOM/material parts;
- contractor pricing / logs / material stock;
- outsourcing part items / receiving / pricing / logs;
- frequent-product data.

JSON remains acceptable for non-queryable metadata/audit payloads, but queryable business relationships should be normalized in D1.

### 2.6 Persisted status values contain presentation

Order, outsourcing, defect and work-log status values include human labels and often emoji, for example `🔴 已建檔` and `✅ 已付款`.

CY Web should persist stable machine status codes and map them to localized labels/icons in the UI. Presentation must not be the database key.

### 2.7 Desktop and Mobile are materially divergent implementations

The Legacy product has separate Desktop and Mobile JavaScript. They are not merely two layouts; some paths write different data shapes, IDs and states. Therefore neither implementation can be copied mechanically into the new one-codebase Web product.

## 3. Current Sheet inventory

The following headers are confirmed both in backend schema and by read-only header profiling of the currently bound Sheet.

| Legacy area | Current fields | Main normalization issue |
| --- | --- | --- |
| Users | `userId, name, role, pin, empNo, dept, inactive` | local PIN auth is retired; identity/app permissions must be separated |
| Customers | `custId, custNo, custshortName, custfullName, taxId, custcategory, region, dept, sales, fax, phones, contacts, addresses, status, importantNotes` | hidden ID vs business number; JSON children; employee refs |
| Orders | `orderId, custId, custNo, custshortName, orderDate, operator, items, note, flags, status, erpNo, history, lastUpdate` | duplicated customer values; JSON lines/flags/history |
| WorkLogs | `logId, date, dateFrom, dateTo, singleDay, workDays, type, userName, status, content, history, lastUpdate` | `userName` no longer reliably means name; content is queryable JSON |
| Visits | `visitId, custId, date, person, sales, content` | customer + employee FKs |
| Quotes | `quoteId, custId, itemNo, itemName, spec, date, sales, details` | item relation duplicated by number/name/spec; details JSON |
| Outsourcing | `outId, status, operator, contractor, orderDate, outDate, partItems, receiving, logs, isPriced, pricedData` | contractor name FK; multiple embedded entities |
| Materials | `materialId, finId, finName, finSpec, finQty, finUnit, parts` | this is actually a BOM/recipe model, not a general material master |
| Contractors | `contractorId, name, phone, addr, note, pricing, logs, inactive, materialStock` | pricing and stock embedded JSON |
| Frequent | `custId, frequentData` | customer-to-item relation embedded JSON; custom unfiled items allowed |
| Items | `itemId, itemNo, itemName, spec, unit, unitConversions, itemCategory, cost, taxType, storePrice, clinicPrice, notes, priceLog` | hidden ID vs item number; unit conversions JSON; change history misnamed `priceLog` |
| DefectReports | `defectId, reportDate, custId, custNo, custshortName, sales, itemId, itemNo, itemName, spec, defectDesc, handling, status, logs` | customer/item duplicates; history strings |
| StockAdjustLogs | `logId, date, operator, contractorName, finId, finName, partId, partName, changeType, amount, newQty, reason, logText` | name-based joins and duplicated item labels |
| Settings | row-key table | arbitrary lists and JSON objects mixed together |

`DeleteLogs(time, userId, action)` exists in backend code but was not found as an actual Sheet tab during this audit.

## 4. Confirmed field semantics

### 4.1 Customer

| Legacy field/path | Confirmed meaning | CY Web treatment |
| --- | --- | --- |
| `Customers.custId` | hidden internal legacy identifier, generated `C#####` | migration identity only or legacy code; do not expose as canonical business number |
| `Customers.custNo` | user-visible **客戶編號** | canonical `customer_no` |
| `custshortName` | customer short name | canonical master field `short_name` |
| `custfullName` | customer full name | canonical master field `full_name` |
| `taxId` | tax ID / 統一編號 | canonical master field, text type |
| `custcategory` | customer category | FK to customer category lookup |
| `region` | region label | canonical customer attribute / lookup; exact lookup design still open |
| `dept` | **internal responsible department** | rename to `owner_department_id`; do not confuse with contact department |
| `sales` | responsible salesperson, legacy user ID/name compatibility | `owner_employee_id` FK |
| `fax` | customer fax | master field |
| `phones[]` | phone records `{num, ext, note}` in current Desktop | child table `customer_phones` |
| `contacts[]` | `{name, dept, title, mobile}` | child table `customer_contacts`; its `dept` is the contact's organization department |
| `addresses[]` | `{zip, addr, note}` | child table `customer_addresses` |
| `status` | configured customer status label | status lookup FK with stable ID/code |
| `importantNotes[]` | highlighted notes | child table or ordered note records |

Important distinction: `Customers.dept` and `contacts[].dept` are **different business meanings** despite both being named `dept`.

### 4.2 Visits

Legacy: `visitId, custId, date, person, sales, content`.

- `custId` is a customer relationship.
- `sales` is an employee relationship.
- `person` is the visited/contact person text, not an employee key.
- `content` is visit detail text.

### 4.3 Quotes

Legacy quote is not a general multi-item quotation header. One quote record identifies one customer and one item, then `details[]` stores price rows such as quantity/unit/price/note.

Recommended semantic interpretation:

- quote header -> customer + item + quote date + responsible employee;
- quote detail rows -> quantity/unit/price/note price breaks;
- item number/name/spec can be retained as explicit historical snapshots if required, but must be named as snapshots rather than pretending to be a second item master.

### 4.4 Customer frequent items

`Frequent` is keyed by customer and contains a JSON list. Entries can either match an Item master or contain an unfiled free-text product (`itemNo=''`, custom item name, category `未建檔`).

Therefore the new relation must allow a nullable `item_id` plus custom/free-text fields; it cannot require every frequent entry to have an Item row.

### 4.5 Items

| Legacy field/path | Confirmed meaning | CY Web treatment |
| --- | --- | --- |
| `itemId` | hidden internal legacy ID `I######` | migration identity/legacy code |
| `itemNo` | user-visible 品號 | canonical `item_no` |
| `itemName` | 品名 | canonical master field |
| `spec` | 規格 | canonical master field |
| `unit` | base unit | canonical master field |
| `unitConversions[]` | conversion chain `{otherUnit, qty, toUnit}` | normalized unit-conversion rows |
| `itemCategory` | item category; legacy hierarchy conventions exist | category FK; hierarchy should be explicit, not encoded only in display text |
| `cost` | cost | numeric/decimal canonical field |
| `taxType` | cost tax mode: none / inclusive / exclusive | stable code, not UI checkbox state |
| `storePrice` | store price | canonical price field |
| `clinicPrice` | clinic price | canonical price field |
| `notes` | item notes | master text |
| `priceLog[]` | **general item change log**, not only price changes | migrate to structured audit/history; legacy payload may be retained as audit metadata |

Current `priceLog` entries use `{date, type:'combined', changes:[text...]}` and can record name/spec/unit/cost/tax/price changes. The Legacy field name is therefore misleading.

### 4.6 Defect reports

Legacy fields duplicate both customer and item data:

- relationship candidates: `custId`, `itemId`, `sales`;
- duplicated labels: `custNo`, `custshortName`, `itemNo`, `itemName`, `spec`;
- defect data: `reportDate`, `defectDesc`, `handling`, `status`, `logs`.

Status values are currently `已建檔 / 處理中 / 已處理` with emoji presentation embedded in the stored value.

CY Web should keep stable customer/item/employee FKs and, if historical accuracy requires it, store explicitly named snapshots such as `customer_no_snapshot` or `item_name_snapshot`. Accidental duplicate master columns should not remain ambiguous.

### 4.7 Orders

Current Desktop order semantics:

- `orderId`: `O + yyyymmdd + ###`;
- `custId`: customer relation;
- `custNo`, `custshortName`: duplicated customer values;
- `orderDate`: order date;
- `operator`: employee relation, but legacy value can be user ID/name;
- `items[]`: `{ino, iname, spec, qty, unit, price, note}`;
- `flags[]`: document options such as no-price, invoice type and receipt option;
- `status`: order workflow state;
- `erpNo`: external ERP number;
- `history[]`: free-text audit/history;
- `lastUpdate`: last update timestamp.

Order item `ino` is an Item **business number**, not `itemId`. Current Desktop validates it against Items and fills name/spec/unit.

A sales/order line is a legitimate snapshot boundary: item master data can change after the order. The new line should therefore reference `item_id` when available **and** retain clearly named transactional snapshot fields needed to reproduce the original order.

### 4.8 Work logs

Current Desktop field `userName` is semantically incorrect: current saves put `currentUser.userId` into it, while compatibility code also accepts old display names.

Current Desktop content is richer than the old Mobile content. It contains platform/ad entries, categories/quantities, remarks and scores and is used by scoring/history statistics.

Recommended treatment:

- `userName` -> `employee_id` FK;
- work-log header remains relational;
- queryable entries/categories/scores become child rows;
- free-text audit history moves to structured audit events;
- scoring rules become typed configuration, not an opaque object in generic Settings.

### 4.9 Materials is actually BOM / recipe data

The Legacy `Materials` table is misleadingly named. A row represents a finished item and its component parts:

- `materialId`: recipe identity (`MAT####` in current Desktop);
- `finId / finName / finSpec`: finished Item business number/name/spec;
- `finQty / finUnit`: finished quantity/unit;
- `parts[]`: component item number/name/spec/quantity/unit.

The canonical model should use explicit BOM/recipe terminology and stable Item FKs.

### 4.10 Contractors

- `contractorId`: stable Legacy contractor identity (`CON####` in current Desktop);
- `name`: display name;
- `phone`, `addr`, `note`, `inactive`: master attributes;
- `pricing[]`: current Desktop shape `{id, name, spec, unit, price, note}` where `id` is the priced item/business number;
- `logs[]`: free-text history;
- `materialStock`: object keyed by part item number, values include `qty` and `base`.

Contractor stock can be rebuilt from outsourcing supply, receiving consumption and manual adjustments. That makes a stock **movement ledger** a better authoritative model than mutable JSON embedded in Contractor.

### 4.11 Outsourcing orders

Current Desktop order fields:

- `outId`: `M + yyyymmdd + ###`;
- `status`: pending outbound -> outbound -> received -> priced -> paid;
- `operator`: employee relation;
- `contractor`: currently contractor **name**, not ID;
- `orderDate`, `outDate`;
- `partItems[]`: includes recipe ID, finished-item number/name and component item number/name/spec/qty/unit/note;
- `receiving`: nested header/items plus stock-consumption data;
- `pricedData`: nested pricing header/items/total;
- `logs[]`: free-text history;
- `isPriced`: overloaded boolean; also set when payment completes.

`isPriced` is redundant/ambiguous and should not be a canonical source of workflow state. Price existence and stable status code should be authoritative.

Pricing item calculation currently uses receiving item number to find a contractor pricing rule and produces `{id,name,unit,qty,unitPrice,subtotal,note?}`.

### 4.12 Stock adjustments

Current log stores a generated adjustment ID, employee, contractor **name**, finished/part item numbers and names, change type, amount, resulting quantity, reason and a rendered log string.

In CY Web:

- contractor/item relationships should be IDs;
- movement direction/quantity/reason should be structured;
- rendered `logText` should be generated for display, not the authoritative record;
- stock balance should derive from movements (or a clearly documented transactional cache), not from a second independent truth in `materialStock`.

### 4.13 Settings

Current actual Settings keys are:

- `rolePermissions`
- `logCategory`
- `logPlatform`
- `department`
- `itemCategory`
- `sales`
- `customerStatus`
- `logStatus`
- `category`
- `logScoring`

The row-key Sheet mixes lists, objects and authorization configuration. CY Web should split these by semantics:

- lookup/reference data -> relational lookup tables;
- scoring rules -> typed scoring configuration;
- app permissions -> application authorization model;
- obsolete compatibility lists -> drop after migration review.

## 5. Desktop / Mobile divergence matrix

| Area | Current Desktop | Legacy Mobile | Migration decision |
| --- | --- | --- | --- |
| Customer phones | `{num,ext,note}` | saves `{num,ext}` in old path | one shared contract; preserve note |
| Order ID | `Oyyyymmdd###` | old `O + Date.now()` path | use one canonical ID strategy |
| Order fields | current date/operator/spec/unit/note flow | older `orderNo`, reduced item shape | do not port old Mobile data contract |
| Order status | current five-state workflow | older `待處理/修改後待處理` path | canonical state machine, adaptive UI only |
| WorkLog ID | current date+sequence flow | old timestamp + `logNo` path | one canonical ID |
| WorkLog owner | user ID compatibility | display name | employee FK |
| WorkLog content | current row/category/scoring model | old nested string arrays | current business semantics, normalized |
| Item | tax mode + defect subsystem + current categories | older/incomplete feature set | shared current contract |
| Material/BOM | `parts[]`, `MAT####` | old flat `partId/partName/partQty`, timestamp ID | current BOM semantics |
| Contractor | `CON####`, full pricing/stock | old timestamp ID, extra `cell`, reduced pricing | canonical contractor model |

The new CY Web Mobile experience is therefore **not** a port of `js_*_mobile.html`. It is an Adaptive UI over the same API/contracts/data model as Desktop/Tablet.

## 6. Legacy aliases and compatibility fields

The following are migration compatibility inputs, not canonical CY Web names:

| Legacy alias/shape | Canonical interpretation | Action |
| --- | --- | --- |
| `customerNo` | customer business number | map to `customer_no`; then drop alias |
| `custNo` | customer business number | map to `customer_no` |
| `shortName` | customer short name | map to `short_name`; then drop alias |
| `custshortName` | customer short name | map to `short_name` |
| `orderId_m` | outsourcing order ID | import to outsourcing legacy ID; drop alias |
| `materialId_m` | BOM/recipe legacy ID | import; drop alias |
| `contractorId_m` | contractor legacy ID | import; drop alias |
| Mobile `orderNo` | stale order display/number field not in current Sheet schema | only import if value-level profiling proves meaningful data exists |
| Mobile `logNo` | stale separate log number not in current Sheet schema | only import if meaningful data exists |
| Mobile contractor `cell` | field not in current Contractors Sheet schema | do not add blindly; review actual business need |
| old flat Material `partId/partName/partQty` | old pre-`parts[]` BOM shape | compatibility importer only if encountered |

## 7. Canonicalization classification

Every Legacy field will be assigned one of these migration treatments:

- **MASTER** — authoritative attribute on one master entity;
- **FK** — relation to another canonical entity by stable key;
- **CHILD** — normalized one-to-many / many-to-many child rows;
- **SNAPSHOT** — deliberate historical copy, explicitly named `*_snapshot`;
- **LOOKUP** — relation to typed configurable reference data;
- **AUDIT** — structured audit/event history;
- **MIGRATION_ONLY** — legacy identifier/alias retained only for import traceability;
- **DROP** — obsolete/redundant implementation field;
- **OPEN** — business rule still requires explicit decision.

## 8. Important open business decisions

These cannot be settled safely from source code alone:

1. Should `customer_no` be globally unique and immutable after use, or editable with uniqueness enforced?
2. Should `item_no` be immutable after transactional use, or editable with history/alias support?
3. For Orders, Quotes and Defect Reports, exactly which customer/item display fields must be frozen as historical snapshots versus always displaying current master data?
4. Is Contractor always an individual `代工人員`, or can it represent a company/vendor? This affects naming/contact structure, not the FK principle.
5. Should customer region remain free/configured text, or become a managed lookup/hierarchy?
6. Which existing user-defined statuses/categories must remain administrator-editable in CY Web?

These questions should be asked in business language during schema review; the user does not need to interpret Legacy backend field names.

## 9. Next audit step

Before D1 migration code is written:

1. perform value-level **read-only** profiling for row counts, nullability, duplicate business numbers, orphan references and encountered legacy aliases;
2. finalize the Canonical Data Dictionary and ER model;
3. define import transformations and explicit snapshot policy;
4. only then write D1 forward migrations and a repeatable Sheets -> D1 dry-run importer.

No legacy Sheet/deployment should be modified or retired during this phase.
