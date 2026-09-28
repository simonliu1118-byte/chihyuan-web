# Legacy Desktop Workflow Audit

> Project: Chihyuan Enterprise Management System (CY Web)
>
> Status: verified Legacy behavior inventory for architecture review. This is not a governance rules source and is not yet the final D1 schema.

## 1. Purpose and authority

This audit re-reads Legacy behavior from the Desktop HTML/JavaScript together with the shared GAS backend. It supplements the earlier data-model audit by focusing on **workflow**, **reversals**, **edit/delete boundaries**, **permissions**, **cross-module side effects**, and **audit/history semantics**.

Per BD-025, Legacy Desktop is the primary Legacy behavioral reference. Legacy Mobile was stopped partway through development and is useful only as supplemental evidence when it does not conflict with Desktop behavior or a later confirmed business decision.

The authority order is:

1. current explicit user decisions;
2. confirmed CY Web Business Decisions;
3. Legacy Desktop + shared backend behavior;
4. Legacy Mobile only when compatible with the above.

## 2. Cross-cutting Legacy behavior

### 2.1 UI lifecycle

The Desktop modules consistently use explicit view/add/edit state machines. While a form is being edited, navigation/search is generally locked until the user saves or cancels.

This is a useful UX invariant to preserve semantically, although CY Web does not need to copy the exact old JavaScript state constants.

### 2.2 Authorization

Legacy combines two authorization layers:

- configurable module access through `rolePermissions`;
- hard-coded operation checks inside modules, especially for admin-only delete/review operations and owner-only WorkLog actions.

New CY Web should preserve the intended business restrictions but express them through app permissions rather than permanently binding behavior to the old `admin/staff/sales/warehouse` role names.

### 2.3 Audit is intentional, not incidental

Legacy contains several different traceability mechanisms. They are not semantically interchangeable.

#### Central deletion audit

A shared `_saveDeleteLog()` records timestamp, user ID and action text through the GAS `DeleteLogs` mechanism. Customer, Visit, Quote, Item, Defect, WorkLog, Material/BOM, Contractor, Outsourcing Order, receiving-data deletion and pricing-data deletion invoke this mechanism.

The earlier live-Sheet header profile did not find a current `DeleteLogs` sheet at that time, so migration must not assume historical rows exist. The source behavior nevertheless demonstrates an intentional centralized delete-audit design.

#### Domain histories

Several entities carry their own business-event history:

- `Orders.history` — work-order creation/edit, ERP-number handoff and fulfillment status changes;
- `WorkLogs.history` — create/edit, submit/withdraw review, score approval/cancellation;
- `Outsourcing.logs` — create/edit, lifecycle transitions, receiving, pricing, payment and reversals;
- `DefectReports.logs` — creation and handling-status transitions.

These are not merely generic CRUD logs. They explain the entity lifecycle and should remain queryable as domain history in the new system.

#### Structured stock-adjustment ledger

`StockAdjustLogs` is already closer to a proper business ledger: it records an adjustment ID, date, operator, contractor, finished/part references, change type, amount, resulting quantity, reason and display text.

The new canonical stock-movement model should preserve these structured facts rather than reducing them to a string-only audit event.

#### Item change history

Legacy `Items.priceLog` is misnamed. It records a combined change entry for selected Item changes, including:

- unit-conversion changes;
- cost changes;
- store-price changes;
- clinic-price changes;
- tax-mode changes.

The current entry stores the date and change descriptions but not a stable actor ID. CY Web should treat this as evidence that Item commercial/unit changes require history, while improving the canonical event structure.

### 2.4 Audit gaps in Legacy

Some important changes are not comprehensively audited in the old implementation:

- ordinary Customer edits;
- Visit edits;
- Quote edits (deletion is logged, edits are not historically versioned);
- Frequent-item edits;
- some Defect field edits beyond status changes;
- Settings / scoring-configuration edits;
- user/permission changes.

