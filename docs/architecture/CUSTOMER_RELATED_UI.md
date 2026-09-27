# CY Web Customer Related-Record UI Foundation

> Status: Customer related-record presentation + interaction review foundation.

## 1. Purpose

Customer already uses the approved left Search Pane + right Detail Pane master-record layout. This document defines the visual/interaction contract for contextual records shown below the Customer profile:

- Visits;
- Customer-Item Quote history;
- Frequent Items;
- concise future Audit/History.

The related area is not the old GAS `頁內表單` reproduced under a new name. It is a new-Web contextual-record surface using shared primitives, shared interaction mechanics and on-demand data contracts.

## 2. Shared component boundary

`RelatedRecordPanel` owns only reusable interaction structure:

- accessible tab list;
- active-tab state presentation;
- optional count/badge;
- optional header action area;
- one content panel.

It does **not** know Customer/Item/Contractor business semantics. Domain modules supply their own tabs, actions and content.

Related-record editing reuses existing shared primitives instead of creating Customer-only infrastructure:

- `Drawer` for dense Desktop editing, naturally becoming full-width on narrow screens;
- `ConfirmDialog` for destructive/discard confirmation;
- `EntityPicker` when an explicit formal entity relation must be selected;
- shared editable-list state for repeated rows such as quote price breaks and Frequent Items;
- shared Toast feedback;
- shared unsaved-change guard.

## 3. Customer composition

The Customer related tabs remain inside the selected Customer Detail Pane:

```text
Customer Detail
├─ profile / contact / address / notes
└─ RelatedRecordPanel
   ├─ 拜訪紀錄
   ├─ 報價紀錄
   ├─ 常用商品
   └─ 動態 / 歷史
```

Switching tabs must not reload the Customer master or the whole application. Production data is queried only for the selected related resource.

## 4. Visit presentation and interaction

Visit history is a compact chronological timeline/list rather than a disabled form.

Visible hierarchy:

- visit date;
- visit-time person snapshot;
- recording employee;
- visit content.

The UI treats `person_snapshot` as historical display text. Later Contact renames/deactivation do not rewrite what was recorded for the Visit.

Interaction review behavior:

- `新增拜訪` opens the shared Drawer;
- existing rows expose a restrained `修改` action;
- Contact linking is optional and Customer-scoped;
- when the user explicitly selects a Contact, its current display name may seed the visit-time snapshot, which remains editable as the historical person text;
- free-text person remains valid when the person is not an existing Contact;
- delete requires confirmation and the production service records the deletion through shared Audit;
- unsaved Drawer content cannot be discarded silently.

Long Visit history uses server pagination/on-demand loading rather than preloading every Visit with Customer detail.

## 5. Quote-history presentation and interaction

Customer Quote history is explicitly a Customer + Item price-history surface, not a formal quotation document.

A quote card emphasizes:

- quote date;
- Item number/name snapshot;
- employee;
- quantity / unit / unit-price breaks.

Multiple records for the same Customer + Item remain chronologically visible.

The UI deliberately distinguishes two actions:

### New commercial quote

`新增報價紀錄` means a genuinely new price/condition and therefore creates a new history record. It requires the user to explicitly select the formal Item and enter one or more quantity/unit/unit-price breaks.

### Existing-record correction

`修正紀錄` is only for correcting a factual/input error in an existing historical record. The Drawer explains that a new commercial price must not use this path. Production correction uses `expectedRevision` and structured before/after Audit in the same transaction.

The interaction does not expose Quote hard-delete. Current confirmed history semantics are preservation + explicit audited correction.

## 6. Frequent Item presentation and interaction

Frequent Items visually distinguish:

- formal Item relation;
- free-text / unfiled customer intelligence.

The edit Drawer uses one shared repeated-row interaction. Each row has exactly one identity mode.

For a formal Item, the user explicitly selects the intended Item through `EntityPicker`; typing a similar name is not enough to create the relationship. For an unfiled row, free text stays free text. A free-text row becomes formal only after the user explicitly selects a formal Item, preserving BD-039.

This design avoids both accidental identity guessing and separate per-row custom lookup implementations.

## 7. Audit / history presentation

The current `動態 / 歷史` tab remains deliberately restrained until authenticated Audit API integration exists.

Ordinary Customer edits are not shown as an unlimited field-change feed. The future concise timeline surfaces meaningful Audit Core events plus current latest-modifier metadata according to BD-053/054.

## 8. Adaptive UI

Desktop shows the related panel at full Detail-Pane width and uses a side Drawer for dense entry.

Tablet/Mobile reuse the same related-resource state and components:

- tabs remain horizontally scrollable where needed;
- quote/frequent layouts collapse naturally;
- Visit timeline remains readable;
- Drawer becomes full-width on narrow screens under the shared overlay CSS;
- there is no separate Mobile business implementation.

## 9. Review route

During foundation development, `#customer-related-preview` mounts an interaction review using fictional browser-local data.

The user can currently test:

- Visit create/edit/delete + discard confirmation;
- Quote new-history create + explicit correction flow;
- repeated quote price-break editing;
- Frequent Item formal/free-text editing;
- explicit Item EntityPicker selection;
- Toast and unsaved-change behavior.

This is **not a production route**. It does not:

- call protected Customer APIs;
- write D1;
- represent production data;
- bypass Shared Identity;
- freeze final colors/branding.

The production Customer screen later embeds the same shared `RelatedRecordPanel` and domain interaction composition into the Customer Detail Pane when protected API wiring is available.
