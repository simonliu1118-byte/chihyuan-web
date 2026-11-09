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

Historical Item rows may contain chained definitions, where the entire graph must resolve to the base unit. The existing rational conversion reader keeps those records usable. Under BD-058, all **new or updated** conversion rows must be direct: `toUnit == baseUnit`; a later save writes flattened rows.

Server validation of new mutations rejects:

- zero/negative quantity;
- duplicate `fromUnit` definitions;
- `fromUnit == baseUnit`;
- `toUnit != baseUnit` (single-layer rule, no new conversion chains).

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

### BD-058: Direct-to-base unit conversions (V0.9.15)

- Every newly created/updated conversion is exactly `1 fromUnit = quantity baseUnit`.
- `toUnit` must equal the Item's current `baseUnit`; duplicate `fromUnit` and a base unit reused as `fromUnit` are rejected server-side.
- Older chained conversion rows are still **readable** using the existing exact rational `unitFactorToBase` traversal; the Item UI flattens every visible source to the base unit and submits only canonical direct-to-base entries on the next edit.
- These rules are a forward validation change only; there is no data migration or change to inventory transaction semantics.


## V0.16.0 商品表格式單據與價格
- 商品詳情、新增、編輯共用 `src/ui/forms/RecordSheet.tsx`，由 `item/ItemSheet.tsx` 同一 render owner 提供兩列欄位：品號／品名／規格／基準單位含換算；分類／成本／成本稅別／門市／診所／批發／網路價。備註列位於表格下方；第一列的品名與規格同寬。
- 網路價以共用 `InlineGridField` 管理，每個平台單獨可空白；批發價為多個單位及價格，皆與商品版本鎖同一 mutation batch。任何價格增刪改依項目產生 `item.price.changed` Audit 記錄，曾用品號移到修改紀錄視窗。
- 新表 `item_web_platforms`（名稱唯一、順序、啟用、六個預設值）、`item_online_prices`（複合主鍵 item/platform）、`item_wholesale_prices`（item/unit 唯一）。價格和既有 items.cost 一律保存 scaled4 整數；百分之五含稅只由檢視 UI 計算，資料庫不儲存。
- 平台設定路由 `/api/admin/settings/lookups/item_platform`（建立／PATCH／排序）僅 SUPER_ADMIN；Item API `/api/business/items/platforms`、`/:id/price-history` 需 ITEMS 模組權限。停用平台不得新增未存在價格，既有價格仍可展示與編輯。
- 商品側邊入口同時提供 ITEMS/DEFECTS 權限的主頁，頁內二分頁；各自的權限獨立檢查，舊 `#defects` 深連結不變。瑕疵原版面及業務處理不在本次範圍。
- migration `0061_item_price_tables` 同步 portable backup schema/seed guard，舊備份缺新表以預設種子和空表對應。