New CY Web may deliberately improve these gaps. Preserving Legacy semantics does not require preserving missing audit coverage.

## 3. Customer domain

### 3.1 Customer master

Desktop Customer has five functional areas: search, Customer master, Visit/contact history, customer-item Quote history, and frequent products.

Observed Customer-master behavior:

- hidden `custId` supplies stable Legacy identity;
- `custNo` may be blank;
- short name and full name are required;
- Taiwan tax ID is validated when supplied;
- phone/fax/mobile formatting and validation are built in;
- multiple phones, contacts and addresses are supported;
- category, geographic region, responsible department, salesperson and customer status are separate concepts;
- up to three highlighted important notes are displayed prominently;
- customers whose status contains `已歇業` are sorted after active customers in search results;
- ordinary editing is allowed after load;
- hard delete is admin-only and invokes central deletion audit.

Confirmed CY Web decisions already intentionally refine this model: immutable internal IDs, nullable ERP customer numbers, configurable customer statuses with protected `已歇業`, region/ownership separation, duplicate-tax-ID warning rather than uniqueness, and normalized phone/contact/address children.

### 3.2 Visit/contact history

Observed Desktop behavior:

- Visits belong to a Customer;
- date and content are required;
- `person` is free-text;
- responsible salesperson is stored;
- Visit IDs are sequential per customer in the Legacy readable format;
- records can be added, edited and deleted;
- deletion uses central DeleteLogs;
- ordinary edits do not create their own historical before/after event.

BD-015 intentionally upgrades this by allowing optional `contact_id` linkage while preserving the free-text person snapshot.

### 3.3 Customer-item Quotes

Observed Desktop behavior matches BD-020 through BD-022:

- one Quote record belongs to one Customer and one Item context;
- one Quote can contain multiple quantity/unit/price/note breaks;
- history is grouped by item number and ordered newest-first;
- repeated quotations are separate historical records rather than one formal multi-item quotation document;
- old quotations can be edited or deleted in Legacy;
- deletion is centrally audited, but ordinary edits are not versioned.

CY Web intentionally tightens the correction rule: a true new quotation creates a new history record; correcting an input mistake may edit the original record but must produce structured audit.

### 3.4 Frequent products

Desktop supports both:

- an existing formal Item; and
- an unfiled free-text product labelled as unfiled.

This confirms BD-023. These records are customer intelligence, not an alternate Item master.

## 4. Sales work-order domain

The Desktop Order module is a complete pre-ERP-to-shipment workflow, not merely an ERP-order viewer.

Verified lifecycle:

```text
created / 已建檔
        ↓ ERP formal order created + ERP number filled back
issued / 已出單
        ├──────────────→ picked / 已撿貨
        ↓
waiting_stock / 等到貨
        ↓
picked / 已撿貨
        ↓
shipped / 已出貨
```

Key behavior:

- a salesperson/employee creates the CY Web/Legacy work order;
- the work order contains customer, item, quantity, unit, price, note and print/invoice/receipt instructions;
- ordinary commercial editing is permitted while status is `已建檔`;
- the first ERP-number fill automatically moves the work order to `已出單`;
- fulfillment actions require an ERP number;
- `等到貨` is optional;
- only `已撿貨` can advance to `已出貨`;
- Legacy supports cancelling shipment from `已出貨` back to `已撿貨`;
- loaded work-order deletion is admin-only and Legacy prevents deleting an already shipped work order;
- `history` records create/edit, ERP-number and fulfillment events;
- hard deletion invokes central DeleteLogs.

BD-024 now captures this boundary: CY Web owns the field/pre-ERP work order and fulfillment workflow; SMART ERP owns the authoritative formal sales-order document and ERP order number.

The user additionally confirmed that shipment reversal must remain available as a controlled action with permission and audit.

Legacy Mobile has older `待處理` / `修改後待處理` and `orderNo` remnants. Those are not the migration contract.

