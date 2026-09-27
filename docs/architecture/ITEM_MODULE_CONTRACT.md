# CY Web Item Module Contract

> Status: first business/service contract for Item master before protected HTTP route wiring.

## 1. Scope

This stage defines the first Item master service boundary using the confirmed CY Web data model and validated Legacy behavior. Legacy Item remains workflow evidence only; the new UI/service is not a GAS screen replica.

Initial Item scope:

- Item search/list;
- Item detail;
- Item create/register using an already-existing SMART ERP Item number;
- ordinary Item profile edit;
- unit-conversion graph edit;
- controlled Item-number change with history + Audit;
- historical Item-number search;
- later Defect records in the same Item business workspace, but Defect mutations remain the next slice.

## 2. Identity and ERP boundary

Per BD-004/005/011/052:

- `items.id` is the immutable CY Web relationship key;
- `item_no` is a SMART ERP business identifier, not a foreign key;
- CY Web never generates a formal SMART ERP Item number;
- before direct ERP integration exists, creating/registering an Item in CY Web requires the operator to enter an existing ERP Item number;
- ordinary Item edit does not directly overwrite `item_no`;
- Item-number change uses a dedicated controlled action;
- old Item numbers remain searchable through `item_number_history` until explicitly retired in a future controlled operation.

## 3. Item profile

Initial profile follows the existing schema:

- Item number;
- name;
- spec;
- base unit;
- Item category;
- cost;
- cost tax mode;
- store reference price;
- clinic reference price;
- notes;
- active/inactive state;
- revision and last-modified metadata.

Exact SMART ERP ownership of every non-number field remains deferred to the future ERP integration project. The initial Web system uses the validated business fields now rather than blocking on future ERP schema investigation.

## 4. Decimal and money representation

Per BD-017 through BD-019:

- quantity supports up to 4 decimal places;
- unit price/cost supports up to 4 decimal places;
- authoritative D1 storage uses scaled INTEGER values;
- API/shared contracts use decimal strings so browser/JSON floating-point behavior does not become authoritative;
- Item `cost`, `store_price`, `clinic_price` use the shared scaled4 parser/formatter;
- formal document totals remain governed separately by the money2/document-rounding rules.

## 5. Unit conversion model

The new relational model preserves the useful Legacy conversion behavior while removing page-local JSON logic.

Each conversion means:

```text
1 <fromUnit> = <quantity> <toUnit>
```

A conversion may point directly to the Item base unit or to another defined conversion unit. The entire graph must resolve to the base unit.

Server validation rejects:

- zero/negative quantity;
- duplicate `fromUnit` definitions;
- `fromUnit == baseUnit`;
- `fromUnit == toUnit`;
- target units with no definition unless the target is the base unit;
- cycles that cannot resolve to the base unit.

The old Legacy UI limit of five rows is not treated as a business rule. The service uses a bounded safety limit while the final UI may choose an appropriate interaction design.

## 6. Search and historical numbers

Item search is server-side / D1 on demand. Keyword matching includes:

- current Item number;
- Item name;
- spec;
- Item category name;
- searchable historical Item numbers.

The browser does not preload the entire Item master.

## 7. Create and ordinary update

### Create/register

Requires:

- existing ERP Item number;
- Item name;
- base unit;
- valid active category when a category is supplied;
- valid fixed-point values;
- a valid unit-conversion graph.

Current Item number remains uniquely constrained by D1.

### Ordinary update

- uses `expectedRevision` optimistic concurrency;
- may update Item profile and conversion graph;
- does not accept Item-number overwrite;
- retains an already-used category if that lookup was later disabled, but changing to a different category requires an active category;
- ordinary field edits retain latest-modified metadata and do not create a detailed Audit event by default under BD-053.

## 8. Controlled Item-number change

Changing the current ERP Item number is a meaningful business action:

1. validate `expectedRevision`;
2. require a different non-empty new Item number;
3. reject collision with another current Item number;
4. move the old current number into `item_number_history` with its validity range;
5. update `items.item_no` and revision;
6. write `item.number.changed` through the shared Audit Core;
7. execute history insert + Item update + Audit in one D1 batch transaction.

The old number remains searchable by default.

## 9. Item deletion / retirement

No universally enabled hard-delete operation is introduced in this slice.

BD-030 remains authoritative:

- an Item may be hard-deleted only while truly never referenced by retained business/history data;
- once referenced, Item identity remains;
- removal from normal selection uses inactive/retired semantics or future ERP lifecycle rules;
- final delete eligibility must be server-derived, not a UI-only decision.

## 10. Defect boundary

Defect is related to Item but is not stored inside the Item aggregate. It has its own lifecycle and references both Customer and Item.

Confirmed next-slice semantics already exist:

```text
created -> processing -> resolved
resolved --explicit reopen--> processing
```

Edit/delete rules follow BD-028/033. Defect list/mutations will be added as an on-demand related domain, reusing Customer/Item pickers and shared Audit/history behavior where applicable.

## 11. Runtime boundary

This foundation does not yet expose protected Item HTTP routes and does not write production D1. Route wiring remains behind the established Shared Identity browser-session and local/dev Worker+D1 acceptance gates.