## 5. Item and Defect domains

### 5.1 Item master

Desktop Item supports:

- Item number, name, spec and base unit;
- hierarchical category presentation;
- unit conversions;
- cost and tax mode;
- store and clinic reference prices;
- notes;
- add/edit and admin-only delete;
- selective change history in `priceLog`;
- Defect reporting linked from Item context.

The existing Legacy CRUD behavior is descriptive history, not a reason to reverse BD-004. Under the confirmed target architecture, a **formal Item must first exist in SMART ERP**. A later decision still needs to classify which Item fields are ERP-owned synchronized fields and which remain CY Web extension fields editable in Web.

### 5.2 Defect reports

Verified Desktop workflow codes map from:

```text
created     / 已建檔
processing  / 處理中
resolved    / 已處理
```

Observed behavior:

- report date and defect description are required;
- report stores Customer, salesperson and Item context;
- records can be edited;
- quick status buttons append a domain log with actor/date;
- status buttons also permit moving an already handled record back to `處理中` in the current Legacy UI;
- a new report adds an initial log entry;
- ordinary non-status edits do not append a detailed change event;
- hard delete is admin-only and invokes central DeleteLogs.

Whether `resolved -> processing` should remain an ordinary reversible transition requires explicit CY Web confirmation rather than automatic copying.

## 6. Outsourcing / material workflow

### 6.1 Main outsourcing lifecycle

Desktop defines a five-stage lifecycle:

```text
pending_outbound / 待出庫
        ↓
outbound / 已出庫
        ↓
received / 已入庫
        ↓
priced / 已計價
        ↓
paid / 已付款
```

The search view exposes these as operational actions: outbound, receiving, pricing and payment.

### 6.2 Outbound and order editing

Observed behavior:

- creating/editing the outsourcing order appends to `logs`;
- moving to `已出庫` records an outbound date and a lifecycle log;
- the order may still be edited after outbound while there is no receiving data and it is not paid;
- stock contributions are recalculated when the order changes, including contractor changes;
- the main order becomes non-editable after receiving exists;
- a paid order cannot be edited or hard-deleted.

Legacy permits hard-deleting a non-paid outsourcing order and performs stock compensation before deletion. Because this can erase an entity after real stock movements occurred, CY Web should not freeze this rule without explicit confirmation.

### 6.3 Receiving

Receiving is more than a status flag:

- only an outbound order can enter receiving from the main action;
- receiving records date, operator and received items;
- saving receiving moves status to `已入庫` and appends a domain log;
- component usage is calculated and deducted from contractor material stock;
- editing receiving first restores the previous consumption, then applies the newly calculated consumption;
- receiving can be deleted before pricing/payment, which restores consumed stock, removes receiving data and returns the order to `已出庫`;
- deletion is recorded both in the outsourcing domain log and the centralized delete audit.

### 6.4 Pricing and payment

Observed behavior:

- pricing becomes available after receiving;
- saving pricing stores date, operator, item quantity/unit-price/subtotal/note data and total, changes status to `已計價`, and appends a log;
- pricing can be edited while not paid;
- pricing can be deleted while not paid, returning the order to `已入庫` and recording domain/delete audit;
- payment changes status to `已付款`;
- payment can be cancelled, returning the order to `已計價` and appending a domain log.

These are deliberate reversible business operations and should be modeled as explicit transitions/events rather than silent row rewrites.

### 6.5 Contractor master

Desktop Contractor behavior includes:

- add/edit;
- active/inactive lifecycle;
- contractor-specific pricing;
- contractor material stock;
- domain `logs` for add/edit/deactivate/reactivate;
- admin-only hard delete with centralized delete audit.

BD-007 intentionally generalizes the future entity so it may represent a person or organization and removes contractor-name-as-FK coupling.

### 6.6 BOM / material mapping

Legacy `Materials` is a finished-item-to-component recipe/mapping function, not a generic material master. Desktop supports add/edit and admin-only delete.

It does not have the same rich entity history as outsourcing orders; delete uses centralized DeleteLogs.

### 6.7 Contractor stock

Legacy stock behavior demonstrates three distinct business facts:

1. material supplied/outbound to contractor;
2. material consumed through receiving calculations;
3. manual stock adjustment.

Manual adjustments already have structured `StockAdjustLogs` including reason and resulting balance. The dashboard can rebuild contractor stock from operational data and adjustments.

This supports the canonical direction that stock movements, not an opaque mutable balance, should be authoritative.

## 7. WorkLog / scoring workflow

Desktop WorkLog is a controlled review workflow, not just a free-form note table.

Verified lifecycle:

```text
created / 已建檔
      ↓ owner submits
pending_review / 待審核
      ↓ admin scores/reviews
reviewed / 已審核
```

Observed permissions and reversals:

- the creator/owner can edit only while `已建檔`;
- the creator/owner can delete only while `已建檔`; admin may also delete in that state;
- the owner can submit `已建檔 -> 待審核`;
- the owner can withdraw `待審核 -> 已建檔`;
- an admin can enter scoring/review while `待審核`;
- saving the review stores scores/remarks and moves to `已審核`;
- an admin can cancel an approved review, which clears scores/review remarks and returns it to `待審核`;
- create/edit/submit/withdraw/review/cancel-review operations append `history`;
- hard delete invokes centralized DeleteLogs;
- scoring configuration is admin-editable;
- history statistics query the stored logs/scores.

BD-012 remains compatible with this general pattern: finalized scores are frozen historical values during normal reporting. The Legacy explicit `取消審核` path is a controlled reopening operation, not an automatic retroactive recalculation. The exact CY Web correction/reopen policy still needs confirmation before implementation.

## 8. Settings / Admin

Desktop supports configurable:

- module permissions per Legacy role;
- customer categories/statuses;
- departments;
- sales-related lookups;
- Item categories;
- WorkLog categories/platforms;
- WorkLog scoring configuration;
- users, role, department and active/inactive state.

The configurable behavior supports BD-010 and BD-013. However, Legacy does not consistently audit Settings, permission, scoring-rule or user changes. CY Web should treat this as an audit gap to improve, especially because these settings can change future business behavior.

## 9. Reconciliation against current CY Web decisions

This Desktop-first pass found one previously material misunderstanding: the Order domain. BD-024 has already been corrected.

The remaining confirmed Business Decisions are not invalidated by this workflow review. Several are intentional improvements over Legacy rather than literal copies, including:

- formal Item authority moving to SMART ERP;
- normalized IDs/FKs;
- customer tax-ID duplicate warning policy;
- optional Contact linkage for Visits;
- stricter Quote correction audit;
- normalized Contractor identity;
- score-snapshot policy;
- fixed/protected `已歇業` semantics.

## 10. Items requiring explicit follow-up

The following Legacy behaviors should be decided one at a time before final schema/workflow freeze:

1. **Outsourcing hard delete after stock activity** — Legacy allows deleting any non-paid outsourcing order and compensates stock. Decide whether CY Web should instead prohibit hard delete once outbound/receiving activity exists and require explicit reversal/cancellation.
2. **Defect reopening** — Legacy permits `已處理 -> 處理中`. Decide whether this remains a normal transition or requires a dedicated reopen action/permission.
3. **WorkLog review reopening** — Legacy admin can cancel an approved review, clear scores and return to pending. Confirm the target permission/audit policy.
4. **Item field ownership after ERP integration** — classify ERP-owned Item fields versus CY Web extension fields.
5. **Audit coverage upgrade** — define which Customer/Visit/Quote/Settings/User changes require structured before/after audit beyond Legacy coverage.

These questions should be resolved sequentially rather than inferred from old implementation quirks.
